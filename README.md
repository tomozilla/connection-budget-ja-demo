# connection-budget-ja-demo

[English](README.md) | [日本語](README.ja.md)

**Personal learning record, unofficial.** I am a fellow builder who tried this myself; this is not official guidance and not an authority.

How many database connections does my app really open, and what changes with the "door" (Data API, direct, shared pooler in session mode, shared pooler in transaction mode) and the framework's defaults? This repo has the **test scripts** I used (Node.js and Python) and a small static **connection budget calculator** page that models the numbers.

Last run and checked: **2026-11-02**, one Supabase **Free** (Nano) project, region Sydney, from a laptop on an IPv4-only network.

## Files

| Path | What it is |
|---|---|
| `sql/probe-setup.sql` | Test role `conn_probe`, a tiny table, a sleep function and a connection-counting function (demo only) |
| `sql/probe-cleanup.sql` | Removes all of it |
| `scripts/node/*.mjs` | pg Pool, postgres.js, Drizzle (node-postgres), Prisma 6, supabase-js / fetch (Data API), and a postgres.js pipelining check |
| `scripts/python/*.py` | SQLAlchemy 2 and Django 4.2 |
| `app/index.html`, `app/calc.js`, `app/board.js` | The calculator (plain HTML/JS, no build, no network calls, no keys) |
| `app/test-calc.js` | Tests of the calculator's logic: `npm test` |
| `ja/` | Japanese copies of the app and SQL |

## How I measured
Each script fires **20 concurrent queries** that each hold a connection for 1 second (`select 1 from pg_sleep(1)`), while a helper polls `conn_stats()` through the Data API every 200 ms and records the peak number of Postgres backend connections owned by `conn_probe` (or by `authenticator` for the Data API). Then it waits and reads the count again after the clients closed.

Configuration is read from environment variables, never from files:

```
export PROJECT_REF=<your project ref>
export POOLER_HOST=<pooler host from the dashboard Connect dialog>
export PROBE_PASSWORD=<the random password you put in sql/probe-setup.sql>
export PUBLISHABLE_KEY=<the project's publishable key>
```

```
cd scripts/node && npm install        # or use the package.json at the repo root
node pg-pool.mjs session              # door = session | transaction
node postgresjs.mjs transaction nopipe
node prisma.mjs session               # first: npx prisma generate --schema prisma/schema.prisma
cd ../python && python3 -m venv venv && ./venv/bin/pip install sqlalchemy "psycopg[binary]" django
./venv/bin/python sqlalchemy_pool.py session
```

## What I measured (2026-11-02, Free/Nano, pool size 15, 20 concurrent 1-second queries)

| Framework (default pool) | Door | Clients | Peak backends | Result |
|---|---|---|---|---|
| supabase-js (Data API) | Data API | 20 requests | `authenticator` 2 -> 11 | all ok |
| plain `fetch` (Data API) | Data API | 20 requests | stayed at 11 | all ok |
| pg Pool (max 10) | session 5432 | 10 | 10 | all ok |
| pg Pool (max 10) | transaction 6543 | 10 | +10 | all ok |
| postgres.js (max 10) | session 5432 | 10 | at most 10 (it reused idle backends left by the previous run) | all ok |
| postgres.js (max 10) | transaction 6543 | 10 | **hung** with defaults; ok with `prepare: false, max_pipeline: 1` | see below |
| Drizzle (node-postgres, max 10) | session 5432 | 10 | +10 | all ok |
| Prisma 6 (CPUs x 2 + 1 = 21 on 10 cores) | transaction 6543 (`pgbouncer=true`) | 20 | 16 | all ok |
| Prisma 6 | session 5432 | 20 | 15 | **15 ok, 5 errors**: `EMAXCONNSESSION max clients reached in session mode` |
| SQLAlchemy 2 (5 + 10 overflow) | session 5432 | 15 | 15 | 20 threads ok (5 waited in the app pool) |
| SQLAlchemy 2 (`prepare_threshold=None`) | transaction 6543 | 15 | 15 | all ok |
| Django 4.2 (one connection per thread) | transaction 6543 (`DISABLE_SERVER_SIDE_CURSORS`) | 20 | 16 | all ok |
| any | direct 5432 | - | - | **not reachable from my laptop**: the host has only an IPv6 address (`getaddrinfo ENOTFOUND`) |

"+10" means the count rose by 10 on top of idle connections left over from the previous run.

Things I saw that I did not expect:
- **Idle backends stay open after the clients close.** After my runs the pooler kept its backend connections for **about 3 minutes**, and together with the Data API's own pool the dashboard showed **41 of 60** connections at one point with 0 active queries.
- **Session mode does not queue beyond the pool size; it refuses.** Prisma's default pool is larger than the pool size of 15, so 5 of 20 queries failed. Transaction mode queued instead.
- **The docs say the pool size is shared between ports 5432 and 6543.** In my runs I saw 30 backends with a pool size of 15 (15 left from session mode while transaction mode opened 15 more). I do not know why; I report what I saw.
- **postgres.js 4.0.0 on the transaction pooler hangs when two queries are queued on one connection** (it pipelines them). `scripts/node/postgresjs-pipelining.mjs` reproduces it with two `select 1`; one at a time works. `max_pipeline: 1` fixed my 20-query run. I did not test `prepare` and `max_pipeline` separately for the final run.
- The 16 for Prisma and Django on the transaction pooler is one above the pool size; I do not know where the extra one comes from.

## Cost
- **$0.** Everything ran on a Free project. The dashboard says compute and the shared pooler are part of the free plan. Docs (2026-11-02): paid compute starts at Micro, about $10 a month, and Micro has the same 60 / 200 limits as Nano.
- The tests are short (a few seconds each), one run per mode, and I stopped at the first errors. The shared pooler (Supavisor) is multi-tenant, so I kept the load small.

## Security notes
- `sql/probe-setup.sql` creates a login role and a function that reads `pg_stat_activity` and is callable with the publishable key. That is **demo only**: run `sql/probe-cleanup.sql` afterwards.
- The scripts use `ssl: { rejectUnauthorized: false }` / `sslmode=require` for convenience, which does not verify the server certificate. For real use download the project's CA certificate and verify.
- Passwords and keys only go into environment variables. Never put a service_role key anywhere here.

## Not verified
- **Rails** and an **Edge Function with postgres.js**: not run.
- Compute sizes above Nano, the dedicated pooler (PgBouncer), and the paid IPv4 add-on / direct connections (my network is IPv4-only).
- The 200-client limit and the 60-connection `max_connections`: I did **not** push to them (rule: only slightly over a limit, for seconds, on a shared pooler). The numbers in the calculator for them come from the docs.
- Other drivers/versions: pg 8.23.1, postgres 4.0.0, supabase-js 2.118.0, drizzle-orm 0.45.4, Prisma 6.19.3, SQLAlchemy 2.0.55 with psycopg 3.2.13, Django 4.2.30.

## Cleanup
Run `sql/probe-cleanup.sql`, delete the environment variables, and stop any local server.

## License
MIT, see `LICENSE`.
