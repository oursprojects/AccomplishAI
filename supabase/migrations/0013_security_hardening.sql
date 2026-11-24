-- Security hardening:
-- 1. Narrow global RPM counter for burst limiting across concurrent interns without exposing log rows.
-- 2. Enforce server-generated created_at on prompt_usage_logs so callers cannot backdate usage timestamps.

create or replace function public.get_global_rpm_count()
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.prompt_usage_logs
  where created_at >= now() - interval '1 minute';
$$;

revoke all on function public.get_global_rpm_count() from public, anon;
grant execute on function public.get_global_rpm_count() to authenticated;

create or replace function public.enforce_prompt_log_timestamp()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.created_at = now();
  return new;
end;
$$;

drop trigger if exists prompt_usage_logs_enforce_created_at on public.prompt_usage_logs;
create trigger prompt_usage_logs_enforce_created_at
  before insert on public.prompt_usage_logs
  for each row execute function public.enforce_prompt_log_timestamp();
