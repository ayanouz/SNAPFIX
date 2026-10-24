import { ApiError } from './http.ts';
import type { Category, ModelAssessment } from './schema.ts';

export type ProviderName = 'openai' | 'anthropic' | 'gemini' | 'demo';
export type ProviderMode = 'vision' | 'text' | 'demo';

export type ProviderImage = {
  data: string;
  mimeType: string;
};

export type ProviderInput = {
  systemPrompt: string;
  userPrompt: string;
  images: ProviderImage[];
  locale: string;
  category: Category;
};

export type ProviderOutput = {
  text: string;
  model: string;
  mode: ProviderMode;
};

type ProviderConfig = {
  name: ProviderName;
  model: string;
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  maxTokens: number;
};

const DEFAULT_MODELS: Record<Exclude<ProviderName, 'demo'>, string> = {
  openai: 'gpt-4.1-mini',
  anthropic: 'claude-sonnet-4-5',
  gemini: 'gemini-2.5-flash',
};

function numberEnv(name: string, fallback: number): number {
  const raw = Deno.env.get(name);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function providerName(): ProviderName {
  const raw = (Deno.env.get('AI_PROVIDER') ?? 'demo').trim().toLowerCase();
  if (raw === 'openai' || raw === 'anthropic' || raw === 'gemini' || raw === 'demo') {
    return raw;
  }
  throw new ApiError('ai_not_configured', `Unsupported AI_PROVIDER "${raw}"`, 503);
}

export function getProviderConfig(): ProviderConfig {
  const name = providerName();
  const configuredModel = (Deno.env.get('AI_MODEL') ?? '').trim();
  const apiKey = (Deno.env.get('AI_API_KEY') ?? '').trim();
  const baseUrl = (Deno.env.get('AI_BASE_URL') ?? '').trim();

  if (name === 'demo') {
    if ((Deno.env.get('AI_ALLOW_DEMO') ?? 'false').toLowerCase() !== 'true') {
      throw new ApiError(
        'ai_not_configured',
        'No AI provider is configured. Set AI_PROVIDER and AI_API_KEY, or explicitly set AI_ALLOW_DEMO=true for a non-diagnostic demo provider.',
        503,
      );
    }
    return {
      name,
      model: 'snapfix-demo-provider',
      apiKey: '',
      baseUrl: '',
      timeoutMs: numberEnv('AI_TIMEOUT_MS', 60_000),
      maxTokens: 1024,
    };
  }

  if (!apiKey) {
    throw new ApiError('ai_not_configured', `AI_API_KEY is required for ${name}`, 503);
  }

  return {
    name,
    model: configuredModel || DEFAULT_MODELS[name],
    apiKey,
    baseUrl: baseUrl || (name === 'openai' ? 'https://api.openai.com/v1' : ''),
    timeoutMs: numberEnv('AI_TIMEOUT_MS', 60_000),
    maxTokens: Math.min(numberEnv('AI_MAX_TOKENS', 4096), 8192),
  };
}

function trimBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

async function fetchJson(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  provider: string,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const raw = await response.text();
    if (!response.ok) {
      const safeBody = raw.slice(0, 600);
      console.error(`${provider} returned ${response.status}: ${safeBody}`);
      if (response.status === 401 || response.status === 403) {
        throw new ApiError('ai_not_configured', 'The AI provider rejected its credentials', 503);
      }
      if (response.status === 429) {
        throw new ApiError('rate_limited', 'The AI provider is rate limiting requests', 429);
      }
      throw new ApiError('ai_failed', 'The AI provider could not complete the analysis', 502);
    }
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      throw new ApiError('ai_failed', 'The AI provider returned an unreadable response', 502);
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError('ai_failed', 'The AI provider timed out', 504);
    }
    console.error(`${provider} request failed`, error);
    throw new ApiError('ai_failed', 'The AI provider request failed', 502);
  } finally {
    clearTimeout(timer);
  }
}

