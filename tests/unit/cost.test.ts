import {
  compareQuotes,
  ESTIMATE_REASONS,
  estimateRepair,
  type PriceReference,
} from '@/domain/diagnosis/cost';
import { generateDemoAnalysis } from '@/services/demo/demoAnalyzer';

const now = new Date('2026-10-24T12:00:00.000Z');

function analysisWithCause() {
  const analysis = generateDemoAnalysis({
    category: 'appliance',
    description: 'The washing machine leaks water from the door during the spin cycle.',
    imageCount: 1,
    locale: 'en',
    currency: 'MAD',
  });
  const cause = analysis.possible_causes[0];
  if (!cause) throw new Error('Demo analysis did not include a cause');
  cause.title = 'Door seal failure';
  cause.explanation = 'The door seal is worn and lets water through.';
  return analysis;
}

const reference: PriceReference = {
  id: 'ref-1',
  category: 'appliance',
  currency: 'MAD',
  region: 'MA',
  partName: 'Door seal',
  causeKeywords: ['door seal'],
  minPrice: 200,
  maxPrice: 400,
  includesParts: true,
  includesLabor: false,
  laborRatePerHour: 100,
  laborHoursMin: 1,
  laborHoursMax: 2,
  sourceName: 'Verified local repair dataset',
  sourceUrl: null,
  verifiedAt: '2026-10-01T00:00:00.000Z',
};

describe('deterministic cost estimator', () => {
  it('returns a range only from a matching verified reference', () => {
    const estimate = estimateRepair({
      analysis: analysisWithCause(),
      currency: 'mad',
      region: 'MA',
      references: [reference],
      now,
    });

    expect(estimate.status).toBe('available');
    expect(estimate.currency).toBe('MAD');
    expect(estimate.minimum).toBe(300);
    expect(estimate.maximum).toBe(600);
    expect(estimate.includes_parts).toBe(true);
    expect(estimate.includes_labor).toBe(false);
    expect(estimate.data_source).toBe('Verified local repair dataset');
    expect(estimate.assumptions.some((line) => line.includes('Labour is not included'))).toBe(true);
  });

  it('returns unavailable when no reference exists in the requested currency', () => {
    const estimate = estimateRepair({
      analysis: analysisWithCause(),
      currency: 'MAD',
      region: 'MA',
      references: [{ ...reference, currency: 'EUR' }],
      now,
    });

    expect(estimate.status).toBe('unavailable');
    expect(estimate.unavailable_reason).toBe(ESTIMATE_REASONS.currencyUnavailable);
    expect(estimate.minimum).toBeNull();
  });

  it('returns unavailable for expired or region-mismatched references', () => {
    const expired = estimateRepair({
      analysis: analysisWithCause(),
      currency: 'MAD',
      region: 'MA',
      references: [{ ...reference, verifiedAt: '2020-01-01T00:00:00.000Z' }],
      now,
    });
    expect(expired.unavailable_reason).toBe(ESTIMATE_REASONS.noVerifiedPricing);

    const otherRegion = estimateRepair({
      analysis: analysisWithCause(),
      currency: 'MAD',
      region: 'FR',
      references: [reference],
      now,
    });
    expect(otherRegion.unavailable_reason).toBe(ESTIMATE_REASONS.noVerifiedPricing);
  });

  it('returns unavailable when the reference does not match the described cause', () => {
    const estimate = estimateRepair({
      analysis: analysisWithCause(),
      currency: 'MAD',
      region: 'MA',
      references: [{ ...reference, causeKeywords: ['compressor bearing'] }],
      now,
    });

    expect(estimate.status).toBe('unavailable');
    expect(estimate.unavailable_reason).toBe(ESTIMATE_REASONS.insufficientDetail);
  });

  it('compares real quotes and never mixes currencies', () => {
    const comparison = compareQuotes([
      { id: 'q1', label: 'Repair A', amount: 900, currency: 'MAD', type: 'repair' },
      { id: 'q2', label: 'Repair B', amount: 700, currency: 'MAD', type: 'repair' },
      { id: 'q3', label: 'Replace', amount: 1500, currency: 'MAD', type: 'replacement' },
    ]);

    expect(comparison.cheapestRepair?.id).toBe('q2');
    expect(comparison.repairQuotes.map((quote) => quote.id)).toEqual(['q2', 'q1']);
    expect(comparison.savingsVsReplacement).toBe(800);
    expect(comparison.mixedCurrencies).toBe(false);

    const mixed = compareQuotes([
      { id: 'q1', label: 'Repair', amount: 900, currency: 'MAD', type: 'repair' },
      { id: 'q2', label: 'Replace', amount: 1500, currency: 'EUR', type: 'replacement' },
    ]);
    expect(mixed.mixedCurrencies).toBe(true);
    expect(mixed.savingsVsReplacement).toBeNull();
    expect(mixed.currency).toBeNull();
  });
});
