# Architecture

## 1. Goals

SNAPFIX is designed around four constraints:

1. **Never present a guess as a diagnosis.** Observations, hypotheses, checks, and professional escalation are separate fields.
2. **Safety is independent of the model.** A deterministic policy can escalate or remove guidance even if the model is wrong or manipulated.
3. **Prices are deterministic and sourced.** The language model never produces a cost range.
4. **The app is usable without a backend** for evaluation, with an explicit demo/live switch.

## 2. High-level shape

```text
┌──────────────────────────── Expo app ────────────────────────────┐
│ Expo Router screens                                             │
│   ├─ onboarding / auth / reset-password                         │
│   ├─ tabs: home / history / maintenance / profile               │
│   └─ stacks: diagnose / diagnosis result / repair / quotes      │
│                                                                 │
│ TanStack Query hooks ──► DataRepository interface               │
│                              ├─ DemoRepository (AsyncStorage)   │
│                              └─ SupabaseRepository (live)       │
│                                                                 │
│ Domain (pure): Zod schema, safety policy, cost estimator, usage │
└─────────────────────────────────────────────────────────────────┘
                               │
                 demo mode     │     live mode
                 (default)     │
                               ▼
┌──────────────────────── Supabase ───────────────────────────────┐
│ Auth (email/password)                                           │
│ Postgres + RLS + triggers + quota RPC                           │
│ Storage bucket: diagnosis-images (private)                      │
│ Edge Functions: analyze-diagnosis, delete-account,              │
│                 billing-webhook                                 │
│ AI provider (OpenAI / Anthropic / Gemini) — server only         │
└─────────────────────────────────────────────────────────────────┘
```

## 3. Mode selection

`src/constants/config.ts` derives the mode from public environment variables:

```ts
supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
demoMode = !supabaseConfigured || EXPO_PUBLIC_ENABLE_DEMO_MODE === 'true';
```

- **Demo mode** is the default when no Supabase credentials exist.
- **Live mode** is the default when both Supabase public values are present. Set `EXPO_PUBLIC_ENABLE_DEMO_MODE=true` only to force the local demo.
- The UI displays a demo banner whenever demo mode is active. Demo mode is a first-class, labelled evaluation path, not a hidden fallback.

`AuthProvider` selects the auth service once at module load, then creates the matching repository after a session exists. Sign-out and account deletion clear the per-user diagnosis draft, draft photos, and scheduled maintenance reminders.

Analysis attempts are counted only after a successful analysis. A failed first analysis remains retryable, and a failed reassessment restores the previous completed result without consuming the reassessment allowance. The diagnosis screen applies a deterministic safety policy again before rendering server results.

## 4. Routing

Routes live in `src/app/`; non-route code stays outside it.

```text
/                         redirect based on onboarding + session
/onboarding               language + safety introduction
/(auth)/sign-in           email/password or demo entry
/(auth)/sign-up
/(auth)/forgot-password
/reset-password           Supabase recovery callback
/legal                    public terms and privacy summary
/(tabs)                   home, history, maintenance, profile
/diagnose                 photo + details form
/diagnosis/[id]           analysis/result
/diagnosis/[id]/repair    repair guide + progress
/diagnosis/[id]/compare   quote comparison
/maintenance/new
/maintenance/[id]
/settings/subscription
/settings/support
/settings/privacy
/settings/profile         display-name editing
/settings/password        password change
/+not-found
```

The tabs layout guards onboarding/session. `AuthGate` in the root layout redirects deep links to protected top-level routes when the user is signed out or has not completed onboarding.

## 5. Data layer

### 5.1 Repository contract

`src/services/repositories/types.ts` defines `DataRepository`. Every screen talks to this interface, never directly to AsyncStorage or Supabase.

This keeps demo and live behavior aligned and makes the domain testable without a network.

### 5.2 Demo repository

`src/services/repositories/demoRepository.ts` stores one JSON database per user in AsyncStorage:

- diagnoses and images (local URIs)
- usage events
- repair progress
- feedback
- quotes
- maintenance tasks
- support messages

It uses a promise queue (`withLock`) so concurrent mutations do not overwrite each other. `startAnalysis` is idempotent per diagnosis and enforces free-plan limits. Demo history is capped at 20 records.

The deterministic analyzer (`src/services/demo/demoAnalyzer.ts`) generates localized, structured content from the description and category. It explicitly states that it does not analyze image pixels.

### 5.3 Supabase repository

`src/services/repositories/supabaseRepository.ts`:

- maps snake_case rows to camelCase domain records
- uploads compressed images to the private `diagnosis-images` bucket under `userId/diagnosisId/`
- creates signed URLs for display
- calls the `analyze-diagnosis` Edge Function and waits for completion
- never writes `analysis`, `safety_level`, `status`, or provider metadata directly; database triggers reject those client writes
- exports a JSON bundle (including profile, usage, support messages, and preferences) and deletes data/account through RLS-scoped queries and the delete-account function

