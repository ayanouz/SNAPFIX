# Database

SNAPFIX uses Supabase Postgres, Supabase Auth, and a private Storage bucket. The schema is defined by two migrations:

```text
supabase/migrations/
  20261024000100_core_schema.sql          tables, constraints, indexes
  20261024000200_rls_storage_integrity.sql triggers, RLS, storage, quota RPC
```

> **Verification status:** these migrations are code-complete but have **not** been applied to a hosted Supabase project in this environment. Supabase CLI and Docker are not installed locally. Treat the first deployment as a migration test and inspect the SQL output before using production data.

## 1. Entity overview

```text
auth.users
  ├─ profiles                1:1
  ├─ diagnoses               1:N
  │    ├─ diagnosis_images   1:N (cascade)
  │    ├─ repair_guides      1:N (versioned, cascade)
  │    ├─ repair_progress    1:1 (cascade)
  │    ├─ diagnosis_feedback 1:1 (cascade)
  │    └─ cost_quotes        1:N (cascade)
  ├─ maintenance_tasks       1:N
  ├─ usage_events            1:N
  ├─ entitlements            1:N (currently only `premium`)
  ├─ support_messages        1:N
  └─ analytics_events        1:N

price_references             global reference data, read-only to clients
```

All user-owned tables cascade from `auth.users`, so deleting an Auth user removes their rows. Storage objects are removed by the `delete-account` Edge Function before the Auth user is deleted.

## 2. Tables

### `profiles`

| Column                     | Type        | Notes                                     |
| -------------------------- | ----------- | ----------------------------------------- |
| `id`                       | uuid PK     | references `auth.users(id)`               |
| `display_name`             | text        | max 80                                    |
| `preferred_language`       | text        | `en`, `fr`, `ar`                          |
| `preferred_currency`       | text        | ISO-4217-like `^[A-Z]{3}$`, default `MAD` |
| `theme`                    | text        | `system`, `light`, `dark`                 |
| `created_at`, `updated_at` | timestamptz | UTC                                       |

Created automatically by the `handle_new_user` trigger after signup.

### `diagnoses`

| Column                                             | Type         | Notes                                                                                         |
| -------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------- |
| `id`                                               | uuid PK      | generated                                                                                     |
| `user_id`                                          | uuid         | owner; RLS key                                                                                |
| `status`                                           | text         | `draft`, `uploading`, `analyzing`, `completed`, `failed`                                      |
| `category`                                         | text         | appliance, plumbing, electrical, heating_cooling, furniture, walls_floors, electronics, other |
| `description`                                      | text         | 1–2000 chars                                                                                  |
| `brand`, `model`, `error_code`                     | text         | optional, bounded                                                                             |
| `item_age_years`                                   | numeric(5,1) | 0–100                                                                                         |
| `currency`                                         | text         | 3-letter code                                                                                 |
| `locale`                                           | text         | `en`, `fr`, `ar`                                                                              |
| `analysis`                                         | jsonb        | canonical v1 analysis contract; server-written only                                           |
| `safety_level`                                     | text         | low, medium, high, critical                                                                   |
| `repairability`                                    | text         | diy, diy_with_caution, professional, replace, unknown                                         |
| `provider_name`, `provider_model`, `provider_mode` | text         | provenance                                                                                    |
| `schema_version`                                   | text         | analysis contract version                                                                     |
| `failure_code`, `failure_message`                  | text         | user-safe failure state                                                                       |
| `analysis_attempts`                                | integer      | 0–10; incremented only after a successful analysis; plan limit enforced in the function       |
| `is_saved`                                         | boolean      | the only client-editable field after insert                                                   |
| `created_at`, `updated_at`, `completed_at`         | timestamptz  | UTC                                                                                           |

Indexes cover `(user_id, created_at desc)`, status, category, and saved flag.

### `diagnosis_images`

| Column         | Type        | Notes                      |
| -------------- | ----------- | -------------------------- |
| `id`           | uuid PK     |                            |
| `diagnosis_id` | uuid        | cascade delete             |
| `user_id`      | uuid        | owner                      |
| `storage_path` | text unique | path inside private bucket |
| `mime_type`    | text        | jpeg, png, webp only       |
| `size_bytes`   | bigint      | 1 byte–8 MiB               |
| `position`     | integer     | 0–9, unique per diagnosis  |
| `created_at`   | timestamptz |                            |

### `repair_guides`

Versioned guides generated from the first safe repair option.

- `steps` is a JSON array matching the analysis contract.
- `tools`, `materials` are text arrays.
- `difficulty` is one of easy, moderate, advanced, professional.
- `professional_only` blocks step-by-step DIY access.
- `safety_metadata` stores the safety object used when the guide was created.
- Unique `(diagnosis_id, version)`; the Edge Function upserts version 1.

### `repair_progress`

One row per diagnosis: completed step IDs, current step index, optional completion timestamp, updated timestamp.

### `maintenance_tasks`

Item/task description, frequency (`once`, `weekly`, `monthly`, `quarterly`, `biannual`, `yearly`), next due date, reminder flag, local notification ID, notes, active flag.

### `diagnosis_feedback`

One row per user/diagnosis: rating 1–5, optional reason (`wrong_item`, `unsafe`, `unclear`, `missing_steps`, `other`), optional comment (max 1000).

### `support_messages`

