import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  ApiError,
  asString,
  asUuid,
  corsHeaders,
  errorResponse,
  json,
  readJson,
  requireEnv,
  requireMethod,
} from '../_shared/http.ts';

/**
 * Minimal provider-neutral billing webhook.
 *
 * This function is intentionally not tied to RevenueCat, Stripe, or the app
 * stores. Your billing provider (or a small adapter) must call it with the
 * shared secret after verifying its own signature. It only grants/revokes the
 * `premium` entitlement; it never handles card data.
 */

type BillingEvent =
  | 'subscription.activated'
  | 'subscription.renewed'
  | 'subscription.cancelled'
  | 'subscription.expired';

const EVENTS: BillingEvent[] = [
  'subscription.activated',
  'subscription.renewed',
  'subscription.cancelled',
  'subscription.expired',
];

function sharedSecret(req: Request): string {
  const header = req.headers.get('x-webhook-secret') ?? '';
  if (header) return header;
  const auth = req.headers.get('Authorization') ?? '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? '';
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) });
  }

  try {
    requireMethod(req, 'POST');
    const expected = requireEnv('BILLING_WEBHOOK_SECRET');
    const provided = sharedSecret(req);
    if (!provided || !timingSafeEqual(provided, expected)) {
      throw new ApiError('unauthorized', 'Invalid webhook secret', 401);
    }

    const body = await readJson<{
      event?: unknown;
      userId?: unknown;
      provider?: unknown;
      providerReference?: unknown;
      currentPeriodEnd?: unknown;
    }>(req);

    const event = asString(body.event, 'event', 64) as BillingEvent;
    if (!EVENTS.includes(event)) {
      throw new ApiError('invalid_input', 'Unknown billing event', 400);
    }
    const userId = asUuid(body.userId, 'userId');
    const provider =
      body.provider === undefined ? 'manual' : asString(body.provider, 'provider', 64);
    const providerReference =
      body.providerReference === undefined
        ? null
        : asString(body.providerReference, 'providerReference', 200);

    let currentPeriodEnd: string | null = null;
    if (body.currentPeriodEnd !== undefined && body.currentPeriodEnd !== null) {
      const raw = asString(body.currentPeriodEnd, 'currentPeriodEnd', 64);
      const parsed = new Date(raw);
      if (Number.isNaN(parsed.getTime())) {
        throw new ApiError('invalid_input', 'currentPeriodEnd must be an ISO date', 400);
      }
      currentPeriodEnd = parsed.toISOString();
    }

    const status =
      event === 'subscription.activated' || event === 'subscription.renewed'
        ? 'active'
        : event === 'subscription.cancelled'
          ? 'inactive'
          : 'expired';

    if (
      status === 'active' &&
      currentPeriodEnd &&
      new Date(currentPeriodEnd).getTime() <= Date.now()
    ) {
      throw new ApiError('invalid_input', 'An active entitlement needs a future period end', 400);
    }

    const supabaseUrl = requireEnv('SUPABASE_URL');
    const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error } = await admin.from('entitlements').upsert(
      {
        user_id: userId,
        entitlement: 'premium',
        provider,
        provider_reference: providerReference,
        status,
        current_period_end: currentPeriodEnd,
      },
      { onConflict: 'user_id,entitlement' },
    );

    if (error) {
      console.error('entitlement upsert failed', error.message);
      throw new ApiError('unknown', 'The entitlement could not be updated', 500);
    }

    return json(req, { received: true, event, status });
  } catch (error) {
    return errorResponse(req, error);
  }
});
