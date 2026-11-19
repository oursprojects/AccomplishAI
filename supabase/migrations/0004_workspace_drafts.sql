-- =============================================================================
-- Accomplish AI — Cross-device active conversation & draft persistence
-- =============================================================================

create table if not exists public.workspace_drafts (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  report_id       uuid references public.reports (id) on delete set null,
  structured_data jsonb not null default '{}'::jsonb,
  chat_messages   jsonb not null default '[]'::jsonb,
  updated_at      timestamptz not null default now()
);

create index if not exists workspace_drafts_report_id_idx
  on public.workspace_drafts (report_id);

create trigger workspace_drafts_set_updated_at
  before update on public.workspace_drafts
  for each row execute function public.set_updated_at();

alter table public.workspace_drafts enable row level security;

create policy "workspace_drafts_select_own" on public.workspace_drafts
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "workspace_drafts_insert_own" on public.workspace_drafts
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and (
      report_id is null
      or exists (
        select 1 from public.reports r
        where r.id = report_id and r.user_id = (select auth.uid())
      )
    )
  );

create policy "workspace_drafts_update_own" on public.workspace_drafts
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (
      report_id is null
      or exists (
        select 1 from public.reports r
        where r.id = report_id and r.user_id = (select auth.uid())
      )
    )
  );

create policy "workspace_drafts_delete_own" on public.workspace_drafts
  for delete to authenticated using ((select auth.uid()) = user_id);
