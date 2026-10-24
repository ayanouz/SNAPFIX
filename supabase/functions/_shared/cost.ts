import type { DiagnosisAnalysis, Estimate } from './schema.ts';
import { normalizeForMatching } from './safety.ts';

/**
 * Deterministic cost estimator. AI models are never allowed to invent prices.
 * A range is only produced when a verified, recent reference matches the item
 * category, cause, region, and currency. Otherwise the app explains what is
 * missing and invites the user to compare real quotes.
 */

export type PriceReference = {
  id: string;
  category: string;
  currency: string;
  region: string;
  partName: string;
  causeKeywords: string[];
  minPrice: number;
  maxPrice: number;
  includesParts: boolean;
  includesLabor: boolean;
  laborHoursMin?: number | null;
  laborHoursMax?: number | null;
  laborRatePerHour?: number | null;
  sourceName: string;
  sourceUrl?: string | null;
  verifiedAt: string;
};

export const ESTIMATE_REASONS = {
  noVerifiedPricing: 'no_verified_local_pricing',
  currencyUnavailable: 'no_pricing_in_currency',
  insufficientDetail: 'insufficient_detail',
  professionalRequired: 'professional_quote_required',
} as const;

export type EstimateReason = (typeof ESTIMATE_REASONS)[keyof typeof ESTIMATE_REASONS];

const MAX_AGE_DAYS = 365;

export function unavailableEstimate(currency: string, reason: EstimateReason): Estimate {
  return {
    status: 'unavailable',
    currency,
    minimum: null,
    maximum: null,
    includes_parts: null,
    includes_labor: null,
    assumptions: [],
    confidence: null,
    data_source: null,
    last_verified_at: null,
    unavailable_reason: reason,
  };
}

function isRecent(verifiedAt: string, now: Date): boolean {
  const verified = new Date(verifiedAt);
  if (Number.isNaN(verified.getTime())) return false;
  const ageMs = now.getTime() - verified.getTime();
  return ageMs >= 0 && ageMs <= MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}

function scoreReference(reference: PriceReference, causeText: string): number {
  return reference.causeKeywords.reduce((score, keyword) => {
    const normalized = normalizeForMatching(keyword);
    return normalized.length > 2 && causeText.includes(normalized) ? score + 1 : score;
  }, 0);
}

export function estimateRepair(input: {
  analysis: DiagnosisAnalysis;
  currency: string;
  region: string;
  references: PriceReference[];
  now?: Date;
}): Estimate {
  const now = input.now ?? new Date();
  const currency = input.currency.toUpperCase();
  const relevant = input.references.filter(
    (reference) =>
      reference.category === input.analysis.item.category &&
      reference.currency.toUpperCase() === currency &&
      isRecent(reference.verifiedAt, now) &&
      (reference.region === input.region || reference.region === 'global'),
  );

  if (relevant.length === 0) {
    const hasCurrency = input.references.some(
      (reference) =>
        reference.category === input.analysis.item.category &&
        reference.currency.toUpperCase() === currency,
    );
    return unavailableEstimate(
      currency,
      hasCurrency ? ESTIMATE_REASONS.noVerifiedPricing : ESTIMATE_REASONS.currencyUnavailable,
    );
  }

  const causeText = normalizeForMatching(
    input.analysis.possible_causes.map((cause) => `${cause.title} ${cause.explanation}`).join(' '),
  );
  const scored = relevant
    .map((reference) => ({ reference, score: scoreReference(reference, causeText) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (
        new Date(b.reference.verifiedAt).getTime() - new Date(a.reference.verifiedAt).getTime()
      );
    });

  const best = scored[0];
  if (!best || best.score === 0) {
    return unavailableEstimate(currency, ESTIMATE_REASONS.insufficientDetail);
  }

  const reference = best.reference;
  let minimum = reference.minPrice;
  let maximum = reference.maxPrice;

  if (!reference.includes_labor && reference.laborRatePerHour && reference.laborHoursMin) {
    minimum += reference.laborRatePerHour * reference.laborHoursMin;
    maximum += reference.laborRatePerHour * (reference.laborHoursMax ?? reference.laborHoursMin);
  }

  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum > maximum) {
    return unavailableEstimate(currency, ESTIMATE_REASONS.noVerifiedPricing);
  }

  const assumptions = [
    `Reference repair: ${reference.partName}.`,
    `Includes parts: ${reference.includes_parts ? 'yes' : 'no'}; includes labour: ${
      reference.includes_labor ? 'yes' : 'no'
    }.`,
    `Region: ${reference.region}.`,
    'This is a range based on verified reference data, not a binding quote. Local access, taxes, and diagnosis fees may differ.',
  ];

  if (!reference.includes_labor) {
    assumptions.push('Labour is not included in this range.');
  }

  return {
    status: 'available',
    currency,
    minimum: Math.round(minimum * 100) / 100,
    maximum: Math.round(maximum * 100) / 100,
    includes_parts: reference.includes_parts,
    includes_labor: reference.includes_labor,
    assumptions,
    confidence: 'medium',
    data_source: reference.sourceName,
    last_verified_at: new Date(reference.verifiedAt).toISOString(),
    unavailable_reason: null,
  };
}

export type QuoteComparison = {
  repairQuotes: { id: string; label: string; amount: number; currency: string }[];
  replacementQuote: { id: string; label: string; amount: number; currency: string } | null;
  cheapestRepair: { id: string; label: string; amount: number; currency: string } | null;
  savingsVsReplacement: number | null;
  currency: string | null;
  mixedCurrencies: boolean;
};

export function compareQuotes(
  quotes: {
    id: string;
    label: string;
    amount: number;
    currency: string;
    type: 'repair' | 'replacement';
  }[],
): QuoteComparison {
  const currencies = new Set(quotes.map((quote) => quote.currency.toUpperCase()));
  const mixedCurrencies = currencies.size > 1;
  const repairQuotes = quotes
    .filter((quote) => quote.type === 'repair')
    .map((quote) => ({
      id: quote.id,
      label: quote.label,
      amount: quote.amount,
      currency: quote.currency.toUpperCase(),
    }))
    .sort((a, b) => a.amount - b.amount);
  const replacement = quotes.find((quote) => quote.type === 'replacement');
  const cheapest = repairQuotes[0] ?? null;
  const replacementQuote = replacement
    ? {
        id: replacement.id,
        label: replacement.label,
        amount: replacement.amount,
        currency: replacement.currency.toUpperCase(),
      }
    : null;

  const savings =
    !mixedCurrencies && cheapest && replacementQuote && replacementQuote.amount > cheapest.amount
      ? replacementQuote.amount - cheapest.amount
      : null;

  return {
    repairQuotes,
    replacementQuote,
    cheapestRepair: cheapest,
    savingsVsReplacement: savings,
    currency: mixedCurrencies ? null : (cheapest?.currency ?? replacementQuote?.currency ?? null),
    mixedCurrencies,
  };
}
