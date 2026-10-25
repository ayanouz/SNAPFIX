# Testing

## 1. Current verification

Verified locally on 2026-10-25:

| Check                            | Command                                                | Result                                           |
| -------------------------------- | ------------------------------------------------------ | ------------------------------------------------ |
| Lint                             | `npm run lint`                                         | Passed                                           |
| Typecheck                        | `npm run typecheck`                                    | Passed                                           |
| Expo config/dependencies         | `npx expo-doctor`                                      | **20/20 checks passed**                          |
| Unit/component/integration tests | `npm run test:ci`                                      | **10 suites, 46 tests passed**                   |
| Android production bundle        | `npx expo export --platform android --output-dir dist` | Bundled successfully (2,107 modules)             |
| iOS production bundle            | `npx expo export --platform ios --output-dir dist`     | Bundled successfully (2,111 modules)             |
| Web production bundle            | `npx expo export --platform web --output-dir dist`     | Bundled successfully (1,782 modules)             |
| Web dev-server smoke test        | `npm run web` (manual browser flow)                    | **Passed** (see 1.1)                             |
| Native build                     | —                                                      | **Not run** (no Android SDK; iOS requires macOS) |
| Hosted Supabase migrations/RLS   | —                                                      | **Not run**                                      |
| Edge Functions (Deno)            | —                                                      | **Not run** (no Deno/Supabase CLI/Docker)        |
| Live AI provider                 | —                                                      | **Not run** (no API key)                         |
| Maestro E2E                      | `maestro test e2e/smoke.yaml`                          | **Not run**                                      |

These results must not be read as a claim that a store build or live deployment has been verified.

### 1.1 Web dev-server smoke test

On 2026-10-25 the web target was started with `npx expo start --web` and exercised in a browser in demo mode:

- onboarding → demo sign-in → home
- photo selection → description → completed diagnosis
- repair guide → quote comparison
- history and usage counter update
- maintenance task creation
- Arabic language switch, including localized rule warning bodies and escalation
- profile display-name save
- JSON data export downloaded as `snapfix-export-2026-10-25.json`
- profile → account settings, legal terms, and password screens render
- free-plan subscription screen with an honest billing-not-connected placeholder

No uncaught runtime errors were observed. The only expected console noise is the `expo-notifications` warning that push-token listeners are unsupported on web. This run also confirmed the earlier web-only startup fix: `expo-notifications` does not implement `getLastNotificationResponse()` on web, so notification-response handling is skipped when `Platform.OS === 'web'`. The browser preview is still not a substitute for native verification, and maintenance reminders are intentionally not scheduled on web.

## 2. Commands

```bash
npm test                 # Jest
npm run test:ci          # CI mode, serial
npm run test:watch       # watch mode
npm run typecheck        # tsc --noEmit
npm run lint             # expo lint
npm run format:check     # Prettier
npm run web              # browser preview (manual smoke testing)
```

Coverage is configured in `jest.config.js` with a modest global threshold:

```text
statements 40%, branches 30%, functions 35%, lines 40%
```

The threshold is a regression floor, not a claim of comprehensive coverage. The highest-value logic (safety, cost, schema, demo repository) is tested directly.

## 3. Test layout

```text
tests/
  types.d.ts
  unit/
    schema.test.ts          analysis contract, contradictory safety output, JSON extraction
    safety.test.ts          hazard detection, escalation, unsafe instructions, risk ranking
    cost.test.ts            verified references, expiry, currency/region/cause matching, quotes, localized assumptions
    usage.test.ts           plan limits, UTC periods, entitlement expiry
    format.test.ts          dates, currency, confidence, durations, estimate reasons
    errors.test.ts          normalization and translation keys
    i18n.test.ts            EN/FR/AR key parity and interpolation
    diagnosisDraft.test.ts  per-user draft isolation and reset
  component/
    ui.test.tsx             Badge, Button, SafetyBanner
  integration/
    demoRepository.test.ts  full demo data lifecycle + quota + reassessment limits
```

### What is covered

- Zod contract accepts a complete demo analysis.
- Contract rejects a professional-required assessment with DIY guidance.
- Contract rejects an available estimate without a source.
- JSON extraction from fenced/prose-wrapped provider output.
- Gas, electrical, fire/CO-adjacent, structural, chemical, pressure, and vehicle hazard logic (representative cases).
- Safety escalation removes repair options and adds professional steps.
- Unsafe-instruction detection (EN, plus normalization).
- Risk ranking and warning generation.
- Cost estimator:
  - only recent, matching references produce a range
  - labor is added only when excluded by the reference
  - currency/region/cause mismatches return the correct unavailable reason
  - localized FR/AR assumptions do not change the numeric range
  - mixed-currency quote comparison never computes savings