function openAiText(payload: unknown): string {
  const data = payload as {
    choices?: { message?: { content?: string | { type?: string; text?: string }[] } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === 'string' && content.trim()) return content;
  if (Array.isArray(content)) {
    const text = content
      .map((part) => (part.type === 'text' ? (part.text ?? '') : ''))
      .join('')
      .trim();
    if (text) return text;
  }
  throw new ApiError('ai_failed', 'The AI provider returned an empty analysis', 502);
}

async function callOpenAi(config: ProviderConfig, input: ProviderInput): Promise<ProviderOutput> {
  const userContent: unknown[] = [{ type: 'text', text: input.userPrompt }];
  for (const image of input.images) {
    userContent.push({
      type: 'image_url',
      image_url: { url: `data:${image.mimeType};base64,${image.data}`, detail: 'high' },
    });
  }
  const payload = await fetchJson(
    `${trimBaseUrl(config.baseUrl)}/chat/completions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        max_tokens: config.maxTokens,
        messages: [
          { role: 'system', content: input.systemPrompt },
          { role: 'user', content: userContent },
        ],
      }),
    },
    config.timeoutMs,
    'openai',
  );
  return {
    text: openAiText(payload),
    model: config.model,
    mode: input.images.length > 0 ? 'vision' : 'text',
  };
}

async function callAnthropic(
  config: ProviderConfig,
  input: ProviderInput,
): Promise<ProviderOutput> {
  const content: unknown[] = [];
  for (const image of input.images) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: image.mimeType, data: image.data },
    });
  }
  content.push({ type: 'text', text: input.userPrompt });

  const payload = await fetchJson(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: {
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: config.maxTokens,
        temperature: 0.2,
        system: input.systemPrompt,
        messages: [{ role: 'user', content }],
      }),
    },
    config.timeoutMs,
    'anthropic',
  );

  const data = payload as { content?: { type?: string; text?: string }[] };
  const text = (data.content ?? [])
    .filter((part) => part.type === 'text')
    .map((part) => part.text ?? '')
    .join('')
    .trim();
  if (!text) throw new ApiError('ai_failed', 'The AI provider returned an empty analysis', 502);
  return { text, model: config.model, mode: input.images.length > 0 ? 'vision' : 'text' };
}

async function callGemini(config: ProviderConfig, input: ProviderInput): Promise<ProviderOutput> {
  const parts: unknown[] = [{ text: input.userPrompt }];
  for (const image of input.images) {
    parts.push({ inline_data: { mime_type: image.mimeType, data: image.data } });
  }
  const model = encodeURIComponent(config.model);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
  const payload = await fetchJson(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: input.systemPrompt }] },
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: config.maxTokens,
          responseMimeType: 'application/json',
        },
      }),
    },
    config.timeoutMs,
    'gemini',
  );

  const data = payload as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = (data.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? '')
    .join('')
    .trim();
  if (!text) throw new ApiError('ai_failed', 'The AI provider returned an empty analysis', 502);
  return { text, model: config.model, mode: input.images.length > 0 ? 'vision' : 'text' };
}

function demoAssessment(input: ProviderInput): ModelAssessment {
  const isFrench = input.locale === 'fr';
  const isArabic = input.locale === 'ar';
  const headline = isFrench
    ? 'Fournisseur de démonstration — aucune analyse visuelle'
    : isArabic
      ? 'مزوّد تجريبي — لم يتم تحليل الصور'
      : 'Demo provider — no visual analysis was performed';
  const explanation = isFrench
    ? "Ce déploiement utilise le fournisseur de démonstration de SNAPFIX. Aucune image n'a été interprétée et aucun diagnostic n'a été produit. Configurez un fournisseur d'IA réel avant de montrer ce résultat à un utilisateur."
    : isArabic
      ? 'يستخدم هذا النشر مزوّد العرض التجريبي في SNAPFIX. لم يتم تفسير الصور ولم يتم إنتاج تشخيص. قم بتهيئة مزوّد ذكاء اصطناعي حقيقي قبل عرض هذه النتيجة على المستخدم.'
      : 'This deployment is using the SNAPFIX demo provider. No images were interpreted and no diagnosis was produced. Configure a real AI provider before showing this result to a user.';

  return {
    item: {
      category: input.category,
      identified_type: isFrench
        ? 'Démonstration (sans analyse)'
        : isArabic
          ? 'وضع تجريبي (دون تحليل)'
          : 'Demo mode (no analysis)',
      brand: null,
      model: null,
    },
    summary: {
      headline,
      plain_language: explanation,
      confidence: 0,
      uncertainty: [
        isFrench
          ? "Aucune analyse d'image n'a été effectuée."
          : isArabic
            ? 'لم يتم إجراء أي تحليل للصور.'
            : 'No image analysis was performed.',
      ],
    },
    observations: [
      {
        id: 'obs-demo-1',
        description: isFrench
          ? "La description fournie n'a pas été analysée par un modèle d'IA."
          : isArabic
            ? 'لم يتم تحليل الوصف المقدم بواسطة نموذج ذكاء اصطناعي.'
            : 'The supplied description was not analysed by an AI model.',
        source: 'context',
        confidence: 0,
      },
    ],
    possible_causes: [
      {
        id: 'cause-demo-1',
        title: isFrench
          ? 'Cause non déterminée'
          : isArabic
            ? 'السبب غير محدد'
            : 'Cause not determined',
        explanation,
        confidence: 0,
        evidence: [],
        verification_needed: true,
      },
    ],
    safety: {
      risk_level: 'low',
      professional_required: false,
      stop_guidance: false,
      warnings: [
        {
          code: 'demo_mode',
          severity: 'low',
          message: explanation,
          source: 'rule',
        },
      ],
      escalation: null,
    },
    next_steps: [
      {
        id: 'step-demo-1',
        title: isFrench
          ? "Configurer un fournisseur d'IA réel"
          : isArabic
            ? 'تهيئة مزوّد ذكاء اصطناعي حقيقي'
            : 'Configure a real AI provider',
        description: isFrench
          ? 'Un administrateur doit définir AI_PROVIDER, AI_API_KEY et AI_MODEL dans les secrets Supabase, puis désactiver AI_ALLOW_DEMO.'
          : isArabic
            ? 'يجب على المسؤول تعيين AI_PROVIDER وAI_API_KEY وAI_MODEL في أسرار Supabase، ثم تعطيل AI_ALLOW_DEMO.'
            : 'An administrator must set AI_PROVIDER, AI_API_KEY, and AI_MODEL in the Supabase secrets, then disable AI_ALLOW_DEMO.',
        type: 'check',
        safe: true,
      },
    ],
    repairability: {
      verdict: 'unknown',
      rationale: isFrench
        ? "Aucun diagnostic n'a été produit."
        : isArabic
          ? 'لم يتم إنتاج أي تشخيص.'
          : 'No diagnosis was produced.',
    },
    repair_options: [],
    limitations: [
      isFrench
        ? "Le fournisseur de démonstration ne remplace pas une analyse d'IA."
        : isArabic
          ? 'لا يغني المزوّد التجريبي عن تحليل الذكاء الاصطناعي.'
          : 'The demo provider is not a substitute for AI analysis.',
      isFrench
        ? 'Aucune conclusion ne doit être tirée de ce résultat.'
        : isArabic
          ? 'لا ينبغي استخلاص أي استنتاج من هذه النتيجة.'
          : 'No conclusion should be drawn from this result.',
    ],
    follow_up_questions: [],
  };
}

function demoOutput(input: ProviderInput): ProviderOutput {
  return {
    text: JSON.stringify(demoAssessment(input)),
    model: 'snapfix-demo-provider',
    mode: 'demo',
  };
}

export async function callProvider(input: ProviderInput): Promise<ProviderOutput> {
  const config = getProviderConfig();
  switch (config.name) {
    case 'openai':
      return callOpenAi(config, input);
    case 'anthropic':
      return callAnthropic(config, input);
    case 'gemini':
      return callGemini(config, input);
    case 'demo':
      return demoOutput(input);
    default: {
      const exhaustive: never = config.name;
      throw new ApiError('ai_not_configured', `Unsupported provider ${exhaustive}`, 503);
    }
  }
}
