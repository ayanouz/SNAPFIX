import { Platform } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, normalizeError } from '@/domain/errors';
import { PLAN_LIMITS, currentMonthPeriod, usageSummary } from '@/domain/usage';
import {
  parseAnalysis,
  type DiagnosisAnalysis,
  type RepairStep,
  type SafetyLevel,
  type SafetyWarning,
} from '@/domain/diagnosis/schema';
import type {
  CostQuote,
  DiagnosisFeedback,
  DiagnosisImage,
  DiagnosisListItemPage,
  DiagnosisRecord,
  DiagnosisStatus,
  HistoryQuery,
  MaintenanceTask,
  NewCostQuote,
  NewDiagnosisInput,
  RepairGuide,
  RepairProgress,
  UsageSummary,
  UserProfile,
} from '@/domain/diagnosis/types';
import { addMonthsToDate } from '@/utils/format';
import { readImageBytes } from '@/services/storage/imageService';
import { requireSupabaseClient } from '@/services/supabase/client';
import type {
  CreateMaintenanceInput,
  DataRepository,
  ExportBundle,
  ProfileUpdate,
  SaveProgressInput,
  SubmitFeedbackInput,
  SupportMessageInput,
} from './types';

/**
 * Supabase-backed repository.
 *
 * The client never writes analysis, safety, provider, or status fields; those
 * are produced by the analyze-diagnosis Edge Function with the service role.
 * RLS and database triggers enforce that boundary even if this code changes.
 */

type ImageRow = {
  id: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  position: number;
};

type DiagnosisRow = {
  id: string;
  user_id: string;
  status: DiagnosisStatus;
  category: DiagnosisRecord['category'];
  description: string;
  brand: string | null;
  model: string | null;
  error_code: string | null;
  item_age_years: number | string | null;
  currency: string;
  locale: string;
  analysis: unknown;
  safety_level: SafetyLevel;
  repairability: string | null;
  failure_code: string | null;
  failure_message: string | null;
  analysis_attempts: number;
  is_saved: boolean;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  diagnosis_images?: ImageRow[] | null;
};

type DiagnosisSummaryRow = {
  id: string;
  status: DiagnosisStatus;
  category: DiagnosisRecord['category'];
  description: string;
  safety_level: SafetyLevel;
  created_at: string;
  completed_at: string | null;
  is_saved: boolean;
  error_code: string | null;
  analysis: unknown;
  diagnosis_images?: { storage_path: string; position: number }[] | null;
};

type MaintenanceRow = {
  id: string;
  user_id: string;
  item_description: string;
  task_description: string;
  frequency: MaintenanceTask['frequency'];
  next_due_date: string;
  reminder_enabled: boolean;
  last_completed_at: string | null;
  notification_id: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type QuoteRow = {
  id: string;
  diagnosis_id: string;
  quote_type: CostQuote['type'];
  label: string;
  amount: number | string;
  currency: string;
  includes_parts: boolean;
  includes_labor: boolean;
  notes: string | null;
  created_at: string;
};

type FeedbackRow = {
  id: string;
  diagnosis_id: string;
  rating: number;
  reason: DiagnosisFeedback['reason'];
  comment: string | null;
  created_at: string;
};

type ProgressRow = {
  diagnosis_id: string;
  user_id: string;
  completed_steps: string[] | null;
  current_step: number;
  completed_at: string | null;
  updated_at: string;
};

type GuideRow = {
  id: string;
  diagnosis_id: string;
  version: number;
  title: string;
  steps: unknown;
  tools: string[] | null;
  materials: string[] | null;
  difficulty: RepairGuide['difficulty'];
  duration_minutes_min: number;
  duration_minutes_max: number;
  professional_only: boolean;
  safety_metadata: unknown;
  created_at: string;
};

type ProfileRow = {
  id: string;
  display_name: string;
  preferred_language: string;
  preferred_currency: string;
  theme: UserProfile['theme'];
  created_at: string;
};

const DIAGNOSIS_SELECT =
  'id,user_id,status,category,description,brand,model,error_code,item_age_years,currency,locale,analysis,safety_level,repairability,failure_code,failure_message,analysis_attempts,is_saved,created_at,updated_at,completed_at,diagnosis_images(id,storage_path,mime_type,size_bytes,position)';

const SUMMARY_SELECT =
  'id,status,category,description,safety_level,created_at,completed_at,is_saved,error_code,analysis,diagnosis_images(storage_path,position)';

function client(): SupabaseClient {
  return requireSupabaseClient();
}

function fail(error: unknown, fallback: string): never {
  if (error instanceof AppError) throw error;
  const normalized = normalizeError(error);
  if (normalized.code === 'unknown') {
    throw new AppError('unknown', fallback);
  }
  throw normalized;
}

function safeAnalysis(value: unknown): DiagnosisAnalysis | null {
  if (!value) return null;
  const parsed = parseAnalysis(value);
  return parsed.success ? parsed.data : null;
}

function numberOrNull(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function signedUrls(supabase: SupabaseClient, paths: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const { data, error } = await supabase.storage
    .from('diagnosis-images')
    .createSignedUrls(unique, 60 * 60);
  if (error) return new Map();
  const map = new Map<string, string>();
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) map.set(entry.path, entry.signedUrl);
  }
  return map;
}

