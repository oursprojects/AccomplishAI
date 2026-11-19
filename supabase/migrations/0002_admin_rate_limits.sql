-- =============================================================================
-- Accomplish AI — Admin management & per-intern prompt rate limiting
-- Admin email: mikorynosantiago@gmail.com
-- =============================================================================

create table if not exists public.admin_settings (
  id                         integer primary key default 1 check (id = 1),
  default_daily_prompt_limit integer not null default 15
                               check (default_daily_prompt_limit >= 0 and default_daily_prompt_limit <= 1000),
  updated_at                 timestamptz not null default now()
);

insert into public.admin_settings (id, default_daily_prompt_limit)
values (1, 15)
on conflict (id) do nothing;

create trigger admin_settings_set_updated_at
  before update on public.admin_settings
  for each row execute function public.set_updated_at();

create table if not exists public.user_quotas (
  user_id            uuid primary key references auth.users (id) on delete cascade,
  email              text not null default '',
  custom_daily_limit integer check (custom_daily_limit is null or (custom_daily_limit >= 0 and custom_daily_limit <= 1000)),
  is_blocked         boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger user_quotas_set_updated_at
  before update on public.user_quotas
  for each row execute function public.set_updated_at();

create table if not exists public.prompt_usage_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text not null default 'generate_report',
  model      text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists prompt_usage_logs_user_created_idx
  on public.prompt_usage_logs (user_id, created_at desc);

-- Keep handle_new_user creating both profiles and user_quotas rows
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;

  insert into public.user_quotas (user_id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (user_id) do update
    set email = coalesce(excluded.email, public.user_quotas.email);

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Backfill existing users into profiles and user_quotas
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

insert into public.user_quotas (user_id, email)
select id, coalesce(email, '') from auth.users
on conflict (user_id) do update
  set email = excluded.email;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.admin_settings    enable row level security;
alter table public.user_quotas       enable row level security;
alter table public.prompt_usage_logs enable row level security;

-- admin_settings: any signed-in user can read global limit; only admin can edit
create policy "admin_settings_select_auth" on public.admin_settings
  for select to authenticated using (true);

create policy "admin_settings_insert_admin" on public.admin_settings
  for insert to authenticated
  with check (lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'mikorynosantiago@gmail.com');

create policy "admin_settings_update_admin" on public.admin_settings
  for update to authenticated
  using (lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'mikorynosantiago@gmail.com')
  with check (lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'mikorynosantiago@gmail.com');

-- user_quotas: interns can read their own row; admin manages all rows
create policy "user_quotas_select_own_or_admin" on public.user_quotas
  for select to authenticated
  using (
    (select auth.uid()) = user_id
    or lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'mikorynosantiago@gmail.com'
  );

create policy "user_quotas_insert_admin" on public.user_quotas
  for insert to authenticated
  with check (lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'mikorynosantiago@gmail.com');

create policy "user_quotas_update_admin" on public.user_quotas
  for update to authenticated
  using (lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'mikorynosantiago@gmail.com')
  with check (lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'mikorynosantiago@gmail.com');

create policy "user_quotas_delete_admin" on public.user_quotas
  for delete to authenticated
  using (lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'mikorynosantiago@gmail.com');

-- prompt_usage_logs: interns insert/read own logs; admin can read/delete any (e.g., reset)
create policy "prompt_usage_logs_select_own_or_admin" on public.prompt_usage_logs
  for select to authenticated
  using (
    (select auth.uid()) = user_id
    or lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'mikorynosantiago@gmail.com'
  );

create policy "prompt_usage_logs_insert_own" on public.prompt_usage_logs
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "prompt_usage_logs_delete_admin" on public.prompt_usage_logs
  for delete to authenticated
  using (lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'mikorynosantiago@gmail.com');

-- Allow admin to also view profiles and report counts across intern members
create policy "profiles_select_admin" on public.profiles
  for select to authenticated
  using (lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'mikorynosantiago@gmail.com');

create policy "reports_select_admin" on public.reports
  for select to authenticated
  using (lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'mikorynosantiago@gmail.com');
