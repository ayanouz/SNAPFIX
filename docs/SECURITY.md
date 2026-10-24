# Security

## 1. Scope and status

This document covers the mobile app, Supabase schema, Storage, Edge Functions, and release configuration in this repository.

**Verification status:** the security design is implemented in code, but RLS, Storage policies, Edge Functions, native builds, and a hosted Supabase project have **not** been exercised in this environment. Do not treat this document as a completed penetration test or compliance certification.

## 2. Assets

- User accounts and email addresses
- Diagnosis descriptions and photos (potentially sensitive: home interiors, vehicles, personal items)
- Safety assessments and repair guidance
- Cost quotes and maintenance schedules
- Support messages
- AI provider keys, Supabase service-role key, billing webhook secret
- Entitlement records

## 3. Trust boundaries

```text
Untrusted: user input, photos, AI provider output, browser origins, network
Trusted:   mobile binary, Supabase Auth, Postgres RLS, service-role Edge Functions
```

The mobile app is **not** trusted to enforce authorization. A modified client can call Supabase directly, so RLS and database triggers must enforce the rules.

The AI provider is **not** trusted. Its output is parsed, validated, and passed through deterministic safety and cost logic.

## 4. Secrets

### Client (public)

Only `EXPO_PUBLIC_*` values are bundled into the app:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_ENABLE_DEMO_MODE`
- `EXPO_PUBLIC_SUPPORT_EMAIL`
- `EXPO_PUBLIC_ENVIRONMENT`

The Supabase anon key is designed to be public; RLS is the protection. It must still be treated as a project identifier and rotated if abused.

### Server-only

Never place these in `EXPO_PUBLIC_*` or commit them:

- `SUPABASE_SERVICE_ROLE_KEY`
- `AI_API_KEY`
- `BILLING_WEBHOOK_SECRET`
- any provider private key or store credential

Set them with the Supabase CLI:

```bash
npx supabase secrets set AI_PROVIDER=openai AI_API_KEY=... AI_MODEL=...
npx supabase secrets set BILLING_WEBHOOK_SECRET=...
```

`.env` is ignored by git; `.env.example` contains placeholders only. The repository does not contain real credentials.

### Secret handling rules

- Rotate any key that was ever pasted into a chat, log, screenshot, or commit.
- Do not log request bodies, tokens, image bytes, or provider prompts containing user data.
- Use separate Supabase projects for development/staging/production.
- Restrict who can read Edge Function secrets.
- Set `ALLOWED_ORIGINS` to the exact browser origins that need CORS; native apps send no Origin.

## 5. Authentication

Live mode uses Supabase Auth email/password:

- Sessions persist in AsyncStorage with auto-refresh and PKCE.
- Password reset uses a Supabase recovery link to `snapfix://reset-password`.
- `AuthProvider` listens for auth state changes, creates a repository for the session, and clears the query cache on sign-out.
- The Edge Functions verify the bearer token with `auth.getUser(token)` and then scope all queries by the verified user ID.
- Account deletion requires a valid JWT and `confirm: true`.

Recommendations before launch:

- Enable email confirmation and a production email provider.
- Configure password strength and rate limits in Supabase Auth.
- Add CAPTCHA or abuse protection if signup is public.
- Decide whether to require email verification for diagnosis use.
- Enable MFA for operator accounts (not end users) where available.

Demo mode uses a local demo account with no server auth. It must never be presented as secure account storage.

## 6. Authorization

- RLS is enabled on all public tables.
- User-owned rows are scoped to `auth.uid()`.
- `diagnoses` inserts must be empty drafts owned by the caller.
- Normal clients can update only `is_saved` and `updated_at` on a diagnosis.
- `usage_events` inserts are revoked from clients; quota claims happen through a service-role RPC.
- `entitlements` writes are service-role only.
- `price_references` are read-only to clients.
- `repair_guides` are written by the analysis function, not the client.
- Storage object paths must start with the authenticated user's ID.

The database write guard is critical: even if a malicious client sends a completed analysis or a lower safety level, the trigger rejects it.

## 7. Storage

- Bucket is private.
- 8 MiB limit and MIME allow-list.
- Path convention `<userId>/<diagnosisId>/<file>`.
- RLS checks `(storage.foldername(name))[1] = auth.uid()::text`.
- Display uses short-lived signed URLs.
- Account deletion removes the user's folders through the service role.
- No public bucket URLs are stored.

Open risks to verify on the hosted project:

- Confirm `storage.foldername` behaves as expected for all path shapes.
- Confirm signed URL lifetime is acceptable.
- Confirm image EXIF/metadata is stripped or acceptable for privacy. The app compresses images, but this is not a formal metadata scrubber.
- Add malware/content scanning if the product scope requires it.

## 8. Edge Functions

### `analyze-diagnosis`

- JWT required.
- Verifies ownership before any service-role access.
- Origin allow-list for browser clients.
- Atomic quota claim with an advisory lock.
- Optimistic attempt update prevents concurrent double analysis.
- Downloads only the diagnosis's own images.
- Enforces image size/type before sending to the provider.
- Applies safety and cost policy server-side.
- Marks failures with user-safe codes; raw provider errors are not returned.
- Service-role client is created only after authentication.

