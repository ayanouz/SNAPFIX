import { getSupabaseClient } from '@/services/supabase/client';
import { appConfig } from '@/constants/config';

/**
 * Minimal analytics abstraction. Events are only stored in Supabase for signed-in
 * live users. Demo mode logs to the console in development and sends nothing.
 * No photos, descriptions, emails, or free-text content belong in metadata.
 */

export const ANALYTICS_EVENTS = [
  'onboarding_completed',
  'first_diagnosis_started',
  'first_diagnosis_completed',
  'diagnosis_failed',
  'repair_guide_opened',
  'repair_step_completed',
  'diagnosis_saved',
  'diagnosis_shared',
  'return_visit',
  'subscription_screen_viewed',
  'purchase_completed',
  'feedback_submitted',
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

export async function trackEvent(
  userId: string | null,
  event: AnalyticsEvent,
  metadata: Record<string, string | number | boolean> = {},
): Promise<void> {
  if (!userId || appConfig.demoMode) {
    if (__DEV__) console.info(`[analytics:demo] ${event}`, metadata);
    return;
  }
  const supabase = getSupabaseClient();
  if (!supabase) return;
  try {
    await supabase.from('analytics_events').insert({
      user_id: userId,
      event_type: event,
      metadata,
    });
  } catch {
    // Analytics must never block or break a user flow.
  }
}
