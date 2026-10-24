import type { Estimate, SafetyLevel } from '@/domain/diagnosis/schema';
import { ESTIMATE_REASONS } from '@/domain/diagnosis/cost';

export type SupportedLocale = 'en' | 'fr' | 'ar';

export function localeFor(language: string): string {
  switch (language) {
    case 'fr':
      return 'fr-MA';
    case 'ar':
      return 'ar-MA';
    default:
      return 'en-GB';
  }
}

export function formatCurrency(amount: number, currency: string, language: string): string {
  try {
    return new Intl.NumberFormat(localeFor(language), {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount.toFixed(0)} ${currency}`;
  }
}

export function formatNumber(value: number, language: string): string {
  return new Intl.NumberFormat(localeFor(language)).format(value);
}

export function formatDate(
  iso: string,
  language: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(
    localeFor(language),
    options ?? { day: 'numeric', month: 'short', year: 'numeric' },
  ).format(date);
}

export function formatDateTime(iso: string, language: string): string {
  return formatDate(iso, language, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRelativeDate(iso: string, language: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const diffMs = date.getTime() - now.getTime();
  const absDays = Math.abs(diffMs) / (1000 * 60 * 60 * 24);
  if (absDays < 1) {
    const formatter = new Intl.RelativeTimeFormat(localeFor(language), { numeric: 'auto' });
    return formatter.format(Math.round(diffMs / (1000 * 60 * 60)), 'hour');
  }
  if (absDays < 7) {
    const formatter = new Intl.RelativeTimeFormat(localeFor(language), { numeric: 'auto' });
    return formatter.format(Math.round(diffMs / (1000 * 60 * 60 * 24)), 'day');
  }
  return formatDate(iso, language);
}

export function confidencePercent(confidence: number): number {
  return Math.round(Math.max(0, Math.min(1, confidence)) * 100);
}

export function confidenceBand(confidence: number): 'low' | 'medium' | 'high' {
  if (confidence >= 0.7) return 'high';
  if (confidence >= 0.45) return 'medium';
  return 'low';
}

export function formatDuration(minutes: { min: number; max: number }): string {
  const format = (value: number) => {
    if (value < 60) return `${value} min`;
    const hours = Math.floor(value / 60);
    const remainder = value % 60;
    return remainder === 0 ? `${hours} h` : `${hours} h ${remainder} min`;
  };
  return minutes.min === minutes.max
    ? format(minutes.min)
    : `${format(minutes.min)} – ${format(minutes.max)}`;
}

export function formatEstimateRange(estimate: Estimate, language: string): string | null {
  if (estimate.status !== 'available' || estimate.minimum === null || estimate.maximum === null) {
    return null;
  }
  return `${formatCurrency(estimate.minimum, estimate.currency, language)} – ${formatCurrency(
    estimate.maximum,
    estimate.currency,
    language,
  )}`;
}

export function estimateReasonKey(reason: string | null): string {
  switch (reason) {
    case ESTIMATE_REASONS.noVerifiedPricing:
      return 'estimate.reason.no_verified_pricing';
    case ESTIMATE_REASONS.currencyUnavailable:
      return 'estimate.reason.no_pricing_in_currency';
    case ESTIMATE_REASONS.insufficientDetail:
      return 'estimate.reason.insufficient_detail';
    case ESTIMATE_REASONS.professionalRequired:
      return 'estimate.reason.professional_quote_required';
    default:
      return 'estimate.reason.unknown';
  }
}

export function safetyColorKey(level: SafetyLevel): 'success' | 'warning' | 'danger' | 'critical' {
  switch (level) {
    case 'critical':
      return 'critical';
    case 'high':
      return 'danger';
    case 'medium':
      return 'warning';
    default:
      return 'success';
  }
}

export function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isDateWithinDays(dateIso: string, days: number): boolean {
  const date = new Date(`${dateIso}T12:00:00`).getTime();
  if (!Number.isFinite(date)) return false;
  return date <= Date.now() + days * 24 * 60 * 60 * 1000;
}

export function addMonthsToDate(dateIso: string, months: number): string {
  const date = new Date(`${dateIso}T12:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

export function isValidDateInput(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
