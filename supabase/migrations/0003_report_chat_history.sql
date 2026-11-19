-- =============================================================================
-- Accomplish AI — Persist chat conversation per report
-- =============================================================================

alter table public.reports
  add column if not exists chat_messages jsonb not null default '[]'::jsonb;
