# Store release checklist

> **Status:** no store build has been produced and no submission has been made. Items marked **Verified in repo** are supported by local lint/typecheck/tests or inspected configuration. Everything else must be completed against real accounts, devices, and a hosted backend.

## 1. Product readiness

- [ ] End-to-end flow verified on a physical Android device.
- [ ] End-to-end flow verified on a physical iPhone.
- [ ] Demo mode is clearly labelled and does not imply a real AI analysis.
- [ ] Live mode works with a hosted Supabase project.
- [ ] Every screen has a loading, empty, error, and retry state.
- [ ] Offline and poor-network behavior is acceptable.
- [ ] Large text, dark mode, and RTL layouts are usable.
- [ ] App does not crash when permissions are denied.
- [ ] No placeholder text, dead buttons, or unfinished routes.
- [ ] **Verified in repo:** TypeScript passes, lint passes, 44 tests pass, Android/iOS/web JS bundles export.

## 2. Safety and claims

- [ ] Onboarding and result screens state that SNAPFIX is not an emergency service.
- [ ] Gas/CO/fire/electrical/structural/chemical/pressure/vehicle hazards escalate.
- [ ] Professional-required results hide DIY repair options.
- [ ] The app never promises a confirmed diagnosis from a photo.
- [ ] Cost ranges appear only with verified local references; otherwise “estimate unavailable” is shown.
- [ ] Estimates are labelled non-binding, not quotes.
- [ ] No unsafe instruction bypasses the deterministic filter.
- [ ] A safety incident response owner and contact are defined.
- [ ] Legal review completed for the wording “AI”, “diagnosis”, and “repair advice” in each market.

## 3. Accounts and data

- [ ] Supabase production project created.
- [ ] Migrations applied and RLS verified with two users.
- [ ] Storage bucket is private and path isolation verified.
- [ ] Email confirmation, password reset, and session refresh work.
- [ ] Account deletion removes rows and images.
- [ ] Export produces a readable JSON file.
- [ ] Delete-all-data works in live mode.
- [ ] Data retention and backup retention are documented.
- [ ] Data processing agreements are in place with Supabase, the AI provider, and any error-reporting vendor.
- [ ] AI provider retention/training settings reviewed; zero-retention configured if required.
- [ ] Privacy policy URL is live and matches actual behavior.
- [ ] Terms of service URL is live.
- [ ] Support email is a real monitored address.

## 4. Security

- [ ] No `.env`, service-role key, AI key, webhook secret, or signing key in git or the JS bundle.
- [ ] `AI_ALLOW_DEMO=false` in production.
- [ ] `ALLOWED_ORIGINS` is an exact allow-list.
- [ ] `billing-webhook` rejects a wrong/missing secret.
- [ ] Billing provider signature verification exists in the adapter.
- [ ] Edge Functions reject missing/expired JWTs.
- [ ] Quota claim is atomic under concurrent requests.
- [ ] Dependency audit reviewed.
- [ ] Mobile security review / penetration test completed.
- [ ] Logs redacted; no diagnosis text, tokens, or signed URLs in logs.
- [ ] Incident response and key rotation runbook tested.

## 5. Billing and subscriptions

- [ ] Real store product IDs created for monthly/annual premium.
- [ ] Purchase, restore, cancellation, expiry, refund, and grace-period flows implemented.
- [ ] Receipts verified server-side.
- [ ] Entitlement webhook tested end-to-end.
- [ ] Free/premium limits match store descriptions.
- [ ] Subscription screen no longer says “billing not connected”.
- [ ] Prices, taxes, and localized store pricing configured.
- [ ] No local-only premium unlock remains.
- [ ] Refund and cancellation policy linked.

> Current repo status: billing is **not connected**. The subscription screen states this. Do not submit a paid tier until this section is complete.

## 6. Permissions and native configuration

