import {
  canCreateDiagnosis,
  currentMonthPeriod,
  isEntitlementActive,
  PLAN_LIMITS,
  usageSummary,
} from '@/domain/usage';

describe('plan limits and usage accounting', () => {
  it('uses UTC calendar months', () => {
    const period = currentMonthPeriod(new Date('2026-10-24T23:30:00.000Z'));
    expect(period.start.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(period.end.toISOString()).toBe('2026-11-01T00:00:00.000Z');
  });

  it('clamps used counts to the plan limit', () => {
    const summary = usageSummary('free', 12, new Date('2026-10-24T12:00:00.000Z'));
    expect(summary.used).toBe(PLAN_LIMITS.free.diagnosesPerMonth);
    expect(summary.remaining).toBe(0);
    expect(summary.limit).toBe(5);
    expect(summary.historyLimit).toBe(20);
  });

  it('exposes premium limits without a history cap', () => {
    const summary = usageSummary('premium', 6, new Date('2026-10-24T12:00:00.000Z'));
    expect(summary.plan).toBe('premium');
    expect(summary.used).toBe(6);
    expect(summary.limit).toBe(30);
    expect(summary.historyLimit).toBeNull();
    expect(summary.maxPhotos).toBe(3);
  });

  it('decides whether a new diagnosis is allowed', () => {
    expect(canCreateDiagnosis('free', 4)).toBe(true);
    expect(canCreateDiagnosis('free', 5)).toBe(false);
    expect(canCreateDiagnosis('premium', 29)).toBe(true);
  });

  it('validates entitlement status and expiry', () => {
    const now = new Date('2026-10-24T12:00:00.000Z');
    expect(isEntitlementActive({ status: 'active', currentPeriodEnd: null }, now)).toBe(true);
    expect(
      isEntitlementActive({ status: 'active', currentPeriodEnd: '2026-11-24T12:00:00.000Z' }, now),
    ).toBe(true);
    expect(
      isEntitlementActive({ status: 'active', currentPeriodEnd: '2026-10-01T12:00:00.000Z' }, now),
    ).toBe(false);
    expect(isEntitlementActive({ status: 'expired', currentPeriodEnd: null }, now)).toBe(false);
    expect(isEntitlementActive(null, now)).toBe(false);
  });
});
