-- Stores the intern's Week 1 anchor date (ISO YYYY-MM-DD, e.g. 2026-11-09)
alter table public.profiles
  add column if not exists internship_start_date text null;
