-- Admin-configurable per-user saved report limit (null = unlimited)
alter table public.admin_settings
  add column if not exists default_max_reports integer null;

alter table public.user_quotas
  add column if not exists custom_max_reports integer null;

alter table public.admin_settings
  drop constraint if exists admin_settings_default_max_reports_check;

alter table public.admin_settings
  add constraint admin_settings_default_max_reports_check
  check (default_max_reports is null or (default_max_reports >= 1 and default_max_reports <= 10000));

alter table public.user_quotas
  drop constraint if exists user_quotas_custom_max_reports_check;

alter table public.user_quotas
  add constraint user_quotas_custom_max_reports_check
  check (custom_max_reports is null or (custom_max_reports >= 1 and custom_max_reports <= 10000));
