import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  ApiError,
  asUuid,
  bearerToken,
  corsHeaders,
  errorResponse,
  isOriginAllowed,
  json,
  readJson,
  requireEnv,
  requireMethod,
} from '../_shared/http.ts';
import { SYSTEM_PROMPT, buildUserPrompt } from '../_shared/prompt.ts';
import {
  buildAnalysis,
  isCategory,
  mapPriceReference,
  parseModelAssessment,
} from '../_shared/analysis.ts';
import { callProvider, getProviderConfig } from '../_shared/providers.ts';
import type { PriceReference } from '../_shared/cost.ts';

const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const FREE_ATTEMPTS = 2;
const PREMIUM_ATTEMPTS = 4;

type DiagnosisRow = {
  id: string;
  user_id: string;
  status: string;
  category: string;
  description: string;
  brand: string | null;
  model: string | null;
  error_code: string | null;
  item_age_years: number | string | null;
  currency: string;
  locale: string;
  analysis: unknown;
  analysis_attempts: number;
  completed_at: string | null;
};

type Usage = {
  plan: 'free' | 'premium';
  used: number;
  limit: number;
  remaining: number;
  periodStart: string;
  periodEnd: string;
};

function base64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

async function resolvePlan(admin: SupabaseClient, userId: string): Promise<'free' | 'premium'> {
  const { data } = await admin
    .from('entitlements')
    .select('status,current_period_end')
    .eq('user_id', userId)
    .eq('entitlement', 'premium')
    .maybeSingle();
  if (!data || data.status !== 'active') return 'free';
  if (data.current_period_end && new Date(data.current_period_end).getTime() <= Date.now()) {
    return 'free';
  }
  return 'premium';
}

