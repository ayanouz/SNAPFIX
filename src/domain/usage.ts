export const PLAN_LIMITS = {
  free: {
    diagnosesPerMonth: 5,
    historyLimit: 20,
    maxPhotos: 2,
    maxReassessments: 1,
  },
  premium: {
    diagnosesPerMonth: 30,
    historyLimit: null,
    maxPhotos: 3,
    maxReassessments: 3,
  },
} as const;

export type Plan = keyof typeof PLAN_LIMITS;

export function currentMonthPeriod(now: Date = new Date()): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return { start, end };
}

export function usageSummary(plan: Plan, usedCount: number, now: Date = new Date()) {
  const limits = PLAN_LIMITS[plan];
  const period = currentMonthPeriod(now);
  const used = Math.max(0, Math.min(usedCount, limits.diagnosesPerMonth));
  return {
    plan,
    used,
    limit: limits.diagnosesPerMonth,
    remaining: Math.max(0, limits.diagnosesPerMonth - used),
    periodStart: period.start.toISOString(),
    periodEnd: period.end.toISOString(),
    historyLimit: limits.historyLimit,
    maxPhotos: limits.maxPhotos,
    maxReassessments: limits.maxReassessments,
  };
}

export function canCreateDiagnosis(plan: Plan, usedCount: number): boolean {
  return usedCount < PLAN_LIMITS[plan].diagnosesPerMonth;
}

export function isEntitlementActive(
  entitlement: { status: string; currentPeriodEnd: string | null } | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!entitlement || entitlement.status !== 'active') return false;
  if (!entitlement.currentPeriodEnd) return true;
  const end = new Date(entitlement.currentPeriodEnd);
  return !Number.isNaN(end.getTime()) && end.getTime() > now.getTime();
}
