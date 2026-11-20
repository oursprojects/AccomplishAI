-- Allow the admin account to insert/update intern profile defaults on creation or management.
drop policy if exists "profiles_insert_admin" on public.profiles;
create policy "profiles_insert_admin" on public.profiles
  for insert to authenticated
  with check (lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'mikorynosantiago@gmail.com');

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin" on public.profiles
  for update to authenticated
  using (lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'mikorynosantiago@gmail.com')
  with check (lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'mikorynosantiago@gmail.com');
