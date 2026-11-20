-- Allow admin to configure max context messages per report conversation
alter table public.admin_settings
  add column if not exists max_chat_messages integer not null default 16;

alter table public.admin_settings
  drop constraint if exists admin_settings_max_chat_messages_check;

alter table public.admin_settings
  add constraint admin_settings_max_chat_messages_check
  check (max_chat_messages >= 4 and max_chat_messages <= 60);
