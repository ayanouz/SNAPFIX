import {
  applySafetyPolicy,
  assessSafety,
  containsUnsafeInstruction,
  highestRisk,
  normalizeForMatching,
} from '@/domain/diagnosis/safety';
import { generateDemoAnalysis } from '@/services/demo/demoAnalyzer';

const safeInput = {
  category: 'furniture' as const,
  description: 'The wooden chair has a loose screw in the backrest.',
  imageCount: 1,
  locale: 'en',
  currency: 'MAD',
};

describe('deterministic safety policy', () => {
  it('escalates a gas smell regardless of the model output', () => {
    const assessment = assessSafety({
      text: 'I smell gas near the boiler and hear a hiss.',
      category: 'heating_cooling',
      identifiedType: 'gas boiler',
    });

    expect(assessment.riskLevel).toBe('critical');
    expect(assessment.professionalRequired).toBe(true);
    expect(assessment.stopGuidance).toBe(true);
    expect(assessment.matchedCodes).toContain('gas_leak');
  });

  it('detects exposed wiring as an electrical hazard', () => {
    const assessment = assessSafety({
      text: 'There are exposed wires beside the wall socket.',
      category: 'electrical',
      identifiedType: 'wall socket',
    });

    expect(assessment.riskLevel).toBe('high');
    expect(assessment.professionalRequired).toBe(true);
    expect(assessment.matchedCodes).toContain('electrical_hazard');
  });

  it('keeps a genuinely low-risk description at low risk', () => {
    const assessment = assessSafety({
      text: safeInput.description,
      category: safeInput.category,
      identifiedType: 'chair',
    });

    expect(assessment.riskLevel).toBe('low');
    expect(assessment.professionalRequired).toBe(false);
    expect(assessment.warnings).toHaveLength(0);
  });

  it('removes guided repair when a hazard is present in the context', () => {
    const base = generateDemoAnalysis(safeInput);
    const escalated = applySafetyPolicy(base, {
      text: 'I also smell gas in the room.',
      locale: 'en',
      category: 'furniture',
    });

    expect(escalated.safety.risk_level).toBe('critical');
    expect(escalated.safety.professional_required).toBe(true);
    expect(escalated.safety.stop_guidance).toBe(true);
    expect(escalated.repair_options).toHaveLength(0);
    expect(escalated.repairability.verdict).toBe('professional');
    expect(escalated.next_steps.some((step) => step.type === 'professional')).toBe(true);
  });

  it('identifies dangerous DIY instructions', () => {
    expect(containsUnsafeInstruction('Bypass the safety interlock and test live')).toBe(true);
    expect(containsUnsafeInstruction('Switch off the appliance and unplug it')).toBe(false);
    expect(normalizeForMatching('  Gaz  FUITE ')).toBe('gaz fuite');
  });

  it('ranks risk levels deterministically', () => {
    expect(highestRisk('low', 'medium', 'high')).toBe('high');
    expect(highestRisk('critical', 'low')).toBe('critical');
  });
});
