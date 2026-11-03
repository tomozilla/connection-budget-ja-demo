# Results (2026-11-03, local lab)

Lab: Supabase CLI stack on one laptop (10 cores), Docker. Supavisor 2.9.12 (transaction mode unless noted), PostgREST 16.2, Postgres 17.
Set to Nano-like limits: `max_connections` 60, pooler pool size 15, max clients 200. The lab's own pooler keeps 27 metadata connections open (`supavisor_internal`); counts below leave them out unless stated. A hosted project may differ (versions, settings, the shared pooler's other tenants). Nothing here was run on a hosted project.

| # | Script | What I ran | What I saw |
|---|---|---|---|
| 1 | `node/01-postgresjs-hang.mjs` | postgres.js 4.0.0, 20 concurrent 0.5 s queries, pool max 10 | pooler: default HANG (>20 s); `prepare:false` alone HANG; `max_pipeline:1` alone ok (1.0 s); both ok. 2 queries: all ok. Direct: default ok. -> pipelining, not prepared statements |
| 2 | `node/02-client-limit.mjs` | 201 pg clients on the pooler | 200 connect; 201st refused in 0.5 s: `(EMAXCONN) max client connections reached, limit: 200` |
| 3 | `node/03-roles-and-pools.mjs` | R roles x 20 concurrent queries, pg Pool max 20 each, pool 15 | 1 role: 16 backends (transaction mode; 15 in session mode). 2 roles: 13 + 14 = the database full (57 of 60; 3 reserved): new direct connection `remaining connection slots are reserved for roles with the SUPERUSER attribute` (53300); Data API `503 PGRST000`; new login through the pooler `(EAUTHQUERY) authentication query failed: connection to database not available`; running clients `sorry, too many clients already` |
| 4 | `node/04-queue-timeout.mjs` | N clients each holding a query | transaction: 18 clients x 30 s -> 16 run, 2 wait, done at 60 s. 17 clients x 65 s -> the waiting one fails at 60 s: `(ECHECKOUTTIMEOUT) unable to check out connection from the pool after 60000ms in Transaction mode`. session, 18 clients: 3 refused at once `(EMAXCONNSESSION) max clients reached in session mode - max clients are limited to pool_size`, 15 ran |
| 5 | `node/05-idle-in-transaction.mjs` | BEGIN and stall, role setting `idle_in_transaction_session_timeout=5s` | state `idle in transaction` keeps the backend; after 5 s Postgres ends it: `terminating connection due to idle-in-transaction timeout`; the client's next query fails |
| 6 | `node/06-data-api-pool.mjs` | concurrent RPC `slow(s)` through PostgREST | peak 11 `authenticator` backends. 20 x 2 s: two waves (2 s, 4 s). 50 x 2.5 s: 40 ok (2.5 to 10.1 s), 10 x `504 PGRST003` at exactly 10 s. `anon` has `statement_timeout=3s`: a 4 s call returns 500 `57014` |
| 7 | `node/07-state-leak.mjs`, `07b-...` | same role, clients one after another | pooler: `SET` and `set_config(...,false)` leaked into the next client 8 of 8; direct 0 of 8. `set_config(...,true)` did not leak. Session advisory lock stayed held after the client left (pooler); named prepared statement: `prepared statement "q1" already exists`; LISTEN/NOTIFY: no notification. Direct: none of these |
| 8 | `node/08-instances.mjs` | N processes x pg Pool max 10 (`max_connections` raised to 150 for this run only) | direct: 10, 30, 50 backends for 1, 3, 5 processes. Pooler, 5 processes: 50 client connections -> 16 backends |
| 9 | `node/09-latency.mjs` | closed loop, N clients, 6 s per cell, one role | see table below |
| 10 | `node/10-pool-error.mjs` | kill the 5 idle pooled connections with `pg_terminate_backend` | direct, no `error` handler: process crashes (`Unhandled 'error' event`); with handler: 5 error events, next 6 queries ok; pooler: no event, queries ok |
| 11 | `node/11-linger.mjs` | 20 queries, close, watch every 15 s | the 16 pooler backends were gone between 105 s and 120 s after the clients closed |
| 12 | `python/01-psycopg-prepare.py` | psycopg 3.3.6, 10 connections x 8 runs of one query | pooler, default `prepare_threshold=5`: 8 to 9 of 10 failed in two runs (`DuplicatePreparedStatement`, `InvalidSqlStatementName`); `prepare_threshold=None`: none; direct: none |
| 13 | `python/02-sqlalchemy.py` | SQLAlchemy 2.1.6, 30 threads x 2 s, direct | 15 backends (5 + 10 overflow), 5 kept afterwards. Idle connections killed: without `pool_pre_ping` the first query fails (`OperationalError`), with it ok |
| 14 | `python/03-django.py` | Django 5.2.18, 20 threads x 2 s, direct | default (CONN_MAX_AGE 0): 20 backends; `OPTIONS pool=True`: 4 |
| 15 | `prisma6/run.cjs` | Prisma 6.19.3, 30 concurrent queries, 10 physical cores | direct: 21 backends; pooler without `?pgbouncer=true`: 22 errors `prepared statement "sN" does not exist` (26000); with it: 0 errors, 16 backends |
| 16 | `prisma7/run.ts` | Prisma 7.10.1 + @prisma/adapter-pg, same test | direct: 10 backends; pooler: 10 backends, no errors |

## Latency (script 9): one role, pooler transaction mode, pg Pool max = clients

| query | clients | queries/s | p50 ms | p95 ms |
|---|---|---|---|---|
| 10 ms | 5 | 377 | 13 | 16 |
| 10 ms | 16 | 1185 | 13 | 16 |
| 10 ms | 40 | 1319 | 31 | 39 |
| 10 ms | 100 | 1337 | 73 | 88 |
| 100 ms | 5 | 47 | 104 | 112 |
| 100 ms | 16 | 152 | 105 | 108 |
| 100 ms | 40 | 154 | 218 | 312 |
| 100 ms | 100 | 153 | 620 | 724 |
| 1000 ms | 5 | 5 | 1006 | 1013 |
| 1000 ms | 16 | 16 | 1004 | 1014 |
| 1000 ms | 40 | 15 | 2018 | 3022 |
| 1000 ms | 100 | 15 | 6018 | 7023 |

Little's law (busy backends = queries/s x seconds per query) gives 11.8 to 15.9 at saturation, i.e. about the 16 backends of the pool. Past that, latency is roughly clients x query time / 16. No errors in any cell. One 6 s run per cell: treat the numbers as shape, not precision.

## Defaults I read from the installed packages (2026-11-03)
node-postgres 8.23.1 Pool max 10 · postgres.js 4.0.0 max 10 · SQLAlchemy 2.1.6 QueuePool 5 + 10 overflow, timeout 30 s · psycopg_pool 3.3.3 min_size 4, max_size None (= min_size), max_idle 600 s, max_lifetime 3600 s · Django 5.2.18 no pool unless `OPTIONS pool=True` · Prisma 6.19.3 physical cores x 2 + 1 · Prisma 7.10.1 + adapter-pg 7.10.1 pg default 10.
