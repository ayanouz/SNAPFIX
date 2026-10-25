# API and data contracts

SNAPFIX has two API surfaces:

1. **A TypeScript repository contract** used by the mobile app. Screens never call Supabase directly.
2. **Supabase Edge Functions** used in live mode for analysis, account deletion, and billing entitlements.

> **Verification status:** the Edge Functions are written for the Supabase Deno runtime but were not executed here (no Supabase CLI, Docker, Deno, or hosted project). The request/response shapes below describe the implementation, not a verified deployment.

## 1. Mobile repository contract

Defined in `src/services/repositories/types.ts`.

```ts
interface DataRepository {
  readonly mode: 'demo' | 'live';

  getProfile(): Promise<UserProfile>;
  updateProfile(input: ProfileUpdate): Promise<UserProfile>;

  createDiagnosis(input: NewDiagnosisInput): Promise<DiagnosisRecord>;
  startAnalysis(diagnosisId: string): Promise<void>;
  reassessDiagnosis(diagnosisId: string): Promise<void>;
  getDiagnosis(diagnosisId: string): Promise<DiagnosisRecord>;
  listDiagnoses(query: HistoryQuery): Promise<DiagnosisListItemPage>;
  setSaved(diagnosisId: string, saved: boolean): Promise<void>;
  deleteDiagnosis(diagnosisId: string): Promise<void>;

  getRepairGuide(diagnosisId: string): Promise<RepairGuide | null>;
  getRepairProgress(diagnosisId: string): Promise<RepairProgress | null>;
  saveRepairProgress(diagnosisId: string, input: SaveProgressInput): Promise<RepairProgress>;

  submitFeedback(input: SubmitFeedbackInput): Promise<DiagnosisFeedback>;
  getFeedback(diagnosisId: string): Promise<DiagnosisFeedback | null>;

  getUsage(): Promise<UsageSummary>;

  listQuotes(diagnosisId: string): Promise<CostQuote[]>;
  addQuote(input: NewCostQuote): Promise<CostQuote>;
  deleteQuote(quoteId: string): Promise<void>;

  listMaintenance(): Promise<MaintenanceTask[]>;
  createMaintenance(input: CreateMaintenanceInput): Promise<MaintenanceTask>;
  updateMaintenance(taskId: string, input: CreateMaintenanceInput): Promise<MaintenanceTask>;
  completeMaintenance(taskId: string): Promise<MaintenanceTask>;
  setMaintenanceNotificationId(
    taskId: string,
    notificationId: string | null,
  ): Promise<MaintenanceTask>;
  deleteMaintenance(taskId: string): Promise<void>;

  sendSupportMessage(input: SupportMessageInput): Promise<void>;
  exportUserData(): Promise<ExportBundle>;
  deleteAllData(): Promise<void>;
}
```

### `NewDiagnosisInput`

```ts
{
  id: string;                 // UUID generated on the client
  category: Category;
  description: string;        // 10–2000 chars in the form
  brand?: string | null;
  model?: string | null;
  errorCode?: string | null;
  itemAgeYears?: number | null;
  currency: string;           // e.g. MAD
  locale: string;             // en | fr | ar
  imageUris: string[];        // local URIs before upload
}
```

### `UsageSummary`

```ts
{
  plan: 'free' | 'premium';
  used: number;
  limit: number;
  remaining: number;
  periodStart: string; // ISO UTC
  periodEnd: string; // ISO UTC
  historyLimit: number | null;
  maxPhotos: number;
  maxReassessments: number;
}
```

### `ExportBundle`

```ts
{
  exportedAt: string;
  app: 'SNAPFIX';
  schemaVersion: 1;
  diagnoses: DiagnosisRecord[];
  maintenance: MaintenanceTask[];
  feedback: DiagnosisFeedback[];
  quotes: CostQuote[];
  progress: RepairProgress[];
  profile?: UserProfile;
  usage?: UsageSummary;
  support?: SupportMessage[];
  preferences?: { language: string; currency: string; theme: string };
}
```