- Free/premium usage limits and UTC month boundaries.
- Entitlement active/expired behavior.
- Locale-aware formatting and invalid date handling.
- Error normalization for network, auth, quota, AI, storage, image, and validation failures.
- English/French/Arabic dictionary key parity.
- Demo repository:
  - create draft + images
  - analysis completion and schema validation
  - usage accounting and history
  - repair guide + progress
  - feedback
  - quotes + comparison
  - maintenance completion and next due date
  - support message
  - export including profile, usage, and support messages
  - delete all data
  - free monthly quota
  - one-reassessment limit

### What is not covered by automated tests

- Deno Edge Function unit tests (the functions import Deno globals and npm: specifiers).
- Live Supabase integration, RLS, triggers, storage policies, and RPC behavior.
- Real AI provider requests, rate limits, timeouts, and provider-specific JSON quirks.
- Billing provider webhooks and receipt verification.
- The Premium entitlement UI state; demo mode has no entitlement, so only the free-plan screen was exercised manually.
- Native image picker/camera, compression, notifications, sharing, and secure storage.
- Push notifications and background behavior.
- RTL visual layout and screen-reader behavior on a device.
- Deep links and password recovery against a real Supabase project.
- Offline/network transition behavior.
- Maestro E2E (flow supplied, not run).
- Load, soak, and penetration testing.

## 4. CI

`.github/workflows/ci.yml` runs on push and pull request:

1. `npm ci`
2. `npm run lint`
3. `npm run format:check`
4. `npm run typecheck`
5. `npx expo-doctor`
6. `npm run test:ci`
7. `npx expo export --platform android` (bundle sanity check)

The export step requires no secrets and runs in demo mode. It does not produce a signed app.

CI has not been executed on GitHub in this environment; the workflow is provided but unverified.

## 5. Manual test matrix

Run these on a development build before release.

### Onboarding and auth

- [ ] Fresh install shows onboarding in English.
- [ ] Switch to French and Arabic; verify text and RTL layout (restart if needed).
- [ ] Demo entry reaches the home tab and shows the demo banner.
- [ ] Live signup, email confirmation, sign-in, sign-out, and password reset.
- [ ] Deep link to `/settings/privacy` while signed out redirects to sign-in.
- [ ] Account deletion removes data and returns to auth.

### Diagnosis

- [ ] Gallery and camera permissions; cancel behaves gracefully.
- [ ] Photo limit enforced (free 2, premium 3).
- [ ] Description under 10 characters is rejected.
- [ ] Draft persists across app restart.
- [ ] Analysis starts automatically and shows progress.
- [ ] Failure state offers retry.
- [ ] Result displays observations, hypotheses, checks, repairability, and estimate state.
- [ ] Save/share/reassess/delete work.
- [ ] A gas/electrical description escalates and hides DIY options.
- [ ] Rule warning bodies and escalation text are localized in French and Arabic.
- [ ] A safe description can show a guide.
- [ ] Repair progress persists after restart.
- [ ] Quote comparison handles one/many/mixed currencies.

### History, maintenance, profile

- [ ] Search and category/saved filters.
- [ ] Infinite pagination and pull-to-refresh.
- [ ] Free history cap behaves as documented.
- [ ] Create/edit/complete/delete maintenance.
- [ ] Reminder permission denied/approved; notification tap opens maintenance.
- [ ] Language/currency/theme changes apply.
- [ ] Export produces a readable JSON file.
- [ ] Delete all data clears local/live records.
- [ ] Subscription screen clearly states billing is not connected.

### Safety and privacy

- [ ] No raw provider errors are shown.
- [ ] No diagnosis text appears in logs.
- [ ] Signed image URLs expire and are not public.
- [ ] Two test users cannot access each other's rows or images.
- [ ] Screen reader labels and touch targets are usable.
- [ ] Dark mode contrast is acceptable.

## 6. E2E (Maestro)

A smoke flow is in `e2e/smoke.yaml`:

```bash
maestro test e2e/smoke.yaml
```

It covers onboarding → demo sign-in → home → history empty state. It does **not** cover camera/gallery, notifications, live auth, or payments. It has not been executed here.

## 7. Adding tests

- Keep domain tests pure; avoid React Native imports.
- Use the repository contract for integration tests; prefer a memory `KeyValueStore` over AsyncStorage.
- Mock `@expo/vector-icons` in component tests to avoid font asset loading (already done in `jest.setup.ts`).
- React Native Testing Library v14 APIs are asynchronous: `await render(...)`, `await fireEvent.press(...)`, and `await rerender(...)`.
- Add a regression test for every safety or pricing bug.
- Do not weaken the coverage threshold to make a failing build pass; fix the gap or document an exception.
