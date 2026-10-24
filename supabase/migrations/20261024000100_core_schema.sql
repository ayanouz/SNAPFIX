-- SNAPFIX core schema
-- All timestamps are UTC. User-owned rows are protected by RLS in the next migration.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  preferred_language text not null default 'en' check (preferred_language in ('en', 'fr', 'ar')),
  preferred_currency text not null default 'MAD' check (preferred_currency ~ '^[A-Z]{3}$'),
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Diagnoses
-- ---------------------------------------------------------------------------
create table public.diagnoses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'draft'
    check (status in ('draft', 'uploading', 'analyzing', 'completed', 'failed')),
  category text not null
    check (category in ('appliance', 'plumbing', 'electrical', 'heating_cooling',
                        'furniture', 'walls_floors', 'electronics', 'other')),
  description text not null check (char_length(description) between 1 and 2000),
  brand text check (brand is null or char_length(brand) <= 120),
  model text check (model is null or char_length(model) <= 120),
  error_code text check (error_code is null or char_length(error_code) <= 80),
  item_age_years numeric(5, 1) check (item_age_years is null or (item_age_years >= 0 and item_age_years <= 100)),
  currency text not null default 'MAD' check (currency ~ '^[A-Z]{3}$'),
  locale text not null default 'en' check (locale in ('en', 'fr', 'ar')),
  analysis jsonb check (analysis is null or jsonb_typeof(analysis) = 'object'),
  safety_level text not null default 'low' check (safety_level in ('low', 'medium', 'high', 'critical')),
  repairability text check (repairability is null or repairability in ('diy', 'diy_with_caution', 'professional', 'replace', 'unknown')),
  provider_name text,
  provider_model text,
  provider_mode text check (provider_mode is null or provider_mode in ('vision', 'text', 'demo')),
  schema_version text,
  failure_code text,
  failure_message text check (failure_message is null or char_length(failure_message) <= 500),
  analysis_attempts integer not null default 0 check (analysis_attempts between 0 and 10),
  is_saved boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index diagnoses_user_created_idx on public.diagnoses (user_id, created_at desc);
create index diagnoses_user_status_idx on public.diagnoses (user_id, status);
create index diagnoses_user_category_idx on public.diagnoses (user_id, category);
create index diagnoses_user_saved_idx on public.diagnoses (user_id, is_saved);

create table public.diagnosis_images (
  id uuid primary key default gen_random_uuid(),
  diagnosis_id uuid not null references public.diagnoses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 8388608),
  position integer not null default 0 check (position between 0 and 9),
  created_at timestamptz not null default now(),
  unique (diagnosis_id, position)
);

create index diagnosis_images_diagnosis_idx on public.diagnosis_images (diagnosis_id);
create index diagnosis_images_user_idx on public.diagnosis_images (user_id);

-- ---------------------------------------------------------------------------
-- Repair guides and progress
-- ---------------------------------------------------------------------------
create table public.repair_guides (
  id uuid primary key default gen_random_uuid(),
  diagnosis_id uuid not null references public.diagnoses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  version integer not null default 1 check (version > 0),
  title text not null check (char_length(title) <= 200),
  steps jsonb not null check (jsonb_typeof(steps) = 'array'),
  tools text[] not null default '{}',
  materials text[] not null default '{}',
  difficulty text not null check (difficulty in ('easy', 'moderate', 'advanced', 'professional')),
  duration_minutes_min integer not null check (duration_minutes_min > 0),
  duration_minutes_max integer not null check (duration_minutes_max >= duration_minutes_min),
  professional_only boolean not null default false,
  safety_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (diagnosis_id, version)
);

create table public.repair_progress (
  diagnosis_id uuid primary key references public.diagnoses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  completed_steps text[] not null default '{}',
  current_step integer not null default 0 check (current_step >= 0),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, diagnosis_id)
);