function mapImages(
  rows: ImageRow[] | null | undefined,
  signed: Map<string, string>,
): DiagnosisImage[] {
  return (rows ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((row) => ({
      id: row.id,
      storagePath: row.storage_path,
      signedUrl: signed.get(row.storage_path),
      mimeType: row.mime_type,
      sizeBytes: Number(row.size_bytes),
      position: row.position,
    }));
}

async function mapDiagnosis(supabase: SupabaseClient, row: DiagnosisRow): Promise<DiagnosisRecord> {
  const signed = await signedUrls(
    supabase,
    (row.diagnosis_images ?? []).map((image) => image.storage_path),
  );
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    category: row.category,
    description: row.description,
    brand: row.brand,
    model: row.model,
    errorCode: row.error_code,
    itemAgeYears: numberOrNull(row.item_age_years),
    currency: row.currency,
    locale: row.locale,
    analysis: safeAnalysis(row.analysis),
    safetyLevel: row.safety_level,
    failureCode: row.failure_code,
    failureMessage: row.failure_message,
    isSaved: row.is_saved,
    analysisAttempts: row.analysis_attempts,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    images: mapImages(row.diagnosis_images, signed),
  };
}

function mapMaintenance(row: MaintenanceRow): MaintenanceTask {
  return {
    id: row.id,
    userId: row.user_id,
    itemDescription: row.item_description,
    taskDescription: row.task_description,
    frequency: row.frequency,
    nextDueDate: row.next_due_date,
    reminderEnabled: row.reminder_enabled,
    lastCompletedAt: row.last_completed_at,
    notificationId: row.notification_id,
    notes: row.notes,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapQuote(row: QuoteRow): CostQuote {
  return {
    id: row.id,
    diagnosisId: row.diagnosis_id,
    type: row.quote_type,
    label: row.label,
    amount: Number(row.amount),
    currency: row.currency,
    includesParts: row.includes_parts,
    includesLabor: row.includes_labor,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

function mapFeedback(row: FeedbackRow): DiagnosisFeedback {
  return {
    id: row.id,
    diagnosisId: row.diagnosis_id,
    rating: row.rating,
    reason: row.reason,
    comment: row.comment,
    createdAt: row.created_at,
  };
}

function mapProgress(row: ProgressRow): RepairProgress {
  return {
    diagnosisId: row.diagnosis_id,
    userId: row.user_id,
    completedStepIds: row.completed_steps ?? [],
    currentStep: row.current_step,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  };
}

function mapGuide(row: GuideRow): RepairGuide {
  const metadata = row.safety_metadata as { warnings?: SafetyWarning[] } | null;
  return {
    id: row.id,
    diagnosisId: row.diagnosis_id,
    title: row.title,
    version: row.version,
    steps: (row.steps ?? []) as RepairStep[],
    tools: row.tools ?? [],
    materials: row.materials ?? [],
    difficulty: row.difficulty,
    durationMinutes: {
      min: row.duration_minutes_min,
      max: row.duration_minutes_max,
    },
    professionalOnly: row.professional_only,
    safetyWarnings: metadata?.warnings ?? [],
    sourceOptionIndex: 0,
    createdAt: row.created_at,
  };
}

function mapProfile(row: ProfileRow, email: string): UserProfile {
  return {
    id: row.id,
    displayName: row.display_name,
    email,
    preferredLanguage: row.preferred_language,
    preferredCurrency: row.preferred_currency,
    theme: row.theme,
    createdAt: row.created_at,
  };
}

function sanitizeSearch(value: string): string {
  return value
    .replace(/[%_,()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function functionError(error: unknown, data: unknown): AppError {
  const payload = data as { error?: string; message?: string } | null;
  const status = (error as { context?: { status?: number } } | null)?.context?.status;
  const code = payload?.error;
  const message = payload?.message;

  if (code === 'quota_exceeded' || status === 429) {
    return new AppError('quota_exceeded', message ?? 'Monthly diagnosis limit reached');
  }
  if (code === 'ai_not_configured') {
    return new AppError('ai_not_configured', message ?? 'AI provider is not configured');
  }
  if (code === 'ai_failed' || status === 502 || status === 504) {
    return new AppError(
      'ai_failed',
      message ?? 'The analysis service could not complete the request',
      {
        retryable: true,
      },
    );
  }
  if (code === 'unauthorized' || status === 401) {
    return new AppError('unauthorized', 'Sign in again to continue');
  }
  if (code === 'rate_limited') {
    return new AppError('rate_limited', message ?? 'Too many requests', { retryable: true });
  }
  if (code === 'conflict') {
    return new AppError('conflict', message ?? 'An analysis is already running');
  }
  if (code === 'not_found') {
    return new AppError('not_found', message ?? 'Diagnosis not found');
  }
  if (code === 'invalid_input') {
    return new AppError('invalid_input', message ?? 'The request was rejected');
  }
  return normalizeError(error);
}

async function readBytes(uri: string): Promise<Uint8Array> {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    if (!response.ok) throw new AppError('unsupported_image', 'The image could not be read');
    return new Uint8Array(await response.arrayBuffer());
  }
  return readImageBytes(uri);
}

export type SupabaseRepositoryOptions = {
  userId: string;
  email: string;
  displayName: string;
};

export function createSupabaseRepository(options: SupabaseRepositoryOptions): DataRepository {
  const userId = options.userId;
  const now = () => new Date();

  async function planForUser(supabase: SupabaseClient): Promise<'free' | 'premium'> {
    const { data } = await supabase
      .from('entitlements')
      .select('status,current_period_end')
      .eq('user_id', userId)
      .eq('entitlement', 'premium')
      .maybeSingle();
    if (!data || data.status !== 'active') return 'free';
    if (data.current_period_end && new Date(data.current_period_end).getTime() <= now().getTime()) {
      return 'free';
    }
    return 'premium';
  }

  async function getDiagnosisById(diagnosisId: string): Promise<DiagnosisRecord> {
    const supabase = client();
    const { data, error } = await supabase
      .from('diagnoses')
      .select(DIAGNOSIS_SELECT)
      .eq('id', diagnosisId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) fail(error, 'The diagnosis could not be loaded');
    if (!data) throw new AppError('not_found', 'Diagnosis not found');
    return mapDiagnosis(supabase, data as DiagnosisRow);
  }

  async function invokeAnalysis(diagnosisId: string, reassess: boolean): Promise<void> {
    const supabase = client();
    const { data, error } = await supabase.functions.invoke('analyze-diagnosis', {
      body: { diagnosisId, reassess },
    });
    if (error) throw functionError(error, data);
    const payload = data as { error?: string; message?: string } | null;
    if (payload?.error) throw functionError(null, payload);
  }

  async function loadProfile(): Promise<UserProfile> {
    const supabase = client();
    const { data, error } = await supabase
      .from('profiles')
      .select('id,display_name,preferred_language,preferred_currency,theme,created_at')
      .eq('id', userId)
      .maybeSingle();
    if (error) fail(error, 'Your profile could not be loaded');
    if (!data) {
      return {
        id: userId,
        displayName: options.displayName,
        email: options.email,
        preferredLanguage: 'en',
        preferredCurrency: 'MAD',
        theme: 'system',
        createdAt: now().toISOString(),
      };
    }
    return mapProfile(data as ProfileRow, options.email);
  }

  return {
    mode: 'live',

    async getProfile(): Promise<UserProfile> {
      return loadProfile();
    },

    async updateProfile(input: ProfileUpdate): Promise<UserProfile> {
      const supabase = client();
      const current = await loadProfile();
      const row = {
        id: userId,
        display_name:
          input.displayName !== undefined
            ? input.displayName.trim().slice(0, 80) || current.displayName
            : current.displayName,
        preferred_language: input.preferredLanguage ?? current.preferredLanguage,
        preferred_currency: (input.preferredCurrency ?? current.preferredCurrency).toUpperCase(),
        theme: input.theme ?? current.theme,
      };
      const { data, error } = await supabase
        .from('profiles')
        .upsert(row, { onConflict: 'id' })
        .select('id,display_name,preferred_language,preferred_currency,theme,created_at')
        .single();
      if (error) fail(error, 'Your profile could not be updated');
      return mapProfile(data as ProfileRow, options.email);
    },

    async createDiagnosis(input: NewDiagnosisInput): Promise<DiagnosisRecord> {
      if (input.imageUris.length === 0) {
        throw new AppError('invalid_input', 'At least one photo is required');
      }
      if (input.imageUris.length > PLAN_LIMITS.premium.maxPhotos) {
        throw new AppError(
          'invalid_input',
          `Attach at most ${PLAN_LIMITS.premium.maxPhotos} photos`,
        );
      }
      if (input.description.trim().length < 10) {
        throw new AppError('invalid_input', 'Describe the problem in at least 10 characters');
      }

      const supabase = client();
      const { data: existing } = await supabase
        .from('diagnoses')
        .select('id')
        .eq('id', input.id)
        .eq('user_id', userId)
        .maybeSingle();
      if (existing) return getDiagnosisById(input.id);

      const { error: insertError } = await supabase.from('diagnoses').insert({
        id: input.id,
        user_id: userId,
        status: 'draft',
        category: input.category,
        description: input.description.trim(),
        brand: input.brand?.trim() || null,
        model: input.model?.trim() || null,
        error_code: input.errorCode?.trim() || null,
        item_age_years: input.itemAgeYears ?? null,
        currency: input.currency.toUpperCase(),
        locale: input.locale,
      });
      if (insertError) fail(insertError, 'The diagnosis could not be created');

      try {
        for (let index = 0; index < input.imageUris.length; index += 1) {
          const uri = input.imageUris[index];
          if (!uri) continue;
          const bytes = await readBytes(uri);
          if (bytes.byteLength === 0) {
            throw new AppError('unsupported_image', 'The selected photo is empty');
          }
          if (bytes.byteLength > 6 * 1024 * 1024) {
            throw new AppError('image_too_large', 'Choose a photo smaller than 6 MB');
          }
          const path = `${userId}/${input.id}/${index + 1}-${Date.now()}.jpg`;
          const body = bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ) as ArrayBuffer;
          const { error: uploadError } = await supabase.storage
            .from('diagnosis-images')
            .upload(path, body, { contentType: 'image/jpeg', upsert: false });
          if (uploadError) fail(uploadError, 'The photo could not be uploaded');

          const { error: imageError } = await supabase.from('diagnosis_images').insert({
            diagnosis_id: input.id,
            user_id: userId,
            storage_path: path,
            mime_type: 'image/jpeg',
            size_bytes: bytes.byteLength,
            position: index,
          });
          if (imageError) fail(imageError, 'The photo could not be attached');
        }
      } catch (error) {
        await supabase.from('diagnoses').delete().eq('id', input.id).eq('user_id', userId);
        throw error instanceof AppError ? error : fail(error, 'The diagnosis could not be created');
      }

      return getDiagnosisById(input.id);
    },

    async startAnalysis(diagnosisId: string): Promise<void> {
      await invokeAnalysis(diagnosisId, false);
    },

    async reassessDiagnosis(diagnosisId: string): Promise<void> {
      await invokeAnalysis(diagnosisId, true);
    },

    async getDiagnosis(diagnosisId: string): Promise<DiagnosisRecord> {
      return getDiagnosisById(diagnosisId);
    },

    async listDiagnoses(query: HistoryQuery): Promise<DiagnosisListItemPage> {
      const supabase = client();
      const plan = await planForUser(supabase);
      const historyCap = PLAN_LIMITS[plan].historyLimit;
      const limit = Math.min(Math.max(query.limit ?? 10, 1), 20);
      const offset = Math.max(query.offset ?? 0, 0);

      let request = supabase
        .from('diagnoses')
        .select(SUMMARY_SELECT, { count: 'exact' })
        .eq('user_id', userId)
        .neq('status', 'draft');

      if (query.category) request = request.eq('category', query.category);
      if (query.savedOnly) request = request.eq('is_saved', true);
      const search = sanitizeSearch(query.search ?? '');
      if (search) {
        request = request.or(
          `description.ilike.%${search}%,brand.ilike.%${search}%,model.ilike.%${search}%`,
        );
      }

      const remainingCap = historyCap === null ? limit : Math.max(0, historyCap - offset);
      const effectiveLimit = Math.min(limit, remainingCap);
      if (effectiveLimit <= 0) {
        return { items: [], nextOffset: null, total: historyCap };
      }

      const { data, error, count } = await request
        .order('created_at', { ascending: false })
        .range(offset, offset + effectiveLimit - 1);
      if (error) fail(error, 'History could not be loaded');

      const rows = (data ?? []) as DiagnosisSummaryRow[];
      const firstPaths = rows
        .map((row) => {
          const images = [...(row.diagnosis_images ?? [])].sort((a, b) => a.position - b.position);
          return images[0]?.storage_path ?? '';
        })
        .filter(Boolean);
      const signed = await signedUrls(supabase, firstPaths);

      const items = rows.map((row) => {
        const images = [...(row.diagnosis_images ?? [])].sort((a, b) => a.position - b.position);
        const analysis = safeAnalysis(row.analysis);
        return {
          id: row.id,
          status: row.status,
          category: row.category,
          description: row.description,
          safetyLevel: row.safety_level,
          createdAt: row.created_at,
          completedAt: row.completed_at,
          isSaved: row.is_saved,
          errorCode: row.error_code,
          identifiedType: analysis?.item.identified_type ?? null,
          thumbnailUri: images[0] ? (signed.get(images[0].storage_path) ?? null) : null,
        };
      });

      const rawTotal = count ?? offset + items.length;
      const total = historyCap === null ? rawTotal : Math.min(rawTotal, historyCap);
      const nextOffset =
        offset + items.length < total && items.length === effectiveLimit
          ? offset + items.length
          : null;
      return { items, nextOffset, total };
    },

    async setSaved(diagnosisId: string, saved: boolean): Promise<void> {
      const supabase = client();
      const { data, error } = await supabase
        .from('diagnoses')
        .update({ is_saved: saved })
        .eq('id', diagnosisId)
        .eq('user_id', userId)
        .select('id')
        .maybeSingle();
      if (error) fail(error, 'The diagnosis could not be updated');
      if (!data) throw new AppError('not_found', 'Diagnosis not found');
    },

    async deleteDiagnosis(diagnosisId: string): Promise<void> {
      const supabase = client();
      const { data: images } = await supabase
        .from('diagnosis_images')
        .select('storage_path')
        .eq('diagnosis_id', diagnosisId)
        .eq('user_id', userId);
      const paths = (images ?? []).map((image) => image.storage_path as string).filter(Boolean);
      if (paths.length > 0) {
        await supabase.storage.from('diagnosis-images').remove(paths);
      }
      const { error } = await supabase
        .from('diagnoses')
        .delete()
        .eq('id', diagnosisId)
        .eq('user_id', userId);
      if (error) fail(error, 'The diagnosis could not be deleted');
    },

    async getRepairGuide(diagnosisId: string): Promise<RepairGuide | null> {
      const supabase = client();
      const { data, error } = await supabase
        .from('repair_guides')
        .select(
          'id,diagnosis_id,version,title,steps,tools,materials,difficulty,duration_minutes_min,duration_minutes_max,professional_only,safety_metadata,created_at',
        )
        .eq('diagnosis_id', diagnosisId)
        .eq('user_id', userId)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) fail(error, 'The repair guide could not be loaded');
      if (data) return mapGuide(data as GuideRow);

      const diagnosis = await getDiagnosisById(diagnosisId);
      if (!diagnosis.analysis || diagnosis.analysis.safety.professional_required) return null;
      const option = diagnosis.analysis.repair_options[0];
      if (!option) return null;
      return {
        id: `guide-${diagnosisId}`,
        diagnosisId,
        title: option.title,
        version: 1,
        steps: option.steps,
        tools: option.tools,
        materials: option.materials,
        difficulty: option.difficulty,
        durationMinutes: option.duration_minutes,
        professionalOnly: option.professional_only,
        safetyWarnings: diagnosis.analysis.safety.warnings,
        sourceOptionIndex: 0,
        createdAt: diagnosis.completedAt ?? diagnosis.createdAt,
      };
    },

    async getRepairProgress(diagnosisId: string): Promise<RepairProgress | null> {
      const supabase = client();
      const { data, error } = await supabase
        .from('repair_progress')
        .select('diagnosis_id,user_id,completed_steps,current_step,completed_at,updated_at')
        .eq('diagnosis_id', diagnosisId)
        .eq('user_id', userId)
        .maybeSingle();
      if (error) fail(error, 'Repair progress could not be loaded');
      return data ? mapProgress(data as ProgressRow) : null;
    },

    async saveRepairProgress(
      diagnosisId: string,
      input: SaveProgressInput,
    ): Promise<RepairProgress> {
      const supabase = client();
      const diagnosis = await getDiagnosisById(diagnosisId);
      const option = diagnosis.analysis?.repair_options[0];
      const maxSteps = option?.steps.length ?? 0;
      if (input.currentStep < 0 || input.currentStep > maxSteps) {
        throw new AppError('invalid_input', 'Invalid repair step');
      }
      const validIds = new Set(option?.steps.map((step) => step.id) ?? []);
      const completedStepIds = [...new Set(input.completedStepIds)].filter((id) =>
        validIds.has(id),
      );
      const completedAt =
        input.completedAt ??
        (maxSteps > 0 && completedStepIds.length === maxSteps ? now().toISOString() : null);

      const { data, error } = await supabase
        .from('repair_progress')
        .upsert(
          {
            diagnosis_id: diagnosisId,
            user_id: userId,
            completed_steps: completedStepIds,
            current_step: input.currentStep,
            completed_at: completedAt,
          },
          { onConflict: 'diagnosis_id' },
        )
        .select('diagnosis_id,user_id,completed_steps,current_step,completed_at,updated_at')
        .single();
      if (error) fail(error, 'Repair progress could not be saved');
      return mapProgress(data as ProgressRow);
    },

    async submitFeedback(input: SubmitFeedbackInput): Promise<DiagnosisFeedback> {
      const supabase = client();
      const { data, error } = await supabase
        .from('diagnosis_feedback')
        .upsert(
          {
            user_id: userId,
            diagnosis_id: input.diagnosisId,
            rating: Math.max(1, Math.min(5, input.rating)),
            reason: input.reason,
            comment: input.comment?.trim() || null,
          },
          { onConflict: 'user_id,diagnosis_id' },
        )
        .select('id,diagnosis_id,rating,reason,comment,created_at')
        .single();
      if (error) fail(error, 'Feedback could not be saved');
      return mapFeedback(data as FeedbackRow);
    },

    async getFeedback(diagnosisId: string): Promise<DiagnosisFeedback | null> {
      const supabase = client();
      const { data, error } = await supabase
        .from('diagnosis_feedback')
        .select('id,diagnosis_id,rating,reason,comment,created_at')
        .eq('diagnosis_id', diagnosisId)
        .eq('user_id', userId)
        .maybeSingle();
      if (error) fail(error, 'Feedback could not be loaded');
      return data ? mapFeedback(data as FeedbackRow) : null;
    },

    async getUsage(): Promise<UsageSummary> {
      const supabase = client();
      const plan = await planForUser(supabase);
      const period = currentMonthPeriod(now());
      const { count, error } = await supabase
        .from('usage_events')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('event_type', 'diagnosis_used')
        .gte('created_at', period.start.toISOString())
        .lt('created_at', period.end.toISOString());
      if (error) fail(error, 'Usage could not be loaded');
      const summary = usageSummary(plan, count ?? 0, now());
      return {
        plan: summary.plan,
        used: summary.used,
        limit: summary.limit,
        remaining: summary.remaining,
        periodStart: summary.periodStart,
        periodEnd: summary.periodEnd,
        historyLimit: summary.historyLimit,
        maxPhotos: summary.maxPhotos,
        maxReassessments: summary.maxReassessments,
      };
    },

    async listQuotes(diagnosisId: string): Promise<CostQuote[]> {
      const supabase = client();
      const { data, error } = await supabase
        .from('cost_quotes')
        .select(
          'id,diagnosis_id,quote_type,label,amount,currency,includes_parts,includes_labor,notes,created_at',
        )
        .eq('diagnosis_id', diagnosisId)
        .eq('user_id', userId)
        .order('amount', { ascending: true });
      if (error) fail(error, 'Quotes could not be loaded');
      return (data ?? []).map((row) => mapQuote(row as QuoteRow));
    },

    async addQuote(input: NewCostQuote): Promise<CostQuote> {
      if (!Number.isFinite(input.amount) || input.amount <= 0) {
        throw new AppError('invalid_input', 'Enter a valid amount');
      }
      const supabase = client();
      const { data, error } = await supabase
        .from('cost_quotes')
        .insert({
          user_id: userId,
          diagnosis_id: input.diagnosisId,
          quote_type: input.type,
          label: input.label.trim(),
          amount: input.amount,
          currency: input.currency.toUpperCase(),
          includes_parts: input.includesParts,
          includes_labor: input.includesLabor,
          notes: input.notes?.trim() || null,
        })
        .select(
          'id,diagnosis_id,quote_type,label,amount,currency,includes_parts,includes_labor,notes,created_at',
        )
        .single();
      if (error) fail(error, 'The quote could not be saved');
      return mapQuote(data as QuoteRow);
    },

    async deleteQuote(quoteId: string): Promise<void> {
      const supabase = client();
      const { error } = await supabase
        .from('cost_quotes')
        .delete()
        .eq('id', quoteId)
        .eq('user_id', userId);
      if (error) fail(error, 'The quote could not be deleted');
    },

    async listMaintenance(): Promise<MaintenanceTask[]> {
      const supabase = client();
      const { data, error } = await supabase
        .from('maintenance_tasks')
        .select('*')
        .eq('user_id', userId)
        .order('next_due_date', { ascending: true });
      if (error) fail(error, 'Maintenance tasks could not be loaded');
      return (data ?? []).map((row) => mapMaintenance(row as MaintenanceRow));
    },

    async createMaintenance(input: CreateMaintenanceInput): Promise<MaintenanceTask> {
      const supabase = client();
      const { data, error } = await supabase
        .from('maintenance_tasks')
        .insert({
          user_id: userId,
          item_description: input.itemDescription.trim(),
          task_description: input.taskDescription.trim(),
          frequency: input.frequency,
          next_due_date: input.nextDueDate,
          reminder_enabled: input.reminderEnabled,
          last_completed_at: input.lastCompletedAt,
          notes: input.notes?.trim() || null,
          is_active: input.isActive,
        })
        .select('*')
        .single();
      if (error) fail(error, 'The maintenance task could not be created');
      return mapMaintenance(data as MaintenanceRow);
    },

    async updateMaintenance(
      taskId: string,
      input: CreateMaintenanceInput,
    ): Promise<MaintenanceTask> {
      const supabase = client();
      const { data, error } = await supabase
        .from('maintenance_tasks')
        .update({
          item_description: input.itemDescription.trim(),
          task_description: input.taskDescription.trim(),
          frequency: input.frequency,
          next_due_date: input.nextDueDate,
          reminder_enabled: input.reminderEnabled,
          last_completed_at: input.lastCompletedAt,
          notes: input.notes?.trim() || null,
          is_active: input.isActive,
        })
        .eq('id', taskId)
        .eq('user_id', userId)
        .select('*')
        .maybeSingle();
      if (error) fail(error, 'The maintenance task could not be updated');
      if (!data) throw new AppError('not_found', 'Maintenance task not found');
      return mapMaintenance(data as MaintenanceRow);
    },

    async completeMaintenance(taskId: string): Promise<MaintenanceTask> {
      const supabase = client();
      const { data: existing, error: loadError } = await supabase
        .from('maintenance_tasks')
        .select('*')
        .eq('id', taskId)
        .eq('user_id', userId)
        .maybeSingle();
      if (loadError) fail(loadError, 'The maintenance task could not be loaded');
      if (!existing) throw new AppError('not_found', 'Maintenance task not found');
      const task = mapMaintenance(existing as MaintenanceRow);
      const completedAt = now().toISOString();
      let nextDueDate = task.nextDueDate;
      if (task.frequency === 'weekly') {
        const next = new Date(`${task.nextDueDate}T12:00:00.000Z`);
        next.setUTCDate(next.getUTCDate() + 7);
        nextDueDate = next.toISOString().slice(0, 10);
      } else {
        const months: Record<MaintenanceTask['frequency'], number | null> = {
          once: null,
          weekly: 0,
          monthly: 1,
          quarterly: 3,
          biannual: 6,
          yearly: 12,
        };
        const value = months[task.frequency];
        if (value !== null) nextDueDate = addMonthsToDate(task.nextDueDate, value);
      }
      const { data, error } = await supabase
        .from('maintenance_tasks')
        .update({
          last_completed_at: completedAt,
          next_due_date: nextDueDate,
          is_active: task.frequency !== 'once',
          notification_id: null,
        })
        .eq('id', taskId)
        .eq('user_id', userId)
        .select('*')
        .single();
      if (error) fail(error, 'The maintenance task could not be completed');
      return mapMaintenance(data as MaintenanceRow);
    },

    async setMaintenanceNotificationId(
      taskId: string,
      notificationId: string | null,
    ): Promise<MaintenanceTask> {
      const supabase = client();
      const { data, error } = await supabase
        .from('maintenance_tasks')
        .update({ notification_id: notificationId })
        .eq('id', taskId)
        .eq('user_id', userId)
        .select('*')
        .maybeSingle();
      if (error) fail(error, 'The reminder could not be updated');
      if (!data) throw new AppError('not_found', 'Maintenance task not found');
      return mapMaintenance(data as MaintenanceRow);
    },

    async deleteMaintenance(taskId: string): Promise<void> {
      const supabase = client();
      const { error } = await supabase
        .from('maintenance_tasks')
        .delete()
        .eq('id', taskId)
        .eq('user_id', userId);
      if (error) fail(error, 'The maintenance task could not be deleted');
    },

    async sendSupportMessage(input: SupportMessageInput): Promise<void> {
      const supabase = client();
      const { error } = await supabase.from('support_messages').insert({
        user_id: userId,
        category: input.category,
        message: input.message.trim(),
        email: input.email?.trim() || null,
        diagnosis_id: input.diagnosisId,
      });
      if (error) fail(error, 'Your message could not be sent');
    },

    async exportUserData(): Promise<ExportBundle> {
      const supabase = client();
      const [diagnoses, maintenance, feedback, quotes, progress] = await Promise.all([
        supabase.from('diagnoses').select(DIAGNOSIS_SELECT).eq('user_id', userId),
        supabase.from('maintenance_tasks').select('*').eq('user_id', userId),
        supabase.from('diagnosis_feedback').select('*').eq('user_id', userId),
        supabase.from('cost_quotes').select('*').eq('user_id', userId),
        supabase.from('repair_progress').select('*').eq('user_id', userId),
      ]);
      if (diagnoses.error) fail(diagnoses.error, 'Your data could not be exported');
      const mappedDiagnoses = await Promise.all(
        ((diagnoses.data ?? []) as DiagnosisRow[]).map((row) => mapDiagnosis(supabase, row)),
      );
      return {
        exportedAt: now().toISOString(),
        app: 'SNAPFIX',
        schemaVersion: 1,
        diagnoses: mappedDiagnoses,
        maintenance: ((maintenance.data ?? []) as MaintenanceRow[]).map(mapMaintenance),
        feedback: ((feedback.data ?? []) as FeedbackRow[]).map(mapFeedback),
        quotes: ((quotes.data ?? []) as QuoteRow[]).map(mapQuote),
        progress: ((progress.data ?? []) as ProgressRow[]).map(mapProgress),
      };
    },

    async deleteAllData(): Promise<void> {
      const supabase = client();
      const { data: images } = await supabase
        .from('diagnosis_images')
        .select('storage_path')
        .eq('user_id', userId);
      const paths = (images ?? []).map((image) => image.storage_path as string).filter(Boolean);
      if (paths.length > 0) {
        await supabase.storage.from('diagnosis-images').remove(paths);
      }
      const [diagnoses, maintenance, support] = await Promise.all([
        supabase.from('diagnoses').delete().eq('user_id', userId),
        supabase.from('maintenance_tasks').delete().eq('user_id', userId),
        supabase.from('support_messages').delete().eq('user_id', userId),
      ]);
      const error = diagnoses.error ?? maintenance.error ?? support.error;
      if (error) fail(error, 'Some data could not be deleted');
    },
  };
}
