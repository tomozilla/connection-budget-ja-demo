-- Test-only objects for the connection experiments. Run in the SQL Editor of a FREE, throwaway project.
-- Replace <CHOOSE-A-RANDOM-PASSWORD> with a random password you generate yourself (do not reuse a real one).
create role conn_probe login password '<CHOOSE-A-RANDOM-PASSWORD>';
grant usage on schema public to conn_probe;

create table public.conn_probe_t (id int primary key, v text);
alter table public.conn_probe_t enable row level security;
insert into public.conn_probe_t values (1, 'a'), (2, 'b'), (3, 'c');
create policy conn_probe_read on public.conn_probe_t for select to anon, conn_probe using (true);
grant select on public.conn_probe_t to conn_probe, anon;

-- holds a connection for s seconds (the "busy query")
create or replace function public.probe_sleep(s numeric) returns int
  language sql security invoker set search_path = ''
  as $$ select 1 from pg_catalog.pg_sleep(s) $$;
grant execute on function public.probe_sleep(numeric) to anon, conn_probe;

-- counts backend connections by role. DEMO ONLY: callable with the publishable key, drop it afterwards.
create or replace function public.conn_stats() returns table(usename text, state text, n bigint)
  language sql security definer set search_path = ''
  as $$ select a.usename::text, a.state::text, count(*) from pg_catalog.pg_stat_activity a where a.datname = 'postgres' group by 1, 2 $$;
revoke all on function public.conn_stats() from public;
grant execute on function public.conn_stats() to anon;
