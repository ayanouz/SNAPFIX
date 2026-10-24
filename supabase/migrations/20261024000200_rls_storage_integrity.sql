-- SNAPFIX security, storage, and integrity layer
-- Apply after 20261024000100_core_schema.sql.

-- ---------------------------------------------------------------------------
-- Shared triggers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger diagnoses_set_updated_at
  before update on public.diagnoses
  for each row execute function public.set_updated_at();

create trigger maintenance_tasks_set_updated_at
  before update on public.maintenance_tasks
  for each row execute function public.set_updated_at();

create trigger diagnosis_feedback_set_updated_at
  before update on public.diagnosis_feedback
  for each row execute function public.set_updated_at();

create trigger repair_progress_set_updated_at
  before update on public.repair_progress
  for each row execute function public.set_updated_at();

create trigger entitlements_set_updated_at
  before update on public.entitlements
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- New user profile
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(coalesce(new.email, ''), '@', 1),
      'SNAPFIX user'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill existing users (safe to re-run).
insert into public.profiles (id, display_name)
select
  u.id,
  coalesce(
    nullif(trim(u.raw_user_meta_data ->> 'display_name'), ''),
    split_part(coalesce(u.email, ''), '@', 1),
    'SNAPFIX user'
  )
from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Server-owned diagnosis fields
-- ---------------------------------------------------------------------------
-- The client may only create a draft and toggle is_saved. Analysis, safety
-- classification, provider metadata, and status are written by the Edge
-- Function using the service role, which bypasses this guard.
create or replace function public.guard_diagnosis_writes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := coalesce(auth.role(), '');
begin
  if v_role = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.user_id is distinct from auth.uid() then
      raise exception 'diagnosis user_id must match the authenticated user'
        using errcode = '42501';
    end if;
    if new.status <> 'draft'
      or new.analysis is not null
      or new.safety_level <> 'low'
      or new.analysis_attempts <> 0
      or new.completed_at is not null
      or new.provider_name is not null
      or new.provider_model is not null
      or new.provider_mode is not null
      or new.repairability is not null
      or new.failure_code is not null
      or new.failure_message is not null then
      raise exception 'diagnoses must be created as empty drafts'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if (to_jsonb(new) - 'is_saved' - 'updated_at')
     is distinct from
     (to_jsonb(old) - 'is_saved' - 'updated_at') then
    raise exception 'only the saved flag can be changed by the client'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger diagnoses_guard_writes
  before insert or update on public.diagnoses
  for each row execute function public.guard_diagnosis_writes();

-- ---------------------------------------------------------------------------
-- Usage claim (server only)
-- ---------------------------------------------------------------------------
-- Called by the analyze-diagnosis Edge Function with the service role. The
-- advisory lock serialises concurrent requests for the same user.
create or replace function public.claim_diagnosis_usage(
  p_user_id uuid,
  p_diagnosis_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_plan text := 'free';
  v_limit integer := 5;
  v_used integer := 0;
  v_already boolean := false;
begin
  if p_user_id is null or p_diagnosis_id is null then
    raise exception 'user_id and diagnosis_id are required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('snapfix-usage:' || p_user_id::text));

  select d.user_id into v_owner
  from public.diagnoses d
  where d.id = p_diagnosis_id;

  if v_owner is null or v_owner <> p_user_id then
    raise exception 'diagnosis not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.usage_events e
    where e.user_id = p_user_id
      and e.diagnosis_id = p_diagnosis_id
      and e.event_type = 'diagnosis_used'
  ) then
    v_already := true;
  end if;

  if exists (
    select 1 from public.entitlements en
    where en.user_id = p_user_id
      and en.entitlement = 'premium'
      and en.status = 'active'
      and (en.current_period_end is null or en.current_period_end > now())
  ) then
    v_plan := 'premium';
    v_limit := 30;
  end if;

  select count(*) into v_used
  from public.usage_events e
  where e.user_id = p_user_id
    and e.event_type = 'diagnosis_used'
    and e.created_at >= date_trunc('month', now())
    and e.created_at < date_trunc('month', now()) + interval '1 month';

  if v_already then
    return jsonb_build_object(
      'allowed', true,
      'already_claimed', true,
      'plan', v_plan,
      'used', v_used,
      'limit', v_limit
    );
  end if;

  if v_used >= v_limit then
    return jsonb_build_object(
      'allowed', false,
      'already_claimed', false,
      'plan', v_plan,
      'used', v_used,
      'limit', v_limit
    );
  end if;

  insert into public.usage_events (user_id, diagnosis_id, event_type, metadata)
  values (
    p_user_id,
    p_diagnosis_id,
    'diagnosis_used',
    jsonb_build_object('claimed_at', now())
  );

  return jsonb_build_object(
    'allowed', true,
    'already_claimed', false,
    'plan', v_plan,
    'used', v_used + 1,
    'limit', v_limit
  );
end;
$$;