- [ ] Camera and photo-library permission strings are accurate and localized.
- [ ] Notification permission is requested in context, with a denied-state explanation.
- [ ] No unnecessary permissions.
- [ ] Android `allowBackup` decision reviewed (`false` currently).
- [ ] iOS `usesNonExemptEncryption` confirmed with counsel.
- [ ] Deep links (`snapfix://reset-password`) tested from a cold start.
- [ ] App icons, adaptive icon, splash, and notification icon look correct on both platforms.
- [ ] App name, package, bundle ID, version, and build number are final.
- [ ] New architecture / React Compiler tested for regressions.

## 7. Build and signing

- [ ] EAS project linked (`npx eas-cli@latest init`).
- [ ] Android keystore created and backed up.
- [ ] iOS certificates and provisioning profiles configured.
- [ ] Development build installed and tested.
- [ ] Preview build installed and tested.
- [ ] Production build installed and tested.
- [ ] Builds are reproducible from the committed lockfile.
- [ ] CI passes on the release commit.
- [ ] No debug menu, test banner, or dev-only endpoint in production.

## 8. Store listing

- [ ] App title and subtitle.
- [ ] Short and full descriptions (EN/FR/AR as needed).
- [ ] Keywords.
- [ ] Category.
- [ ] Screenshots for required device sizes, including dark mode and RTL if claimed.
- [ ] App preview video (optional).
- [ ] Privacy policy URL.
- [ ] Support URL.
- [ ] Marketing URL (optional).
- [ ] Content rating questionnaire.
- [ ] Data safety form (Android) / privacy nutrition labels (iOS).
- [ ] AI/photo data collection disclosed accurately.
- [ ] Account deletion URL/flow disclosed.
- [ ] Review notes explaining demo mode, AI limitations, and how to test live features.
- [ ] Demo/test account for reviewers if login is required.
- [ ] Export compliance answers.
- [ ] Age rating and target audience.
- [ ] No medical/emergency-service claims that trigger additional review.

## 9. Quality and accessibility

- [ ] Screen-reader pass (TalkBack and VoiceOver).
- [ ] Touch targets ≥ 44×44 pt.
- [ ] Color contrast checked in light and dark themes.
- [ ] Dynamic type / font scaling does not clip critical safety text.
- [ ] RTL layout checked with Arabic.
- [ ] Reduced-motion behavior checked.
- [ ] Haptics and animations do not block actions.
- [ ] Crash-free session target defined and met in beta.
- [ ] Cold start and diagnosis flow performance measured on a low-end device.
- [ ] Image upload and compression tested on slow networks.
- [ ] Notification scheduling works across time zones and DST.
- [ ] App behaves correctly after a device restart.

## 10. Launch operations

- [ ] Production monitoring and alerts configured.
- [ ] On-call/owner for safety and security incidents.
- [ ] Supabase backups enabled and restore tested.
- [ ] Rate limits and quotas sized for expected traffic.
- [ ] AI provider spend limit and alert configured.
- [ ] Support macros for safety, privacy, billing, and data deletion.
- [ ] Status page or communication channel.
- [ ] Rollback plan tested for app, database, Edge Functions, and secrets.
- [ ] Launch announcement and changelog prepared.

## 11. Sign-off

| Role                   | Name | Date | Signature/approval |
| ---------------------- | ---- | ---- | ------------------ |
| Product owner          |      |      |                    |
| Engineering            |      |      |                    |
| Safety reviewer        |      |      |                    |
| Security reviewer      |      |      |                    |
| Legal/privacy          |      |      |                    |
| Store submission owner |      |      |                    |

## 12. Current blockers before submission

1. Hosted Supabase migrations, RLS, and Edge Functions are unverified.
2. Live AI provider requests are unverified.
3. Billing/store purchases are not implemented.
4. No native production build or device testing has been completed.
5. Privacy policy, terms, support address, and store metadata are not finalized.
6. E2E and accessibility audits have not been run.
