# SNAPFIX

**Understand the problem before you repair it.**

SNAPFIX is a mobile-first repair triage app built with Expo and React Native. A user attaches photos, describes the problem, and receives a structured, safety-checked assessment: observations, hypotheses, checks to perform, repair options, and a deterministic cost estimate when verified local pricing exists.

The app is intentionally conservative. It does **not** invent diagnoses or prices. It separates what was observed, what is suspected, what the user can safely check, and when a qualified professional is required.

---

## Project status (verified on 2026-10-24)

This repository is a **production-oriented implementation**, not a claim that a live deployment has already been completed.

| Area                                                                                                           | Status                                                                                        |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Demo mode (no backend required)                                                                                | Implemented and exercised by tests                                                            |
| UI flows: onboarding, auth, diagnose, result, guide, quote comparison, history, maintenance, profile, settings | Implemented                                                                                   |
| Deterministic safety policy and cost estimator                                                                 | Implemented, unit-tested                                                                      |
| English / French / Arabic dictionaries with RTL support                                                        | Implemented, parity-tested                                                                    |
| Supabase schema, RLS, storage policies, Edge Functions                                                         | Code complete, **not executed against a live Supabase project**                               |
| Live AI provider calls (OpenAI / Anthropic / Gemini)                                                           | Code complete, **not verified with real API keys**                                            |
| Billing / store purchases                                                                                      | **Not connected**. The UI states this honestly; a provider-neutral entitlement webhook exists |
| Native Android / iOS build                                                                                     | **Not verified** (no Android SDK locally; iOS builds require macOS)                           |
| Store submission                                                                                               | **Not performed**                                                                             |
| E2E automation                                                                                                 | Maestro flow supplied, **not run**                                                            |
| Lint / typecheck / Jest / Expo Doctor / Android + iOS bundle export                                            | **Passed locally** (see [Testing](docs/TESTING.md))                                           |

The default configuration runs in **explicit demo mode**. No Supabase project or AI key is needed to explore the app. Demo mode never analyzes image pixels; it converts the user's description into clearly labelled hypotheses and states that limitation in the UI.

---

## Features

- **Photo-based diagnosis** with gallery/camera input, compression, and a maximum photo count per plan.
- **Structured analysis contract** validated with Zod before display; no free-form model output is rendered directly.
- **Safety policy independent of the model**: gas, CO, electrical, structural, chemical, pressure, and vehicle hazards trigger escalation and remove DIY repair guidance.
- **Repair guides** with tools, materials, safety warnings, step progress, and professional-only guards.
- **Quote comparison** with deterministic arithmetic; mixed currencies are never compared.
- **Maintenance reminders** with local notifications and completion scheduling.
- **History** with search, saved/category filters, pagination, and per-user isolation.
- **Accounts** with email/password auth in live mode and a local demo account in demo mode.
- **Data controls**: JSON export, delete all data, and full account deletion (live mode).
- **Localization**: English, French, and Arabic, including RTL layout and locale-aware dates/currency.
- **Plans**: free (5 diagnoses/month) and premium (30/month) entitlement plumbing.
- **Demo / live mode banner** so the current data source is never ambiguous.

---

## Stack

| Layer        | Technology                                                                    |
| ------------ | ----------------------------------------------------------------------------- |
| Runtime      | Expo SDK 58, React Native 0.88, React 19.3                                    |
| Language     | TypeScript (strict, `noUncheckedIndexedAccess`)                               |
| Routing      | Expo Router (typed routes)                                                    |
| Forms        | React Hook Form + Zod validation                                              |
| Server state | TanStack Query v5                                                             |
| Client state | Zustand + AsyncStorage persistence                                            |
| Backend      | Supabase Postgres, Auth, Storage, Edge Functions (Deno)                       |
| AI           | Server-side provider abstraction: OpenAI, Anthropic, Gemini, or explicit demo |
| Testing      | Jest, jest-expo, React Native Testing Library                                 |
| CI           | GitHub Actions                                                                |

---

## Quick start (demo mode)

Requirements: Node.js 20.19+ (verified with Node 24.20), npm.

```bash
npm install
npm start
```

Then press `a` for an Android emulator/device, `i` for the iOS simulator (macOS), or scan the QR code with a development build. Expo Go can run the JavaScript but cannot reproduce every native module behavior; a development build is recommended for notifications and image workflows.

No `.env` file is required. With no Supabase variables, SNAPFIX starts in demo mode and stores data locally on the device.

### Demo walkthrough

