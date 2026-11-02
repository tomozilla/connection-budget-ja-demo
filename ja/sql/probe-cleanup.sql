-- 実験で作ったものを、すべて消します
drop function if exists public.conn_stats();
drop function if exists public.probe_sleep(numeric);
drop table if exists public.conn_probe_t;
revoke usage on schema public from conn_probe;
drop role if exists conn_probe;