The export is produced by the repository and augmented with device-local display
preferences by `src/services/export.ts`. Support messages are included when the
repository has them.

## 2. Analysis contract

The canonical analysis is a Zod object in `src/domain/diagnosis/schema.ts`, version `1.0.0`.

Top-level fields:

| Field             | Purpose                                                            |
| ----------------- | ------------------------------------------------------------------ |
| `schema_version`  | contract version                                                   |
| `summary`         | headline, plain-language summary, confidence                       |
| `item`            | category, identified type, brand/model hints                       |
| `observations`    | only what is visible/reported; source + confidence                 |
| `possible_causes` | hypotheses with confidence and verification method                 |
| `next_steps`      | safe checks, questions, or professional escalation                 |
| `repair_options`  | guided options; empty when professional help is required           |
| `repairability`   | verdict + rationale                                                |
| `safety`          | risk level, professional flag, stop guidance, warnings, escalation |
| `estimate`        | available range or unavailable reason                              |
| `limitations`     | evidence and photo limitations                                     |
| `provider`        | name, model, mode, generated timestamp, schema version             |

Important invariants enforced by the schema:

- If `safety.professional_required` is true, the verdict cannot be `diy`/`diy_with_caution`, and repair options must be professional-only or empty.
- If `safety.stop_guidance` is true, no DIY steps are allowed.
- An available estimate must include a source, verification date, and currency.
- Confidence values are 0–1.
- Unknown fields are stripped by Zod; malformed output is rejected.

## 3. Edge Functions

Base URL:

```text
https://<project-ref>.supabase.co/functions/v1/<function-name>
```

All requests are `POST` with `Content-Type: application/json`.

### 3.1 `analyze-diagnosis`

- JWT verification: **enabled**
- Auth: `Authorization: Bearer <user access token>`
- Purpose: analyze an owned diagnosis, apply safety and cost policy, persist the result.

Request:

```json
{
  "diagnosisId": "4f6a1b7c-1234-4abc-9def-0123456789ab",
  "reassess": false
}
```

Response `200`:

```json
{
  "diagnosisId": "4f6a1b7c-1234-4abc-9def-0123456789ab",
  "idempotent": false,
  "analysis": { "...": "canonical analysis object" },
  "usage": {
    "plan": "free",
    "used": 1,
    "limit": 5,
    "remaining": 4,
    "periodStart": "2026-10-01T00:00:00.000Z",
    "periodEnd": "2026-11-01T00:00:00.000Z"
  }
}
```

Behavior:

- Rejects non-POST and disallowed browser origins.
- Verifies the JWT and diagnosis ownership.
- Returns the existing analysis idempotently if already completed and `reassess=false`.
- Rejects concurrent analysis with `409 conflict`.
- Enforces plan attempt limits (free 1 reassessment; premium 3).
- Claims monthly usage atomically through `claim_diagnosis_usage`. Retrying the same diagnosis does not claim a second monthly usage event.
- Downloads images from private storage, checks MIME/size, and sends them to the configured provider.
- Parses provider JSON, builds the analysis, applies the deterministic safety policy, and computes the estimate from verified references.
- Persists the analysis and upserts a repair guide.
- Increments `analysis_attempts` only after a successful analysis.
- On a failed first analysis, marks the diagnosis `failed` with a safe failure code and leaves it retryable.
- On a failed reassessment, restores the previous `completed` state, keeps the previous analysis, and leaves the attempt allowance unchanged.

Errors:

