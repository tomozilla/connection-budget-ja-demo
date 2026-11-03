-- Local lab only. An RLS policy that trusts a session setting, a role the app can SET ROLE to, and sample rows.
create table if not exists public.notes (owner text, body text);
alter table public.notes enable row level security;
alter table public.notes force row level security;
truncate public.notes;
insert into public.notes values ('alice', 'Alice: salary review draft'), ('bob', 'Bob: holiday plan');
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'r_app') then create role r_app login password 'postgres'; end if;
  if not exists (select 1 from pg_roles where rolname = 'r_admin') then create role r_admin nologin bypassrls; end if;
end $$;
grant usage on schema public to r_app, r_admin;
grant select on public.notes to r_app, r_admin;
grant r_admin to r_app;   -- the app is allowed to SET ROLE r_admin (a common "admin mode" pattern)
drop policy if exists notes_by_setting on public.notes;
create policy notes_by_setting on public.notes for select to r_app using (owner = current_setting('app.user', true));
