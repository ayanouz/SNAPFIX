import { analysisSchema, extractJsonObject, parseAnalysis } from '@/domain/diagnosis/schema';
import { generateDemoAnalysis } from '@/services/demo/demoAnalyzer';

const input = {
  category: 'appliance' as const,
  description: 'The washing machine leaks water from the door during the spin cycle.',
  brand: 'Example',
  model: 'WM-100',
  errorCode: null,
  imageCount: 2,
  locale: 'en',
  currency: 'MAD',
};

describe('diagnosis schema contract', () => {
  it('accepts a complete demo analysis', () => {
    const analysis = generateDemoAnalysis(input);
    const parsed = parseAnalysis(analysis);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.provider.mode).toBe('demo');
      expect(parsed.data.observations.length).toBeGreaterThan(0);
      expect(parsed.data.possible_causes.length).toBeGreaterThan(0);
      expect(parsed.data.estimate.status).toBe('unavailable');
    }
  });

  it('rejects DIY repair for a professional-required assessment', () => {
    const analysis = generateDemoAnalysis(input);
    const unsafe = JSON.parse(JSON.stringify(analysis)) as typeof analysis;
    unsafe.safety.professional_required = true;
    unsafe.safety.risk_level = 'high';
    unsafe.safety.stop_guidance = true;
    unsafe.repairability.verdict = 'diy';
    for (const option of unsafe.repair_options) {
      option.professional_only = false;
      for (const step of option.steps) step.requires_professional = false;
    }

    const result = analysisSchema.safeParse(unsafe);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message);
      expect(messages).toContain('Professional-required diagnoses must not recommend DIY repair');
    }
  });

  it('rejects an available estimate without a source', () => {
    const analysis = generateDemoAnalysis(input);
    const invalid = JSON.parse(JSON.stringify(analysis)) as typeof analysis;
    invalid.estimate = {
      status: 'available',
      currency: 'MAD',
      minimum: 100,
      maximum: 200,
      includes_parts: true,
      includes_labor: false,
      assumptions: ['Reference data'],
      confidence: 'medium',
      data_source: null,
      last_verified_at: new Date().toISOString(),
      unavailable_reason: null,
    };

    expect(analysisSchema.safeParse(invalid).success).toBe(false);
  });

  it('extracts JSON from fenced or prose-wrapped provider output', () => {
    expect(extractJsonObject('```json\n{"ok":true}\n```')).toEqual({ ok: true });
    expect(extractJsonObject('Here is the result: {"ok":true} — done')).toEqual({ ok: true });
  });
});
