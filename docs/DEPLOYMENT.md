# Deployment

This guide describes a complete live deployment. **None of these hosted steps have been executed in this repository's verification environment.** Supabase CLI, Docker, Deno, an Android SDK, and macOS/iOS tooling were unavailable. Treat each step as unverified until you run it.

## 1. Prerequisites

- Node.js 20.19+ and npm
- A Supabase project (Postgres 17 recommended)
- Supabase CLI (`npx supabase`)
- An AI provider account and API key (OpenAI, Anthropic, or Gemini)
- An Expo account and EAS CLI (`npx eas-cli@latest`)
- Android signing credentials; Apple Developer account for iOS
- A billing adapter if you intend to sell premium (not included)

## 2. Create the Supabase project

1. Create a project in the Supabase dashboard.
2. Record the project ref, URL, anon key, and service-role key.
3. Keep the service-role key out of the mobile environment.

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
```

## 3. Apply database migrations

Review the SQL first:

```bash
npx supabase db diff --linked
npx supabase db push
```

Or apply through the dashboard SQL editor in order:

1. `supabase/migrations/20261024000100_core_schema.sql`
2. `supabase/migrations/20261024000200_rls_storage_integrity.sql`

Verify:

- all public tables have RLS enabled
- the `diagnosis-images` bucket exists and is private
- `claim_diagnosis_usage` is executable only by `service_role`
- the `diagnoses_guard_writes` trigger exists

Run the two-user isolation test described in [TESTING.md](TESTING.md) before using real data.

## 4. Configure Auth

In Supabase Dashboard → Authentication:

- Enable email/password.
- Set the Site URL and redirect URLs for the app scheme:
  - `snapfix://reset-password`
  - `snapfix://` (email confirmation/deep links, if used)
- Configure a production SMTP/email provider.
- Decide whether email confirmation is required.
- Set rate limits and password policy.
- Configure the app name/sender used in emails.

The client uses PKCE and a custom scheme. Confirm the reset link opens `/reset-password` on both platforms.

## 5. Deploy Edge Functions

```bash
npx supabase functions deploy analyze-diagnosis
npx supabase functions deploy delete-account
npx supabase functions deploy billing-webhook --no-verify-jwt
```

`supabase/config.toml` already declares:

- `analyze-diagnosis`: `verify_jwt = true`
- `delete-account`: `verify_jwt = true`
- `billing-webhook`: `verify_jwt = false`

Confirm the deployed settings in the dashboard. Do not disable JWT verification for the analysis or deletion functions.

## 6. Set server-side secrets

Generate a long random billing secret, then set secrets:

```bash
npx supabase secrets set AI_PROVIDER=openai
npx supabase secrets set AI_API_KEY=<provider-key>
npx supabase secrets set AI_MODEL=<provider-model>
npx supabase secrets set AI_ALLOW_DEMO=false
npx supabase secrets set AI_TIMEOUT_MS=60000
npx supabase secrets set PRICE_REGION=MA
npx supabase secrets set BILLING_WEBHOOK_SECRET=<long-random-secret>
npx supabase secrets set ALLOWED_ORIGINS=https://your-web-client.example
```

Optional:

```bash
npx supabase secrets set AI_BASE_URL=https://api.openai.com/v1
npx supabase secrets set AI_MAX_TOKENS=4096
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are provided by the Supabase function runtime; do not paste them into the mobile app.

Verify:

```bash
npx supabase secrets list
```

Secrets are write-only in the dashboard after creation; rotate rather than trying to read them back.

## 7. Add verified price references

The seed intentionally contains no prices. Insert real, verified rows:

```sql
insert into public.price_references (
  category, currency, region, part_name, cause_keywords,
  min_price, max_price, includes_parts, includes_labor,
  labor_hours_min, labor_hours_max, labor_rate_per_hour,
  source_name, source_url, verified_at, verified_by
) values (
  'plumbing', 'MAD', 'MA', 'Replacement fill valve',
  array['fill valve', 'toilet runs', 'robinet de remplissage'],
  120, 250, true, false,
  1, 2, 150,
  'Verified supplier catalogue', 'https://example.com/source',
  '2026-10-01T00:00:00Z', 'reviewer-name'
);
```

Only use data you have actually verified. Until rows exist, the app correctly returns “estimate unavailable”.

## 8. Configure the mobile environment

Create `.env` from `.env.example`:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
EXPO_PUBLIC_ENABLE_DEMO_MODE=false
EXPO_PUBLIC_SUPPORT_EMAIL=support@your-domain.example
EXPO_PUBLIC_ENVIRONMENT=production
```

`EXPO_PUBLIC_*` values are embedded at build time. Rebuild after changing them; a JavaScript-only reload will not pick up new values.

Never put the service-role key or AI key in `.env` for the mobile build.

## 9. Build with EAS

