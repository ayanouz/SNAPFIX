import {
  analysisSchema,
  extractJsonObject,
  modelAssessmentSchema,
  DIAGNOSIS_PROMPT_VERSION,
  DIAGNOSIS_SCHEMA_VERSION,
  type Category,
  type DiagnosisAnalysis,
  type ModelAssessment,
} from './schema.ts';
import { applySafetyPolicy } from './safety.ts';
import {
  ESTIMATE_REASONS,
  estimateRepair,
  unavailableEstimate,
  type PriceReference,
} from './cost.ts';
import { ApiError } from './http.ts';

export function parseModelAssessment(raw: string): ModelAssessment {
  let json: unknown;
  try {
    json = extractJsonObject(raw);
  } catch {
    throw new ApiError('ai_failed', 'The AI response was not valid JSON', 502);
  }
  const parsed = modelAssessmentSchema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError('ai_failed', 'The AI response did not match the SNAPFIX contract', 502, {
      issues: parsed.error.issues.slice(0, 12).map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  return parsed.data;
}

export function buildAnalysis(input: {
  assessment: ModelAssessment;
  sourceText: string;
  locale: string;
  currency: string;
  region: string;
  references: PriceReference[];
  provider: {
    name: string;
    model: string;
    mode: 'vision' | 'text' | 'demo';
  };
}): DiagnosisAnalysis {
  const base: DiagnosisAnalysis = {
    ...input.assessment,
    estimate: unavailableEstimate(input.currency, ESTIMATE_REASONS.noVerifiedPricing),
    provider: {
      name: input.provider.name,
      model: input.provider.model,
      mode: input.provider.mode,
      generated_at: new Date().toISOString(),
      schema_version: DIAGNOSIS_SCHEMA_VERSION,
      prompt_version: DIAGNOSIS_PROMPT_VERSION,
    },
  };

  const safe = applySafetyPolicy(base, {
    text: input.sourceText,
    locale: input.locale,
    category: input.assessment.item.category,
  });

  const estimate =
    input.references.length > 0
      ? estimateRepair({
          analysis: safe,
          currency: input.currency,
          region: input.region,
          locale: input.locale,
          references: input.references,
        })
      : unavailableEstimate(input.currency, ESTIMATE_REASONS.noVerifiedPricing);

  const parsed = analysisSchema.safeParse({ ...safe, estimate });
  if (!parsed.success) {
    throw new ApiError('ai_failed', 'The final assessment failed safety validation', 502, {
      issues: parsed.error.issues.slice(0, 12).map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  return parsed.data;
}

type PriceReferenceRow = {
  id: string;
  category: string;
  currency: string;
  region: string;
  part_name: string;
  cause_keywords: string[] | null;
  min_price: number | string;
  max_price: number | string;
  includes_parts: boolean;
  includes_labor: boolean;
  labor_hours_min: number | string | null;
  labor_hours_max: number | string | null;
  labor_rate_per_hour: number | string | null;
  source_name: string;
  source_url: string | null;
  verified_at: string;
};

function toNumber(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function mapPriceReference(row: PriceReferenceRow): PriceReference {
  return {
    id: row.id,
    category: row.category,
    currency: row.currency,
    region: row.region,
    partName: row.part_name,
    causeKeywords: row.cause_keywords ?? [],
    minPrice: toNumber(row.min_price) ?? 0,
    maxPrice: toNumber(row.max_price) ?? 0,
    includesParts: row.includes_parts,
    includesLabor: row.includes_labor,
    laborHoursMin: toNumber(row.labor_hours_min),
    laborHoursMax: toNumber(row.labor_hours_max),
    laborRatePerHour: toNumber(row.labor_rate_per_hour),
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    verifiedAt: row.verified_at,
  };
}

export function isCategory(value: unknown): value is Category {
  return (
    value === 'appliance' ||
    value === 'plumbing' ||
    value === 'electrical' ||
    value === 'heating_cooling' ||
    value === 'furniture' ||
    value === 'walls_floors' ||
    value === 'electronics' ||
    value === 'other'
  );
}