Category (`bug`, `diagnosis`, `privacy`, `billing`, `other`), message (max 2000), optional email and diagnosis reference, internal status (`open`, `in_progress`, `closed`). The client can insert and read its own messages; only service tooling should update status.

### `usage_events`

Event types: `diagnosis_used`, `reassessment`, `ai_request`, `ai_failure`.
`claim_diagnosis_usage` is idempotent per diagnosis, so retrying a failed
diagnosis does not create a second `diagnosis_used` event.

A partial unique index guarantees at most one `diagnosis_used` claim per `(user_id, diagnosis_id)`. This makes quota claiming idempotent.

### `entitlements`

One premium entitlement per user: provider, provider reference, status (`active`, `inactive`, `expired`), current period end. Written only by the service role/billing webhook. Clients can read their own row.

### `analytics_events`

Optional product events with a constrained event type and JSON metadata. Insert/read is limited to the authenticated user. No third-party analytics SDK is required.

### `price_references`

Global verified pricing data: category, currency, region, part name, cause keywords, min/max, parts/labor inclusion, labor rate/hours, source, verifier, verification time. Clients have read-only access. The seed file deliberately contains **no rows**; invented prices are prohibited.

### `cost_quotes`

User-entered repair/replacement quotes: type, label, amount, currency, parts/labor flags, notes. RLS is per user and per owned diagnosis.

## 3. Row Level Security

RLS is enabled on every public table.

| Table                | Client access                                                      |
| -------------------- | ------------------------------------------------------------------ |
| `profiles`           | select/insert/update own row (`id = auth.uid()`)                   |
| `diagnoses`          | select/insert/update/delete own rows; write guard restricts fields |
| `diagnosis_images`   | select/insert/delete own rows                                      |
| `repair_guides`      | select own rows only; written by service role                      |
| `repair_progress`    | select/insert/update own rows                                      |
| `maintenance_tasks`  | full CRUD own rows                                                 |
| `diagnosis_feedback` | select/insert/update own rows                                      |
| `support_messages`   | select/insert/delete own rows                                      |
| `usage_events`       | select own rows; inserts are revoked (quota RPC/service role only) |
| `entitlements`       | select own rows; writes are service-role only                      |
| `analytics_events`   | insert/select own rows                                             |
| `price_references`   | select for authenticated users                                     |
| `cost_quotes`        | select/insert/delete own rows                                      |

Column privileges are also tightened after RLS. In particular, authenticated clients cannot insert/update/delete `usage_events`.

## 4. Write guards and triggers

- `set_updated_at()` maintains `updated_at` on profiles, diagnoses, maintenance, feedback, progress, and entitlements.
- `handle_new_user()` inserts a profile when an Auth user is created.
- `guard_diagnosis_writes()`:
  - on insert, requires `user_id = auth.uid()` and an empty draft (status `draft`, no analysis/safety/provider/attempt data)
  - on update, allows only `is_saved` and `updated_at` to change for normal authenticated clients
  - bypasses the restriction for `service_role`, which is used only by Edge Functions
- Storage policies require the first path segment to equal `auth.uid()`.

These controls mean that even if the mobile client is modified, it cannot inject an analysis, lower a safety level, or mark a diagnosis completed.

## 5. Storage

- Bucket: `diagnosis-images`
- Private (`public = false`)
- 8 MiB file limit
- Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`
- Object path convention: `<userId>/<diagnosisId>/<filename>`
- Policies: select/insert/update/delete only when `(storage.foldername(name))[1] = auth.uid()::text`
- The app uploads compressed images and stores a signed URL for display.
- Account deletion removes the user's image folders through the service role before deleting the Auth user.

## 6. Quota RPC

`public.claim_diagnosis_usage(p_user_id uuid, p_diagnosis_id uuid)`:

- takes a per-user advisory transaction lock
- verifies diagnosis ownership
- returns idempotently if the diagnosis was already claimed
- resolves premium from an active, non-expired entitlement
- counts `diagnosis_used` events in the current UTC month
- enforces 5 (free) or 30 (premium)
- inserts the claim when allowed

Execute permission is revoked from `public`, `anon`, and `authenticated`; only `service_role` may call it.

## 7. Seed data

`supabase/seed.sql` intentionally contains no price rows. It documents the required insert shape for verified local data. This is a product rule: until a real reference is supplied and verified, the estimator returns “unavailable”.

## 8. Local database workflow

These commands assume the Supabase CLI and Docker are installed. They were **not** run in this environment.

```bash
npx supabase start
npx supabase db reset          # applies migrations + seed
npx supabase db lint
```

To deploy:

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
```

Review the migration diff and run it against a staging project first. Back up production data before schema changes.

## 9. Data retention and deletion

- User data remains until the user deletes it or the account.
- `deleteAllData` removes diagnoses, maintenance, support messages, and storage objects for the current user; related rows cascade.
- `delete-account` removes storage objects and then the Auth user, cascading all rows.
- Server logs may retain request metadata for operational purposes; define a retention period before production launch.
- Export produces a JSON bundle with diagnoses, maintenance, feedback, quotes, and repair progress.

## 10. Schema evolution

- `analysis` carries `provider.schema_version` (currently `1.0.0`).
- The Zod contract is versioned in `src/domain/diagnosis/schema.ts`.
- A future schema change should be additive, bump the version, and preserve a parser for older rows.
- Migration files are immutable once applied; add a new migration instead of editing history.