revoke all on function public.claim_diagnosis_usage(uuid, uuid) from public;
revoke all on function public.claim_diagnosis_usage(uuid, uuid) from anon;
revoke all on function public.claim_diagnosis_usage(uuid, uuid) from authenticated;
grant execute on function public.claim_diagnosis_usage(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.diagnoses enable row level security;
alter table public.diagnosis_images enable row level security;
alter table public.repair_guides enable row level security;
alter table public.repair_progress enable row level security;
alter table public.maintenance_tasks enable row level security;
alter table public.diagnosis_feedback enable row level security;
alter table public.support_messages enable row level security;
alter table public.usage_events enable row level security;
alter table public.entitlements enable row level security;
alter table public.analytics_events enable row level security;
alter table public.price_references enable row level security;
alter table public.cost_quotes enable row level security;

-- Profiles
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Diagnoses
create policy diagnoses_select_own on public.diagnoses
  for select to authenticated using (user_id = auth.uid());
create policy diagnoses_insert_own on public.diagnoses
  for insert to authenticated with check (user_id = auth.uid());
create policy diagnoses_update_own on public.diagnoses
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy diagnoses_delete_own on public.diagnoses
  for delete to authenticated using (user_id = auth.uid());

-- Images (metadata is created by the client after a successful upload)
create policy diagnosis_images_select_own on public.diagnosis_images
  for select to authenticated using (user_id = auth.uid());
create policy diagnosis_images_insert_own on public.diagnosis_images
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.diagnoses d
      where d.id = diagnosis_id and d.user_id = auth.uid()
    )
  );
create policy diagnosis_images_delete_own on public.diagnosis_images
  for delete to authenticated using (user_id = auth.uid());

-- Repair guides are produced by the server; clients only read them.
create policy repair_guides_select_own on public.repair_guides
  for select to authenticated using (user_id = auth.uid());

-- Progress
create policy repair_progress_select_own on public.repair_progress
  for select to authenticated using (user_id = auth.uid());
create policy repair_progress_insert_own on public.repair_progress
  for insert to authenticated with check (user_id = auth.uid());
create policy repair_progress_update_own on public.repair_progress
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Maintenance
create policy maintenance_select_own on public.maintenance_tasks
  for select to authenticated using (user_id = auth.uid());
create policy maintenance_insert_own on public.maintenance_tasks
  for insert to authenticated with check (user_id = auth.uid());
create policy maintenance_update_own on public.maintenance_tasks
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy maintenance_delete_own on public.maintenance_tasks
  for delete to authenticated using (user_id = auth.uid());

-- Feedback
create policy feedback_select_own on public.diagnosis_feedback
  for select to authenticated using (user_id = auth.uid());
create policy feedback_insert_own on public.diagnosis_feedback
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.diagnoses d
      where d.id = diagnosis_id and d.user_id = auth.uid()
    )
  );
create policy feedback_update_own on public.diagnosis_feedback
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Support
create policy support_select_own on public.support_messages
  for select to authenticated using (user_id = auth.uid());
create policy support_insert_own on public.support_messages
  for insert to authenticated with check (user_id = auth.uid());
create policy support_delete_own on public.support_messages
  for delete to authenticated using (user_id = auth.uid());

-- Usage and entitlements are read-only for clients. Writes are server-only.
create policy usage_select_own on public.usage_events
  for select to authenticated using (user_id = auth.uid());
create policy entitlements_select_own on public.entitlements
  for select to authenticated using (user_id = auth.uid());

-- Analytics: clients may record their own events; no update/delete.
create policy analytics_insert_own on public.analytics_events
  for insert to authenticated with check (user_id = auth.uid());
create policy analytics_select_own on public.analytics_events
  for select to authenticated using (user_id = auth.uid());

-- Price references are a shared, read-only catalogue.
create policy price_references_read on public.price_references
  for select to authenticated using (true);

-- Quotes
create policy cost_quotes_select_own on public.cost_quotes
  for select to authenticated using (user_id = auth.uid());
create policy cost_quotes_insert_own on public.cost_quotes
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.diagnoses d
      where d.id = diagnosis_id and d.user_id = auth.uid()
    )
  );
create policy cost_quotes_delete_own on public.cost_quotes
  for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Private image storage
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'diagnosis-images',
  'diagnosis-images',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Object names must start with the owner's uid: <uid>/<diagnosis-id>/<file>.
create policy diagnosis_images_storage_select on storage.objects
  for select to authenticated using (
    bucket_id = 'diagnosis-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy diagnosis_images_storage_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'diagnosis-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy diagnosis_images_storage_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'diagnosis-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'diagnosis-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy diagnosis_images_storage_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'diagnosis-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- Column privileges: tighten what authenticated clients can touch.
-- ---------------------------------------------------------------------------
revoke insert, update, delete on public.usage_events from authenticated, anon;
revoke insert, update, delete on public.entitlements from authenticated, anon;
revoke insert, update, delete on public.price_references from authenticated, anon;
revoke update, delete on public.analytics_events from authenticated, anon;
revoke insert, update, delete on public.repair_guides from authenticated, anon;
revoke update on public.support_messages from authenticated, anon;