### `delete-account`

- JWT required.
- Requires `confirm: true`.
- Removes storage objects, then deletes the Auth user.
- Cascades database rows.
- Logs only generic failure messages.

### `billing-webhook`

- JWT verification disabled because the billing provider cannot present a Supabase user JWT.
- Authenticated with a shared secret using constant-time comparison.
- **This is not a substitute for provider signature verification.** Your adapter must verify the billing provider's webhook signature before calling this function.
- Accepts only four event types and validates UUID/date fields.
- Rejects an active entitlement with a past period end.
- Writes only the premium entitlement.

## 9. AI security

- API keys stay server-side.
- The provider receives only the diagnosis context needed for analysis.
- Output is treated as untrusted text and parsed as JSON.
- Strict Zod validation rejects unexpected shapes.
- Safety policy runs after the model, not instead of it.
- Unsafe instructions are removed.
- The app has no tool execution path for model output.
- Prompt-injection attempts in images/text are data, not commands.
- Provider timeouts and error codes are bounded.
- No model output is used for pricing.

Residual risks:

- The provider may retain data according to its own policy; review its data-processing terms and configure zero-retention if required.
- A model can still generate incorrect hypotheses; the UI labels them accordingly.
- Regex-based safety can miss unusual phrasing.
- The live provider path has not been tested with real keys.

## 10. Billing security

- No card data is handled by SNAPFIX.
- No fake purchase flow is presented; the subscription screen states billing is not connected.
- Premium is granted only by a trusted adapter calling the webhook with the shared secret.
- Entitlement status is checked for expiry in both the Edge Function and the client.
- The client cannot write `entitlements`.
- Before launch, integrate the actual store purchase flow (RevenueCat, StoreKit, Play Billing, or a custom adapter) and verify receipts server-side.

## 11. Mobile app hardening

Implemented:

- Auth session storage in AsyncStorage (Supabase default). For higher assurance, evaluate SecureStore for refresh tokens, subject to Supabase client support and token-size limits.
- No service keys in the bundle.
- Images compressed before upload.
- Image count and size limits.
- User-safe error messages.
- Deep-link auth guard.
- Query cache cleared on sign-out.
- No analytics SDK; optional first-party events.
- Android `allowBackup: false`.
- `usesNonExemptEncryption: false` for iOS export compliance (confirm with legal).

Recommended before store release:

- Add certificate pinning only if you can operate it safely; it can break on certificate rotation.
- Add jailbreak/root detection if the threat model requires it.
- Add screenshot protection for sensitive screens if needed (trade-off with usability).
- Review clipboard usage for share/export.
- Run a mobile security scanner and a manual penetration test.
- Confirm AsyncStorage is acceptable for the session token on target devices; consider SecureStore with a documented migration if required.
- Ensure logs are disabled or redacted in production.

## 12. Logging and monitoring

- Edge Functions log generic error messages, not tokens or image data.
- The client does not log request bodies.
- Avoid adding diagnosis text or signed URLs to analytics.
- Set up alerts for spikes in `ai_failure`, `quota_exceeded`, auth failures, and function 5xx rates.
- Define retention for Supabase logs and any error-reporting service.

## 13. Data protection and deletion

- Export: JSON bundle of diagnoses, maintenance, feedback, quotes, progress.
- Delete all data: storage objects + diagnoses, maintenance, support messages; related rows cascade.
- Delete account: storage objects + Auth user; all user rows cascade.
- Backups may retain deleted data for the backup retention window; disclose this in the privacy policy.
- Define a retention period for support messages and analytics.
- Confirm legal basis, consent, and data-residency requirements for target markets (including Morocco/EU if applicable).

## 14. Supply chain

- Dependencies are installed with `npx expo install` for SDK compatibility.
- `package-lock.json` is committed.
- CI runs lint, typecheck, and tests.
- Review dependency advisories before release (`npm audit` / Dependabot).
- Pin CI actions by major version at minimum; consider commit SHAs for higher assurance.
- Do not add unvetted native modules that request broad permissions.

## 15. Release security checklist

- [ ] No `.env`, service keys, AI keys, or signing secrets in git.
- [ ] `git grep` for `service_role`, `AI_API_KEY`, `BEGIN PRIVATE KEY`, and webhook secrets.
- [ ] Supabase project uses production Auth settings and email confirmation.
- [ ] RLS verified with two test users (cannot read each other's data).
- [ ] Storage policies verified with two test users.
- [ ] Edge Functions reject missing/expired JWTs.
- [ ] `ALLOWED_ORIGINS` set; no wildcard.
- [ ] `AI_ALLOW_DEMO=false` in production.
- [ ] Billing webhook secret is long, random, and rotated.
- [ ] Provider signature verification implemented in the billing adapter.
- [ ] Account deletion tested end-to-end.
- [ ] Logs redacted and retention defined.
- [ ] Privacy policy and terms reviewed by counsel.
- [ ] Security testing completed and findings triaged.

## 16. Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Contact the maintainers privately using the support address configured in `EXPO_PUBLIC_SUPPORT_EMAIL` (default placeholder: `support@snapfix.app`). Include:

- affected version/commit
- reproduction steps
- impact
- any suggested fix

Do not include real user data or secrets in the report.
