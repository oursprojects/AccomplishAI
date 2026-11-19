-- =============================================================================
-- Accomplish AI — Admin AI model controls & custom report titles
-- =============================================================================

alter table public.admin_settings
  add column if not exists active_text_model text not null default 'openai/gpt-oss-120b',
  add column if not exists active_stt_model  text not null default 'whisper-large-v3-turbo',
  add column if not exists max_bullets_per_day integer not null default 3
    check (max_bullets_per_day >= 1 and max_bullets_per_day <= 5);

alter table public.reports
  add column if not exists title text not null default '';