1. Complete onboarding.
2. On the sign-in screen, tap **Explore the demo**.
3. Tap **New diagnosis**, attach at least one photo, and describe the problem.
4. Open the completed result to see safety findings, hypotheses, checks, repair options, and the estimate state.
5. Open a repair guide, compare quotes, add a maintenance task, and try export/delete in **Profile → Privacy**.

Demo data is stored in AsyncStorage and can be removed from **Profile → Delete all data**.

---

## Live mode setup (summary)

Full steps are in [Deployment](docs/DEPLOYMENT.md).

1. Create a Supabase project and run the migrations in `supabase/migrations/`.
2. Create a `.env` from `.env.example` and set:
   ```dotenv
   EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
   EXPO_PUBLIC_ENABLE_DEMO_MODE=false
   ```
3. Deploy the Edge Functions:
   - `analyze-diagnosis` (JWT required)
   - `delete-account` (JWT required)
   - `billing-webhook` (JWT disabled; shared-secret authenticated)
4. Set server-side secrets with the Supabase CLI:
   ```bash
   npx supabase secrets set AI_PROVIDER=openai AI_API_KEY=... AI_MODEL=...
   ```
5. Rebuild the app so the new `EXPO_PUBLIC_*` values are embedded.

**Never** place `SUPABASE_SERVICE_ROLE_KEY`, AI API keys, or `BILLING_WEBHOOK_SECRET` in `EXPO_PUBLIC_*` variables. They belong only in Edge Function secrets.

---

## Commands

```bash
npm run lint          # Expo ESLint
npm run typecheck     # tsc --noEmit
npm test              # Jest
npm run test:ci       # jest --ci --runInBand
npm run format:check  # Prettier check
npm run doctor        # expo-doctor
npm run assets        # regenerate brand assets (PowerShell)
npx expo export --platform android --output-dir dist
```

`npm test` runs Jest once. `test:watch` enables watch mode.

---

## Project structure

```text
src/
  app/                     Expo Router routes (screens only)
  components/              UI primitives and feature components
  domain/                  Pure business logic: schema, safety, cost, usage, validation
  hooks/                   React Query hooks and hydration helpers
  i18n/                    EN/FR/AR dictionaries and provider
  providers/               Theme, query, auth, and app composition
  services/                Demo/live repositories, auth, storage, notifications, sharing
  stores/                  Zustand preferences and diagnosis draft
  theme/                   Design tokens
  utils/                   Formatting, IDs
supabase/
  migrations/              Postgres schema, RLS, storage policies, quota RPC
  functions/               Deno Edge Functions and shared server modules
  seed.sql                 No invented prices; instructions only
tests/
  unit/                    Domain, schema, safety, cost, usage, formatting, errors, i18n
  component/               UI primitives
  integration/             Demo repository end-to-end data flow
e2e/                       Maestro smoke flow (not run in CI)
docs/                      Architecture, database, API, safety, security, testing, deployment
```

---

## Safety and cost rules

- The AI proposes; the app decides. Every analysis passes through `applySafetyPolicy` on the server, and the client also validates the contract.
- Gas/CO, electrical, structural, chemical, pressure, and vehicle hazards are escalated. When professional help is required, DIY repair options are removed and an escalation step is added.
- The prompt forbids unsafe instructions; a deterministic unsafe-instruction detector also strips dangerous guidance.
- Cost estimates come only from recent, verified `price_references` matching category, currency, region, and cause. Otherwise the estimate is **unavailable** with a reason.
- Quote comparison is arithmetic on user-entered quotes. Mixed currencies disable savings calculations.
- SNAPFIX is not an emergency service. The UI tells users to contact emergency services or a qualified professional when appropriate.

See [AI_SAFETY.md](docs/AI_SAFETY.md) for the full policy.

---

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Database](docs/DATABASE.md)
- [API and repository contracts](docs/API.md)
- [AI safety policy](docs/AI_SAFETY.md)
- [Security](docs/SECURITY.md)
- [Testing](docs/TESTING.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Store release checklist](docs/STORE_RELEASE_CHECKLIST.md)

---

## Known limitations

- Live Supabase migrations, RLS behavior, storage policies, and Edge Functions have not been executed against a hosted project in this environment.
- No real AI provider request has been made; provider response parsing is covered only by local contract tests.
- Billing is not connected to App Store / Play Store purchases. Premium entitlements must be granted by a verified billing adapter through the webhook.
- No native build or store submission has been produced.
- Demo mode is deterministic and description-based; it does not inspect image pixels.
- Maestro E2E is provided but has not been run.
- Accessibility has been considered (labels, roles, large touch targets, RTL) but not audited with a screen reader on a device.

---

## License

MIT. See [LICENSE](LICENSE).
