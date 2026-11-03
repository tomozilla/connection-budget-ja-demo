create or replace function public.slow(s float default 1) returns int language sql as $$ select 1 from pg_sleep(s) $$;
create or replace function public.ping() returns int language sql as $$ select 1 $$;
grant execute on function public.slow(float), public.ping() to anon;
do $$ declare i int; begin
 for i in 1..4 loop
  if not exists(select 1 from pg_roles where rolname='r'||i) then execute format('create role r%s login password %L',i,'postgres'); end if;
  execute format('grant usage on schema public to r%s',i);
  execute format('grant execute on function public.slow(float) to r%s',i);
 end loop; end $$;
