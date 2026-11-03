# Results (2026-11-03)

**Lab:** Supabase CLI stack on one laptop (10 cores), Docker. FULL stack (Auth, Storage, Realtime, Studio, postgres-meta, PostgREST, Supavisor 2.9.12; no Edge Runtime/logs), PostgREST 16.2, Postgres 17. `[db.settings] max_connections = 90`, pooler pool size 15 (transaction mode, the session port reached through a forwarder), 200 clients, `superuser_reserved_connections` 3. Sizing: a hosted Nano allows 60 and used about 16 at idle in my first hosted reading; the local pooler adds 29 connections of its own in the database (`supavisor_internal`: `supavisor_meta` 27 + cluster 2), so 60 + 29 = about 90. Idle footprint (nothing running, Data API warmed): Supavisor 29, Realtime 5-7, PostgREST 11 (10 pool + `LISTEN "pgrst"`), Storage 1-2, Auth 0. Counts below leave `supavisor_internal` out unless stated.

**Hosted:** only script 24, on the Free demo project with the pooler pool size set to 3 (restored to 15), a throwaway role (dropped), 2026-11-03.

Every script was re-run from a clean copy of this repo on 2026-11-03. Numbers depend on what is already open (for example, whether PostgREST's pool is warm adds up to 10 connections to a total); restart the pooler between runs.

| # | Script | What I ran | What I saw |
|---|---|---|---|
| 1 | `node/01-postgresjs-hang` | postgres.js 4.0.0, 20 concurrent 0.5 s queries, max 10, pooler transaction mode | default HANG (>20 s); `prepare:false` alone HANG; `max_pipeline:1` alone ok (1.0 s); both ok. Direct: default ok. -> pipelining, not prepared statements |
| 2 | `node/02-client-limit` | 201 pg clients | 200 connect; 201st refused in 0.5 s: `(EMAXCONN) max client connections reached, limit: 200` |
| 3 | `node/03-roles-and-pools` | N roles x 20 clients, pg Pool max 20, hold 6 s | 1 role: 16 backends. 2 roles: 16 + 16 (total 70 to 80 of 87, fits). 3 roles: 15 + 16 + 7..16 (the third gets what is left), total 87 of 87 = FULL: direct `remaining connection slots are reserved for roles with the SUPERUSER attribute` (53300); new pooler login `(EAUTHQUERY) authentication query failed: connection to database not available` (or a timeout); running clients `sorry, too many clients already`; Data API 200 while its pool already held connections |
| 4 | `node/04-queue-timeout` | clients holding a query (transaction mode; `LAB_MODE=session`) | transaction: 18 x 30 s -> 16 run, 2 wait, all done at 60 s. 17 x 65 s -> the waiting one fails at 60 s: `(ECHECKOUTTIMEOUT) unable to check out connection from the pool after 60000ms in Transaction mode`. Session, 18 x 10 s: 3 refused at 0 s `(EMAXCONNSESSION) max clients reached in session mode - max clients are limited to pool_size`, 15 ran |
| 5 | `node/05-idle-in-transaction` | `BEGIN` and stall, role `idle_in_transaction_session_timeout=5s` | state `idle in transaction` keeps the backend; after 5 s Postgres ends it (`terminating connection due to idle-in-transaction timeout`); the client's next query fails |
| 6 | `node/06-data-api-pool` | concurrent RPC `slow(s)` through PostgREST | peak 11 `authenticator` backends. 20 x 2 s: waves of 2 s and 4 s. 50 x 2.5 s: 40 ok (2.6 to 10.1 s), 10 x `504 PGRST003` at exactly 10 s. `anon` has `statement_timeout=3s`: a 4 s call -> 500 `57014` |
| 7 | `node/07-state-leak`, `07b-...` | same role, clients one after another | pooler: `SET search_path` / `set_config(...,false)` leaked 8 of 8; direct 0 of 8. `set_config(...,true)` did not leak. Session advisory lock stayed held after the client left (pooler); named prepared statement `already exists`; LISTEN/NOTIFY no notification. Direct: none of these |
| 8 | `node/08-instances` | N processes x pg Pool max 10, direct | 10, 30, 50 backends for 1, 3, 5 processes (total 86 of 87). Through the pooler, 5 processes: 50 client connections -> 16 backends |
| 9 | `node/09-latency` | closed loop, N clients, 6 s per cell | table below |
| 10 | `node/10-pool-error` | kill the 5 idle pooled connections (`pg_terminate_backend`) | direct, no `error` handler: crash `Unhandled 'error' event`; with handler: ok; pooler: no event, queries ok |
| 11 | `node/11-linger` | 20 queries, close, watch every 15 s | the 16 pooler backends were still there at 105 s and gone at 120 s (run twice, also from the clean copy) |
| 12 | `node/12-backend-detail` | 20 clients on r1; 12 Data API calls | r1: 16 active backends (`Supavisor`); `authenticator`: 10 idle `COMMIT` + 1 `LISTEN "pgrst"` |
| 13 | `node/13-two-modes` | one role: 20 transaction + 20 session clients at once | r1 had 31 backends (16 + 15); 5 session clients refused |
| 14 | `node/14-client-cap-scope` | 2 roles x 150, 3 roles x 70 idle clients | all connected (300 and 210): the cap of 200 applied per role |
| 15 | `node/15-postgresjs-repeat` | postgres.js, 200 and 3000 repeated queries over 10 connections | pooler: default and `prepare:false` HANG; `max_pipeline:1` (prepare on or off) ok, no errors; session and direct ok |
| 16 | `node/16-full-database-services` | 3 roles fill the database (87 of 87); probes with the local publishable key | Data API 200, Storage upload + list 200 (connections already open); Auth sign-in 500 `Database error querying schema`, sign-up 500 `Database error finding user`; sign-in back at t+62 s after the clients finished (backends 87 -> 86). Restarting PostgREST while full still answered 200 |
| 17 | `node/17-pgbouncer-compare` | PgBouncer 1.26.1 (`edoburu/pgbouncer`, transaction, pool 15, `max_prepared_statements` 200, `query_wait_timeout` 120) in front of the same database | postgres.js default ok (no hang), all variants ok; `SET` leaked 8 of 8; named prepared statement ok; LISTEN no notification; psycopg 3 default: no errors; Prisma 6 with and without `?pgbouncer=true`: no errors, 15 backends |
| 18 | `node/18-guardrails` | `limit`, `timeouts`, `monitor` | limit: r1 held 10 backends, 10 of 20 queries failed at once with `too many connections for role "r1"`, r2 unaffected. timeouts: role `statement_timeout=2s` cancelled a 4 s query at 2.0 s; client `set statement_timeout = 0` was allowed (4.0 s afterwards) and the next client through the pooler saw 0. monitor: with `reserved_connections = 3` a normal role was refused (`... reserved for roles with privileges of the "pg_use_reserved_connections" role`), a role granted `pg_use_reserved_connections` connected (sees 92 connections of 90) |
| 19 | `node/19-library-waits` | node-postgres, max 1, direct | no timeout by default (q2 at 6.0 s, q3 at 9.0 s); with `connectionTimeoutMillis: 2000`: `timeout exceeded when trying to connect` at 2.0 s |
| 20 | `node/20-timeout-prediction` | 199 clients, 100 s, r1, transaction | 4.5 s: predicted 51.5 s, p50 54.1 s, no errors. 5.5 s: predicted 62.9 s, p50 60.6 s, 46 `ECHECKOUTTIMEOUT` |
| 21 | `node/21-open-loop` | new connection per request, 100 ms queries | 100/s: p50 105 ms, no errors. 200/s (capacity about 150/s): p50 233, 492, 767, 1029, 1253 ms (sec 0 to 4), peak in-flight 202, then about 43 of 200 arrivals per second refused (`EMAXCONN`), p50 about 1260 ms |
| 22 | `node/22-leak-rls` | RLS policy `owner = current_setting('app.user', true)`, `r_app` may `SET ROLE r_admin` | pooler: transaction-local setting did not leak (B sees nothing); session-level setting: B (forgot to set the user) saw alice's row; `SET ROLE r_admin` in A -> B ran as r_admin and saw alice and bob. Direct: B saw nothing in all three |
| 23 | `node/23-data-api-no-leak` | local Auth (publishable key), alice and bob, 40 mixed concurrent requests | alice only her row, bob only his, anonymous none; 0 of 40 got someone else's data |
| 24 | `node/24-hosted-tiny` | HOSTED Free project, pool size 3, role `conn_probe` | `modes`: 5 transaction + 5 session clients for 8 s -> 7 backends (4 on 6543 + 3 on 5432), 2 session clients refused `EMAXCONNSESSION`. `postgresjs` (max 2, 6 queries): default HANG, `prepare:false` only HANG, `max_pipeline:1` only ok (3.4 s), both ok. `checkout`: 5 clients holding 65 s on 6543 -> 4 ran, 1 failed at 61 s `(ECHECKOUTTIMEOUT) unable to check out connection from the pool after 60000ms in Transaction mode` |
| 25 | `python/01-psycopg-prepare` | psycopg 3.3.6, 10 connections x 8 runs of one query | pooler, default `prepare_threshold=5`: 8 to 9 of 10 failed (`DuplicatePreparedStatement`, `InvalidSqlStatementName`); `prepare_threshold=None`: none; direct: none; PgBouncer: none |
| 26 | `python/02-sqlalchemy` | SQLAlchemy 2.1.6, 30 threads x 2 s, direct | 15 backends (5 + 10 overflow), 5 kept afterwards. Idle connections killed: without `pool_pre_ping` the first query fails (`OperationalError`), with it ok |
| 27 | `python/03-django` | Django 5.2.18, 20 threads x 2 s, direct | default: 20 backends; `OPTIONS pool=True`: 4 |
| 28 | `python/04-library-waits` | psycopg_pool max 2, timeout=4; SQLAlchemy pool_size 1, pool_timeout=2 | `PoolTimeout: couldn't get a connection after 4.00 sec`; `QueuePool limit of size 1 overflow 0 reached, connection timed out` |
| 29 | `python/05-django-pool-wait` | Django 5.2 `pool=True`, 20 threads x 2 s | `request` (close at the end): 20 ok in 10.1 s, per-thread max 10.1 s. `hold` (never close): 4 ok, 16 failed (`OperationalError` after the 8 s I set; default 30 s) |
| 30 | `prisma6/run.cjs`, `pool-timeout.cjs` | Prisma 6.19.3, 30 concurrent queries; `connection_limit=1` x five 3 s queries | direct: 21 backends (10 physical cores); pooler without `?pgbouncer=true`: 22 errors `prepared statement "sN" does not exist` (26000); with it: 0 errors, 16 backends. pool_timeout: the 4th query failed at 10.0 s with `P2024 Timed out fetching a new connection from the connection pool` |
| 31 | `prisma7/run.ts` | Prisma 7.10.1 + @prisma/adapter-pg, same test | direct: 10 backends; pooler: 10 backends; no errors. (Measured on a clean state: in a batch run, lingering backends of the previous test inflated the counts to 26 and 16.) |

## Latency (script 9): one role, pooler transaction mode, pg Pool max = clients

| query | clients | queries/s | p50 ms | p95 ms |
|---|---|---|---|---|
| 10 ms | 5 | 391 | 13 | 15 |
| 10 ms | 16 | 1205 | 13 | 16 |
| 10 ms | 40 | 1347 | 30 | 38 |
| 10 ms | 100 | 1366 | 71 | 85 |
| 100 ms | 5 | 47 | 104 | 110 |
| 100 ms | 16 | 152 | 105 | 107 |
| 100 ms | 40 | 154 | 220 | 310 |
| 100 ms | 100 | 153 | 621 | 729 |
| 1000 ms | 5 | 5 | 1005 | 1008 |
| 1000 ms | 16 | 16 | 1005 | 1017 |
| 1000 ms | 40 | 15 | 2018 | 3020 |
| 1000 ms | 100 | 15 | 6016 | 7028 |

Little's law (busy backends = queries/s x seconds per query) gives 12 to 15.9 at saturation, about the 16 backends of the pool. Past that, latency is roughly clients x query time / 16. No errors in any cell. One 6 s run per cell: shape, not precision.

## Defaults I read from the installed packages (2026-11-03)
node-postgres 8.23.1 Pool max 10, idleTimeoutMillis 10000, connectionTimeoutMillis 0 (no wait limit) · postgres.js 4.0.0 max 10, connect_timeout 30, max_pipeline 100, idle_timeout none · SQLAlchemy 2.1.6 QueuePool 5 + 10 overflow, timeout 30 s · psycopg_pool 3.3.3 min_size 4, max_size None (= min_size), max_idle 600 s, max_lifetime 3600 s, timeout 30 s · Django 5.2.18 no pool unless `OPTIONS pool=True` · Prisma 6.19.3 physical cores x 2 + 1, pool_timeout 10 s · Prisma 7.10.1 + adapter-pg pg default 10.
