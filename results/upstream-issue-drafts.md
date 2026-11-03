# Draft issue texts (NOT filed)

Texts ready to post upstream. At the time of writing nothing had been posted. Both behaviours were seen in a local Supabase CLI stack (Supavisor 2.9.12) and the first one also on a hosted project at pool size 3.

## 1. Supavisor: transaction mode opens pool_size + 1 backend connections

- Setup: pool size 15 (hosted: 3), one role, transaction mode, more clients than the pool.
- Observed: 16 backends for pool size 15 (one role, 20 clients each holding a query), and 16 clients run at the same time while the 17th waits. Session mode on the same pool opens exactly 15. On a hosted project with pool size 3: 4 backends on the transaction port and 3 on the session port. PgBouncer 1.26.1 with default_pool_size 15 in front of the same database opened exactly 15.
- Docs say database connections follow the configured pool size. The extra one matters when the budget is tight (3 roles x 16 = 48 instead of 45).
- Reproduce: `scripts/node/03-roles-and-pools.mjs 1 6` (lab), `scripts/node/24-hosted-tiny.mjs modes` (hosted, pool size 3).
- Question: is the extra connection intended (a reserved or auth connection counted outside the pool), and should the docs say pool size + 1?

## 2. postgres.js 4.x through Supavisor in transaction mode hangs with pipelined queries

- Setup: postgres.js 4.0.0, `max: 10` (or 2), 20 concurrent `select 1 from pg_sleep(0.5)`, default options.
- Observed: the promise never resolves (waited 20 to 25 s). `prepare: false` alone still hangs. `max_pipeline: 1` alone fixes it (1.0 s), with or without `prepare: false`. Direct connection and session mode: fine. PgBouncer 1.26.1 in transaction mode: fine. Hosted pooler at pool size 3: same result as the lab.
- postgres.js defaults to `max_pipeline: 100`, so several queries are queued on one connection.
- Not a hidden retry: with `max_pipeline: 1` only, `scripts/node/25-postgresjs-retry.mjs` shows one Parse per connection (10 for 3000 queries) and no `26000` in the Postgres or pooler logs.
- Reproduce: `scripts/node/01-postgresjs-hang.mjs pooler '{}'`, `.../'{"prepare":false}'`, `.../'{"max_pipeline":1}'`, and `scripts/node/15-postgresjs-repeat.mjs`.
- Question: should Supavisor handle pipelined extended-protocol messages in transaction mode, or should the docs for postgres.js say `max_pipeline: 1` (and not only `prepare: false`)?

## Docs: pool size shared between modes, or per mode?
- The connecting-to-Postgres page says session (5432) and transaction (6543) share one pool size ("the total combined connections across both modes cannot exceed 30"). The Supavisor FAQ and my runs (31 backends = 16 + 15 on one role, hosted: 4 + 3 at pool size 3) say each (user, database, mode) has its own pool.