async function loadUsage(admin: SupabaseClient, userId: string): Promise<Usage> {
  const plan = await resolvePlan(admin, userId);
  const limit = plan === 'premium' ? 30 : 5;
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const { count } = await admin
    .from('usage_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('event_type', 'diagnosis_used')
    .gte('created_at', start.toISOString())
    .lt('created_at', end.toISOString());
  const used = count ?? 0;
  return {
    plan,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
  };
}

async function loadReferences(
  admin: SupabaseClient,
  category: string,
  currency: string,
): Promise<PriceReference[]> {
  const { data, error } = await admin
    .from('price_references')
    .select(
      'id,category,currency,region,part_name,cause_keywords,min_price,max_price,includes_parts,includes_labor,labor_hours_min,labor_hours_max,labor_rate_per_hour,source_name,source_url,verified_at',
    )
    .eq('category', category)
    .eq('currency', currency)
    .order('verified_at', { ascending: false })
    .limit(200);
  if (error) {
    console.error('price_references query failed', error.message);
    return [];
  }
  return (data ?? []).map((row) => mapPriceReference(row as never));
}

async function markFailed(
  admin: SupabaseClient,
  diagnosisId: string,
  error: unknown,
  reassess: boolean,
): Promise<void> {
  const code = error instanceof ApiError ? error.code : 'ai_failed';
  const message =
    error instanceof ApiError ? error.message.slice(0, 500) : 'The analysis could not be completed';
  // A failed reassessment must not destroy the previous completed analysis or
  // consume the user's reassessment allowance. A failed first analysis becomes
  // retryable and keeps analysis_attempts unchanged.
  await admin
    .from('diagnoses')
    .update(
      reassess
        ? {
            status: 'completed',
            failure_code: null,
            failure_message: null,
          }
        : {
            status: 'failed',
            failure_code: code,
            failure_message: message,
          },
    )
    .eq('id', diagnosisId)
    .eq('status', 'analyzing');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) });
  }

  let admin: SupabaseClient | null = null;
  let diagnosisId = '';
  let reassess = false;

  try {
    requireMethod(req, 'POST');
    if (!isOriginAllowed(req)) {
      throw new ApiError('forbidden', 'This origin is not allowed', 403);
    }

    const supabaseUrl = requireEnv('SUPABASE_URL');
    const anonKey = requireEnv('SUPABASE_ANON_KEY');
    const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
    const token = bearerToken(req);

    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    if (userError || !userData.user) {
      throw new ApiError('unauthorized', 'Sign in again to continue', 401);
    }
    const userId = userData.user.id;

    const body = await readJson<{ diagnosisId?: unknown; reassess?: unknown }>(req);
    diagnosisId = asUuid(body.diagnosisId, 'diagnosisId');
    reassess = body.reassess === true;

    admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: diagnosis, error: diagnosisError } = await admin
      .from('diagnoses')
      .select(
        'id,user_id,status,category,description,brand,model,error_code,item_age_years,currency,locale,analysis,analysis_attempts,completed_at',
      )
      .eq('id', diagnosisId)
      .eq('user_id', userId)
      .maybeSingle<DiagnosisRow>();

    if (diagnosisError) throw new ApiError('not_found', 'Diagnosis could not be loaded', 404);
    if (!diagnosis) throw new ApiError('not_found', 'Diagnosis not found', 404);
    if (!isCategory(diagnosis.category)) {
      throw new ApiError('invalid_input', 'Diagnosis category is invalid', 400);
    }

    if (diagnosis.status === 'completed' && !reassess) {
      return json(req, {
        analysis: diagnosis.analysis,
        usage: await loadUsage(admin, userId),
        diagnosisId,
        idempotent: true,
      });
    }

    if (diagnosis.status === 'analyzing') {
      throw new ApiError('conflict', 'An analysis is already running for this diagnosis', 409);
    }
    if (reassess && diagnosis.status !== 'completed') {
      throw new ApiError('invalid_input', 'Only a completed diagnosis can be reassessed', 400);
    }

    const plan = await resolvePlan(admin, userId);
    const maxAttempts = plan === 'premium' ? PREMIUM_ATTEMPTS : FREE_ATTEMPTS;
    const maxImages = plan === 'premium' ? MAX_IMAGES : 2;
    if (diagnosis.analysis_attempts >= maxAttempts) {
      throw new ApiError(
        'rate_limited',
        'The reassessment limit for this diagnosis was reached',
        429,
      );
    }

    if (!reassess) {
      const { data: claim, error: claimError } = await admin.rpc('claim_diagnosis_usage', {
        p_user_id: userId,
        p_diagnosis_id: diagnosisId,
      });
      if (claimError) {
        console.error('usage claim failed', claimError.message);
        throw new ApiError(
          'quota_exceeded',
          'The monthly diagnosis limit could not be verified',
          429,
        );
      }
      if (!claim?.allowed) {
        throw new ApiError('quota_exceeded', 'The monthly diagnosis limit was reached', 429, {
          plan: claim?.plan,
          used: claim?.used,
          limit: claim?.limit,
        });
      }
    }

    const expectedAttempts = diagnosis.analysis_attempts;
    const { data: claimed, error: claimUpdateError } = await admin
      .from('diagnoses')
      .update({
        status: 'analyzing',
        failure_code: null,
        failure_message: null,
      })
      .eq('id', diagnosisId)
      .eq('user_id', userId)
      .eq('status', diagnosis.status)
      .eq('analysis_attempts', expectedAttempts)
      .select('id')
      .maybeSingle();

    if (claimUpdateError || !claimed) {
      throw new ApiError('conflict', 'Another analysis started for this diagnosis', 409);
    }

    const { data: imageRows, error: imagesError } = await admin
      .from('diagnosis_images')
      .select('storage_path,mime_type,position')
      .eq('diagnosis_id', diagnosisId)
      .order('position', { ascending: true })
      .limit(maxImages);

    if (imagesError) {
      throw new ApiError('storage_failed', 'The diagnosis photos could not be loaded', 502);
    }
    if (!imageRows || imageRows.length === 0) {
      throw new ApiError('invalid_input', 'At least one diagnosis photo is required', 400);
    }

    const images: { data: string; mimeType: string }[] = [];
    for (const row of imageRows) {
      const { data: blob, error: downloadError } = await admin.storage
        .from('diagnosis-images')
        .download(row.storage_path);
      if (downloadError || !blob) {
        throw new ApiError('storage_failed', 'A diagnosis photo could not be downloaded', 502);
      }
      if (blob.size > MAX_IMAGE_BYTES) {
        throw new ApiError('image_too_large', 'A diagnosis photo is too large', 413);
      }
      images.push({
        data: base64(await blob.arrayBuffer()),
        mimeType: row.mime_type,
      });
    }

    const provider = getProviderConfig();
    const output = await callProvider({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: buildUserPrompt({
        category: diagnosis.category,
        description: diagnosis.description,
        brand: diagnosis.brand,
        model: diagnosis.model,
        errorCode: diagnosis.error_code,
        itemAgeYears: diagnosis.item_age_years === null ? null : Number(diagnosis.item_age_years),
        locale: diagnosis.locale,
        imageCount: images.length,
        currency: diagnosis.currency,
      }),
      images,
      locale: diagnosis.locale,
      category: diagnosis.category,
    });

    const assessment = parseModelAssessment(output.text);
    const references = await loadReferences(admin, diagnosis.category, diagnosis.currency);
    const analysis = buildAnalysis({
      assessment,
      sourceText: diagnosis.description,
      locale: diagnosis.locale,
      currency: diagnosis.currency,
      region: Deno.env.get('PRICE_REGION')?.trim() || 'global',
      references,
      provider: { name: provider.name, model: output.model, mode: output.mode },
    });

    const completedAt = new Date().toISOString();
    const { error: completeError } = await admin
      .from('diagnoses')
      .update({
        status: 'completed',
        analysis,
        safety_level: analysis.safety.risk_level,
        repairability: analysis.repairability.verdict,
        provider_name: analysis.provider.name,
        provider_model: analysis.provider.model,
        provider_mode: analysis.provider.mode,
        schema_version: analysis.provider.schema_version,
        analysis_attempts: expectedAttempts + 1,
        completed_at: completedAt,
        failure_code: null,
        failure_message: null,
      })
      .eq('id', diagnosisId)
      .eq('user_id', userId)
      .eq('status', 'analyzing');

    if (completeError) {
      throw new ApiError('ai_failed', 'The analysis could not be saved', 502);
    }

    const primaryOption = analysis.repair_options[0];
    if (primaryOption) {
      const { error: guideError } = await admin.from('repair_guides').upsert(
        {
          diagnosis_id: diagnosisId,
          user_id: userId,
          version: 1,
          title: primaryOption.title,
          steps: primaryOption.steps,
          tools: primaryOption.tools,
          materials: primaryOption.materials,
          difficulty: primaryOption.difficulty,
          duration_minutes_min: primaryOption.duration_minutes.min,
          duration_minutes_max: primaryOption.duration_minutes.max,
          professional_only: primaryOption.professional_only,
          safety_metadata: analysis.safety,
        },
        { onConflict: 'diagnosis_id,version' },
      );
      if (guideError) console.error('repair guide upsert failed', guideError.message);
    }

    if (reassess) {
      const { error: reassessEventError } = await admin.from('usage_events').insert({
        user_id: userId,
        diagnosis_id: diagnosisId,
        event_type: 'reassessment',
        metadata: { attempt: expectedAttempts + 1 },
      });
      if (reassessEventError)
        console.error('reassessment event failed', reassessEventError.message);
    }

    const usage = await loadUsage(admin, userId);
    return json(req, {
      analysis,
      usage,
      diagnosisId,
      idempotent: false,
    });
  } catch (error) {
    if (admin && diagnosisId) {
      await markFailed(admin, diagnosisId, error, reassess);
    }
    return errorResponse(req, error);
  }
});
