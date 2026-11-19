-- =============================================================================
-- Accomplish AI — initial schema
-- Run in Supabase SQL Editor (or `supabase db push`).
-- Everything is scoped per user via auth.uid() + Row Level Security.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Shared trigger: keep updated_at fresh
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- profiles: recurring intern defaults (auto-fill unless notes override them)
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id                    uuid primary key references auth.users (id) on delete cascade,
  -- "LASTNAME, FIRSTNAME MI." (report header)
  name_last_first       text not null default '',
  -- "FIRSTNAME MI. LASTNAME" (Prepared by signature line)
  name_first_last       text not null default '',
  office                text not null default 'YML',
  default_verifier      text not null default '',
  default_daily_hours   numeric(4, 1) not null default 8,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create an empty profile row whenever a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- templates: the user's tagged copy of 2026-Weekly-Accomplishment-Report.docx
-- -----------------------------------------------------------------------------
create table if not exists public.templates (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name           text not null default '2026-Weekly-Accomplishment-Report.docx',
  -- untouched upload, kept so the user can re-tag after renaming fields
  original_path  text not null,          -- e.g. {user_id}/original.docx
  -- docxtemplater-ready copy with {tags} injected
  storage_path   text not null,          -- e.g. {user_id}/master.docx
  -- DetectedField[] (see src/lib/docx/types.ts)
  schema         jsonb not null default '[]'::jsonb,
  status         text not null default 'pending_review'
                   check (status in ('pending_review', 'confirmed')),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists templates_user_id_idx on public.templates (user_id);
-- at most one active template per user
create unique index if not exists templates_one_active_per_user
  on public.templates (user_id) where is_active;

drop trigger if exists templates_set_updated_at on public.templates;
create trigger templates_set_updated_at
  before update on public.templates
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- reports: every generated weekly report (re-open, edit, re-print anytime)
-- -----------------------------------------------------------------------------
create table if not exists public.reports (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  template_id      uuid references public.templates (id) on delete set null,
  raw_notes        text not null default '',
  structured_data  jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists reports_user_created_idx
  on public.reports (user_id, created_at desc);
create index if not exists reports_template_id_idx
  on public.reports (template_id);

drop trigger if exists reports_set_updated_at on public.reports;
create trigger reports_set_updated_at
  before update on public.reports
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- (select auth.uid()) is evaluated once per statement → faster than auth.uid()
-- -----------------------------------------------------------------------------
alter table public.profiles  enable row level security;
alter table public.templates enable row level security;
alter table public.reports   enable row level security;

-- profiles ---------------------------------------------------------------
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- templates --------------------------------------------------------------
drop policy if exists "templates_select_own" on public.templates;
create policy "templates_select_own" on public.templates
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "templates_insert_own" on public.templates;
create policy "templates_insert_own" on public.templates
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "templates_update_own" on public.templates;
create policy "templates_update_own" on public.templates
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "templates_delete_own" on public.templates;
create policy "templates_delete_own" on public.templates
  for delete to authenticated using ((select auth.uid()) = user_id);

-- reports ----------------------------------------------------------------
drop policy if exists "reports_select_own" on public.reports;
create policy "reports_select_own" on public.reports
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "reports_insert_own" on public.reports;
create policy "reports_insert_own" on public.reports
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and (
      template_id is null
      or exists (
        select 1 from public.templates t
        where t.id = template_id and t.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists "reports_update_own" on public.reports;
create policy "reports_update_own" on public.reports
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (
      template_id is null
      or exists (
        select 1 from public.templates t
        where t.id = template_id and t.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists "reports_delete_own" on public.reports;
create policy "reports_delete_own" on public.reports
  for delete to authenticated using ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- Storage: private "templates" bucket, objects live under {user_id}/...
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'templates',
  'templates',
  false,
  10485760, -- 10 MB
  array['application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "templates_bucket_select_own" on storage.objects;
create policy "templates_bucket_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'templates' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "templates_bucket_insert_own" on storage.objects;
create policy "templates_bucket_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'templates' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "templates_bucket_update_own" on storage.objects;
create policy "templates_bucket_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'templates' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'templates' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "templates_bucket_delete_own" on storage.objects;
create policy "templates_bucket_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'templates' and (storage.foldername(name))[1] = (select auth.uid())::text);