-- ---------------------------------------------------------------------------
-- Maintenance
-- ---------------------------------------------------------------------------
create table public.maintenance_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  item_description text not null check (char_length(item_description) between 1 and 160),
  task_description text not null check (char_length(task_description) between 1 and 500),
  frequency text not null default 'monthly'
    check (frequency in ('once', 'weekly', 'monthly', 'quarterly', 'biannual', 'yearly')),
  next_due_date date not null,
  reminder_enabled boolean not null default false,
  last_completed_at timestamptz,
  notification_id text,
  notes text check (notes is null or char_length(notes) <= 1000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index maintenance_user_due_idx on public.maintenance_tasks (user_id, next_due_date);

-- ---------------------------------------------------------------------------
-- Feedback and support
-- ---------------------------------------------------------------------------
create table public.diagnosis_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  diagnosis_id uuid not null references public.diagnoses (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  reason text check (reason is null or reason in ('wrong_item', 'unsafe', 'unclear', 'missing_steps', 'other')),
  comment text check (comment is null or char_length(comment) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, diagnosis_id)
);

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null check (category in ('bug', 'diagnosis', 'privacy', 'billing', 'other')),
  message text not null check (char_length(message) between 1 and 2000),
  email text,
  diagnosis_id uuid references public.diagnoses (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'closed')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Usage, analytics, entitlements
-- ---------------------------------------------------------------------------
create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_type text not null check (event_type in ('diagnosis_used', 'reassessment', 'ai_request', 'ai_failure')),
  diagnosis_id uuid references public.diagnoses (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index usage_events_user_period_idx on public.usage_events (user_id, created_at desc);
create unique index usage_events_one_claim_per_diagnosis_idx
  on public.usage_events (user_id, diagnosis_id)
  where event_type = 'diagnosis_used' and diagnosis_id is not null;

create table public.entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  entitlement text not null default 'premium' check (entitlement = 'premium'),
  provider text,
  provider_reference text,
  status text not null default 'inactive' check (status in ('active', 'inactive', 'expired')),
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, entitlement)
);

create table public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  event_type text not null check (event_type in (
    'onboarding_completed', 'first_diagnosis_started', 'first_diagnosis_completed',
    'diagnosis_failed', 'repair_guide_opened', 'repair_step_completed',
    'diagnosis_saved', 'diagnosis_shared', 'return_visit',
    'subscription_screen_viewed', 'purchase_completed', 'feedback_submitted'
  )),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index analytics_events_type_idx on public.analytics_events (event_type, created_at desc);

-- ---------------------------------------------------------------------------
-- Verified price references and user quotes
-- ---------------------------------------------------------------------------
create table public.price_references (
  id uuid primary key default gen_random_uuid(),
  category text not null
    check (category in ('appliance', 'plumbing', 'electrical', 'heating_cooling',
                        'furniture', 'walls_floors', 'electronics', 'other')),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  region text not null default 'global',
  part_name text not null check (char_length(part_name) <= 160),
  cause_keywords text[] not null default '{}',
  min_price numeric(12, 2) not null check (min_price >= 0),
  max_price numeric(12, 2) not null check (max_price >= min_price),
  includes_parts boolean not null default true,
  includes_labor boolean not null default false,
  labor_hours_min numeric(6, 2),
  labor_hours_max numeric(6, 2),
  labor_rate_per_hour numeric(12, 2),
  source_name text not null,
  source_url text,
  verified_at timestamptz not null,
  verified_by text,
  created_at timestamptz not null default now()
);

create index price_references_lookup_idx
  on public.price_references (category, currency, region, verified_at desc);

create table public.cost_quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  diagnosis_id uuid not null references public.diagnoses (id) on delete cascade,
  quote_type text not null check (quote_type in ('repair', 'replacement')),
  label text not null check (char_length(label) between 1 and 120),
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  includes_parts boolean not null default false,
  includes_labor boolean not null default false,
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now()
);

create index cost_quotes_diagnosis_idx on public.cost_quotes (diagnosis_id);
create index cost_quotes_user_idx on public.cost_quotes (user_id);
