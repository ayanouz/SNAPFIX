import {
  addMonthsToDate,
  confidenceBand,
  confidencePercent,
  estimateReasonKey,
  formatDate,
  formatDuration,
  formatEstimateRange,
  formatRelativeDate,
  isDateWithinDays,
  isValidDateInput,
  localeFor,
  safetyColorKey,
  todayIsoDate,
  truncate,
} from '@/utils/format';
import { ESTIMATE_REASONS } from '@/domain/diagnosis/cost';

describe('formatting and date helpers', () => {
  it('selects a locale for each supported language', () => {
    expect(localeFor('en')).toBe('en-GB');
    expect(localeFor('fr')).toBe('fr-MA');
    expect(localeFor('ar')).toBe('ar-MA');
    expect(localeFor('de')).toBe('en-GB');
  });

  it('formats dates and handles invalid input', () => {
    expect(formatDate('2026-10-24T12:00:00.000Z', 'en')).toContain('2026');
    expect(formatDate('not-a-date', 'en')).toBe('—');
    expect(
      formatRelativeDate('2026-10-24T08:00:00.000Z', 'en', new Date('2026-10-24T12:00:00.000Z')),
    ).toContain('hour');
  });

  it('normalizes confidence values', () => {
    expect(confidencePercent(0.426)).toBe(43);
    expect(confidencePercent(-1)).toBe(0);
    expect(confidencePercent(2)).toBe(100);
    expect(confidenceBand(0.9)).toBe('high');
    expect(confidenceBand(0.5)).toBe('medium');
    expect(confidenceBand(0.1)).toBe('low');
  });

  it('formats durations and truncated text', () => {
    expect(formatDuration({ min: 45, max: 45 })).toBe('45 min');
    expect(formatDuration({ min: 60, max: 120 })).toBe('1 h – 2 h');
    expect(formatDuration({ min: 90, max: 90 })).toBe('1 h 30 min');
    expect(truncate('SNAPFIX diagnosis', 8)).toBe('SNAPFIX…');
    expect(truncate('short', 10)).toBe('short');
  });

  it('renders estimate ranges only when available', () => {
    expect(
      formatEstimateRange(
        {
          status: 'available',
          currency: 'MAD',
          minimum: 300,
          maximum: 600,
          includes_parts: true,
          includes_labor: false,
          assumptions: [],
          confidence: 'medium',
          data_source: 'Reference',
          last_verified_at: '2026-10-01T00:00:00.000Z',
          unavailable_reason: null,
        },
        'en',
      ),
    ).toContain('MAD');
    expect(
      formatEstimateRange(
        {
          status: 'unavailable',
          currency: 'MAD',
          minimum: null,
          maximum: null,
          includes_parts: null,
          includes_labor: null,
          assumptions: [],
          confidence: null,
          data_source: null,
          last_verified_at: null,
          unavailable_reason: ESTIMATE_REASONS.currencyUnavailable,
        },
        'en',
      ),
    ).toBeNull();
  });

  it('maps estimate reasons and safety levels to translation keys', () => {
    expect(estimateReasonKey(ESTIMATE_REASONS.noVerifiedPricing)).toBe(
      'estimate.reason.no_verified_pricing',
    );
    expect(estimateReasonKey('something_else')).toBe('estimate.reason.unknown');
    expect(safetyColorKey('critical')).toBe('critical');
    expect(safetyColorKey('high')).toBe('danger');
    expect(safetyColorKey('medium')).toBe('warning');
    expect(safetyColorKey('low')).toBe('success');
  });

  it('validates and advances ISO dates', () => {
    expect(isValidDateInput('2026-02-28')).toBe(true);
    expect(isValidDateInput('2026-02-30')).toBe(false);
    expect(isValidDateInput('28/02/2026')).toBe(false);
    expect(addMonthsToDate('2026-01-15', 1)).toBe('2026-02-15');
    expect(addMonthsToDate('2026-01-15', 12)).toBe('2027-01-15');
    expect(isDateWithinDays(todayIsoDate(), 1)).toBe(true);
    expect(isDateWithinDays('2999-01-01', 30)).toBe(false);
  });
});