| HTTP | `error`                           | Meaning                                         |
| ---- | --------------------------------- | ----------------------------------------------- |
| 400  | `invalid_input`                   | bad UUID, missing images, invalid state         |
| 401  | `unauthorized`                    | missing/invalid JWT                             |
| 403  | `forbidden`                       | browser origin not allowed                      |
| 404  | `not_found`                       | diagnosis missing or not owned                  |
| 405  | `method_not_allowed`              | non-POST request                                |
| 409  | `conflict`                        | another analysis is running                     |
| 413  | `image_too_large`                 | downloaded image exceeds limit                  |
| 415  | `invalid_input`                   | missing/incorrect JSON content type             |
| 429  | `quota_exceeded` / `rate_limited` | plan or attempt/provider rate limit             |
| 500  | `server_misconfigured`            | missing server secret                           |
| 502  | `storage_failed` / `ai_failed`    | upstream failure                                |
| 503  | `ai_not_configured`               | unsupported provider or missing/rejected AI key |
| 504  | `ai_failed`                       | AI provider timeout                             |

Error envelope:

```json
{
  "error": "quota_exceeded",
  "message": "The monthly diagnosis limit was reached",
  "details": { "plan": "free", "used": 5, "limit": 5 }
}
```

### 3.2 `delete-account`

- JWT verification: **enabled**
- Auth: bearer token
- Request:

```json
{ "confirm": true }
```

Response:

```json
{ "deleted": true }
```

The function removes the user's storage folders, then deletes the Auth user with the service role. Database rows cascade. `confirm` must be exactly `true`.

### 3.3 `billing-webhook`

- JWT verification: **disabled** (provider-to-provider call)
- Auth: `x-webhook-secret: <BILLING_WEBHOOK_SECRET>` or `Authorization: Bearer <secret>`
- This is a **provider-neutral entitlement adapter**, not a store purchase implementation. Your billing provider must verify its own signature and call this function only after a trusted event.

Request:

```json
{
  "event": "subscription.activated",
  "userId": "4f6a1b7c-1234-4abc-9def-0123456789ab",
  "provider": "revenuecat",
  "providerReference": "txn_123",
  "currentPeriodEnd": "2026-11-24T12:00:00.000Z"
}
```

Allowed events:

- `subscription.activated` → active
- `subscription.renewed` → active
- `subscription.cancelled` → inactive
- `subscription.expired` → expired

Response:

```json
{ "received": true, "event": "subscription.activated", "status": "active" }
```

An active entitlement with a past `currentPeriodEnd` is rejected. The function upserts `entitlements` with the service role.

## 4. Storage API

Images are uploaded directly to Supabase Storage with the user's JWT:

- Bucket: `diagnosis-images` (private)
- Path: `<userId>/<diagnosisId>/<filename>`
- Max size: 8 MiB
- MIME: `image/jpeg`, `image/png`, `image/webp`
- RLS checks the first path segment against `auth.uid()`
- Display uses short-lived signed URLs

## 5. Quota and plan rules

| Plan    | Diagnoses/month | Photos/diagnosis | Reassessments | History                |
| ------- | --------------- | ---------------- | ------------- | ---------------------- |
| Free    | 5               | 2                | 1             | 20 (demo cap)          |
| Premium | 30              | 3                | 3             | Unlimited in live mode |

`getUsage()` reads `usage_events` for the current UTC month. In live mode the actual claim is atomic in `claim_diagnosis_usage`; the client value is informational.

## 6. Error codes used by the client

`src/domain/errors.ts`:

```text
network, unauthorized, quota_exceeded, ai_not_configured, ai_failed,
invalid_input, not_found, storage_failed, image_too_large,
unsupported_image, rate_limited, conflict, cancelled, unknown
```

`normalizeError` maps Supabase/network/provider failures to these codes; screens translate `errors.<code>` and never display raw provider messages.

## 7. Versioning

- Analysis contract: `provider.schema_version` (`1.0.0`).
- Export bundle: `schemaVersion: 1`, with optional profile, usage, support, and preference fields.
- Migrations are immutable; add new migration files for changes.
- Edge Functions and the mobile client must be deployed in a compatible order when the analysis contract changes. Prefer additive fields and a new schema version.