## 6. Diagnosis flow

```text
User selects photos + fills details
        │
        ▼
Zod form validation
        │
        ▼
Repository.createDiagnosis
  demo: copy/record local images
  live: upload images, insert diagnosis + image rows
        │
        ▼
Repository.startAnalysis
  demo: run deterministic analyzer locally
  live: invoke analyze-diagnosis (JWT)
        │
        ▼
Server pipeline (live)
  1. authenticate user
  2. verify ownership + status
  3. enforce plan/attempt limits (atomic quota RPC)
  4. download photos, size/type checks
  5. call configured AI provider with strict JSON prompt
  6. parse model assessment
  7. build base analysis with provider metadata
  8. apply deterministic safety policy
  9. replace estimate with deterministic estimator result
 10. validate final analysis against Zod contract
 11. persist completed analysis + repair guide
        │
        ▼
Client fetches completed record
  validates again with parseAnalysis
  renders safety banner, hypotheses, checks, options, estimate
```

The client also applies `applySafetyPolicy` as defence in depth when displaying an analysis. The server result remains authoritative.

## 7. Safety architecture

`src/domain/diagnosis/safety.ts` contains:

- hazard rules with English, French, and Arabic regex patterns
- unsafe-instruction detection
- risk ranking (`low < medium < high < critical`)
- `applySafetyPolicy`, which can:
  - raise the risk level
  - require a professional
  - add stop-guidance and escalation steps
  - remove all DIY repair options
  - remove unsafe steps from model output

The server copy is authoritative; the client copy prevents a compromised or stale response from being displayed without escalation. Rule-generated warning bodies and escalations are localized at render time, while model-generated content keeps the language requested when the analysis was created.

See [AI_SAFETY.md](AI_SAFETY.md).

## 8. Cost architecture

`src/domain/diagnosis/cost.ts` is pure and deterministic. Assumptions are localized from structured reference data; the numeric range is unaffected by locale.

Inputs:

- analysis category and possible-cause text
- requested currency and region
- verified price references (category, currency, region, keywords, min/max, parts/labor inclusion, source, verification date)

Rules:

- references older than 365 days are ignored
- currency must match exactly
- region must match or be `global`
- at least one cause keyword must match
- labor is added only when the reference excludes labor and provides a rate/hours
- no match → `status: "unavailable"` with a reason
- model output is never used as a price

`compareQuotes` performs arithmetic on user-entered quotes and refuses to calculate savings across currencies.

The database ships with **no price rows**. `supabase/seed.sql` explains how to add verified references. Until then, every estimate is unavailable.

## 9. State management

- **TanStack Query** owns server/demo data, caching, invalidation, and polling while an analysis is in progress.
- **Zustand + AsyncStorage** owns preferences (language, currency, theme, onboarding) and the in-progress diagnosis draft.
- **AuthProvider** owns the session and repository instance and clears the query cache on sign-out.

No global store duplicates diagnosis records; the query cache is the source of truth for server data.

## 10. Localization and RTL

`src/i18n/en.ts` is the canonical dictionary. `fr.ts` and `ar.ts` are typed as `Record<TranslationKey, string>`, so missing keys fail typechecking. A runtime parity test also verifies key equality.

- `I18nProvider` exposes `t`, `language`, `locale`, and `isRTL`.
- Layouts use `flexDirection: isRTL ? 'row-reverse' : 'row'` where direction matters.
- Arabic is RTL; Expo/React Native may require an app restart for full native RTL mirroring, and the UI states this.
- Currency/date formatting uses `Intl` with `en-GB`, `fr-MA`, and `ar-MA` locales.

## 11. Error handling

- `AppError` carries a stable code (`network`, `quota_exceeded`, `ai_failed`, etc.) and a retryable flag.
- `normalizeError` maps Supabase, network, storage, and AI failures into those codes.
- Screens translate `errors.<code>` instead of showing raw provider messages.
- Repository mutations are wrapped so React Query receives normalized errors.

## 12. Notifications

`src/services/notifications.ts` configures a local Android channel and schedules maintenance reminders with Expo Notifications. Notification taps route to the maintenance tab. Web is a no-op.

This has not been verified on a physical device in this environment.

## 13. Deliberate limitations

- Demo analyzer is rule-based and description-only.
- Live Edge Functions are not executed in this repository's verification environment.
- Billing is provider-neutral plumbing, not a store purchase implementation.
- No offline mutation queue; reads use cached query data, but writes require the repository to be available.
- No background sync or push notifications.
- The app does not provide emergency dispatch or live professional matching.
