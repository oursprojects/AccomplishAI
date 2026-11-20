-- Team-wide shared Groq RPM cap configurable by Admin
alter table public.admin_settings
  add column if not exists global_rpm_limit integer not null default 60;

alter table public.admin_settings
  drop constraint if exists admin_settings_global_rpm_limit_check;

alter table public.admin_settings
  add constraint admin_settings_global_rpm_limit_check
  check (global_rpm_limit >= 10 and global_rpm_limit <= 300);