The app identifiers are already set in `app.json`:

- Android package: `com.snapfix.app`
- iOS bundle identifier: `com.snapfix.app`
- Scheme: `snapfix`

Initialize/link EAS:

```bash
npx eas-cli@latest init
npx eas-cli@latest build:configure
```

The repository includes `eas.json` with development, preview, and production profiles. Adjust the EAS CLI version and credentials as needed.

Development build:

```bash
npx eas-cli@latest build --profile development --platform android
npx eas-cli@latest build --profile development --platform ios
```

Production:

```bash
npx eas-cli@latest build --profile production --platform android
npx eas-cli@latest build --profile production --platform ios
```

Notes:

- Expo Go is not sufficient for notifications, secure storage, or a full native verification.
- Android: create/upload a keystore and keep it backed up.
- iOS: configure certificates/provisioning; `usesNonExemptEncryption` is set to false, but confirm export compliance with counsel.
- App icons, adaptive icons, splash, and notification icons are generated by `npm run assets`.
- Android `allowBackup` is false. Review whether this matches your data policy.
- The app uses the new architecture and React Compiler; test on both platforms.

## 10. Submit

```bash
npx eas-cli@latest submit --profile production --platform android
npx eas-cli@latest submit --profile production --platform ios
```

Before submitting, complete [STORE_RELEASE_CHECKLIST.md](STORE_RELEASE_CHECKLIST.md).

## 11. Billing (not connected)

There is **no working in-app purchase flow**. The subscription screen explicitly says billing is not connected.

To enable premium:

1. Integrate the store purchase flow or a provider such as RevenueCat.
2. Verify receipts server-side.
3. Have your trusted adapter call `billing-webhook` with `x-webhook-secret` after verifying the provider signature.
4. Test activation, renewal, cancellation, expiry, restore, and refunds.
5. Ensure the entitlement expires correctly and the UI updates.

Do not ship a fake “upgrade” button that grants premium locally.

## 12. CI

`.github/workflows/ci.yml` runs:

- `npm ci`
- lint
- format check
- typecheck
- `expo-doctor`
- tests
- Android bundle export

It does not deploy. Add deployment jobs only after credentials and environment protection are configured. Never print secrets in CI logs.

## 13. Post-deployment verification

### Infrastructure

- [ ] Migrations applied without error.
- [ ] RLS enabled on all tables.
- [ ] Storage bucket private; path policy works for two users.
- [ ] `analyze-diagnosis` rejects a missing JWT.
- [ ] `delete-account` rejects `confirm: false`.
- [ ] `billing-webhook` rejects a wrong secret.
- [ ] `AI_ALLOW_DEMO=false` in production.
- [ ] AI provider request succeeds with a real photo.
- [ ] Provider failure marks the diagnosis failed with a safe message.
- [ ] Quota claim is atomic under two concurrent requests.

### App

- [ ] Live mode banner shows “Live”, not demo.
- [ ] Signup, email confirmation, sign-in, reset, sign-out.
- [ ] Photo upload, analysis, guide, quotes, maintenance.
- [ ] Export and delete all data.
- [ ] Account deletion.
- [ ] Offline and poor-network behavior.
- [ ] RTL, dark mode, and large text on a physical device.
- [ ] Notification permission and reminder tap.

### Store

- [ ] Screenshots and metadata.
- [ ] Privacy policy and terms URLs.
- [ ] Data safety / privacy nutrition labels.
- [ ] Content rating.
- [ ] Review notes explaining demo mode and AI limitations.
- [ ] No placeholder support email.
- [ ] No test API keys or debug banners.

## 14. Rollback

- **Edge Function:** redeploy the previous commit with `npx supabase functions deploy <name>`.
- **Database:** migrations are forward-only. Restore from a verified backup or write a compensating migration. Test rollback on staging first.
- **Mobile:** use EAS update rollback if the build uses updates, or submit a new build. Store builds cannot be “downgraded” for users.
- **Secrets:** rotate the affected key; revoke old provider credentials.
- **AI incident:** disable the provider path immediately (remove/rotate key, or pause the function) and follow [AI_SAFETY.md](AI_SAFETY.md).

## 15. Monitoring

- Supabase function logs and error rates
- Postgres connection/CPU/storage
- Auth failure and signup rates
- AI provider latency, 429s, and invalid-response rates
- Quota claims vs. plan distribution
- Storage growth and orphaned objects
- Crash reporting (not included; add a provider if required)
- Alerting for 5xx spikes and repeated `ai_failed`

## 16. Deployment status

The following remain **unverified**:

- hosted migrations and RLS behavior
- Storage policy behavior
- Edge Function execution and Deno imports
- live AI provider calls
- email delivery and deep links
- EAS builds and store submissions
- billing webhook and entitlement lifecycle
- native notifications
- performance and battery behavior on low-end devices
