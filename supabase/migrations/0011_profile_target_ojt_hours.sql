-- Store each intern's required OJT hours target (e.g. 240, 300, 486) for progress tracking
alter table public.profiles
  add column if not exists target_ojt_hours integer not null default 486;

alter table public.profiles
  drop constraint if exists profiles_target_ojt_hours_check;

alter table public.profiles
  add constraint profiles_target_ojt_hours_check
  check (target_ojt_hours >= 40 and target_ojt_hours <= 5000);
