-- 接続数の実験用の、テスト専用オブジェクト。使い捨ての無料プロジェクトのSQL Editorで実行します。
-- <CHOOSE-A-RANDOM-PASSWORD> は、自分で作ったランダムなパスワードに置き換えます（本物のパスワードは使い回さない）。
create role conn_probe login password '<CHOOSE-A-RANDOM-PASSWORD>';
grant usage on schema public to conn_probe;

create table public.conn_probe_t (id int primary key, v text);
alter table public.conn_probe_t enable row level security;
insert into public.conn_probe_t values (1, 'a'), (2, 'b'), (3, 'c');
create policy conn_probe_read on public.conn_probe_t for select to anon, conn_probe using (true);
grant select on public.conn_probe_t to conn_probe, anon;

-- s秒のあいだ接続を握る（「忙しいクエリ」）
create or replace function public.probe_sleep(s numeric) returns int
  language sql security invoker set search_path = ''
  as $$ select 1 from pg_catalog.pg_sleep(s) $$;
grant execute on function public.probe_sleep(numeric) to anon, conn_probe;

-- ロールごとにバックエンド接続を数える。デモ専用：公開用キーで呼べるので、終わったら消す。
create or replace function public.conn_stats() returns table(usename text, state text, n bigint)
  language sql security definer set search_path = ''
  as $$ select a.usename::text, a.state::text, count(*) from pg_catalog.pg_stat_activity a where a.datname = 'postgres' group by 1, 2 $$;
revoke all on function public.conn_stats() from public;
grant execute on function public.conn_stats() to anon;
