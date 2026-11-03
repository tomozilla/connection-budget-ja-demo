# connection-budget-demo

[English](README.md) | [日本語](README.ja.md)

**This is a personal learning record, unofficial.** I am a fellow builder who tried this myself; this is not official guidance and not an authority.

How many database connections does my app really use, and **why**? This repo has the lab I used to find out: scripts (Node.js, Python, Prisma 6 and 7) that run against a **local Supabase stack set to Nano-like limits**, plus a small static **connection budget calculator** page that puts the numbers into one equation.

Run and checked: **2026-11-03**, on one laptop with the Supabase CLI 2.117 (Docker). **Nothing here was run on a hosted project** in this version; see "Not verified".

## The budget equation I ended up with

```
backends in use  =  direct connections
                  + sum over every (role, database, mode) pool of  min(clients of that pool, pool size)
                  + the Data API's own pool (about 11 in my runs)
                  + other Supabase services (Auth, Storage, Realtime, the dashboard)
must stay under max_connections        (Nano / Micro: 60)

clients your app opens  =  running copies of the app  x  that library's pool size
must stay under the pooler's client cap  (Nano / Micro: 200)

busy backends  =  queries per second  x  seconds per query      (Little's law)
```

Rule of thumb from the Supabase docs (Connection management): keep the pool size under about 40% of `max_connections` if you use the Data API heavily, up to about 80% if you do not.

## Files

| Path | What it is |
|---|---|
| `lab/config.example.toml` | The `[db.pooler]` settings (and the `max_connections` step) to mirror a Free/Nano project locally |
| `lab/setup.sql` | Four test roles `r1`..`r4`, a `slow(s)` function and a `ping()` function (local lab only) |
| `scripts/node/` | `lib.mjs` plus numbered tests 01-11 (see `results/RESULTS.md`) |
| `scripts/python/` | psycopg 3 auto-prepare, SQLAlchemy 2, Django 5.2 |
| `scripts/prisma6/`, `scripts/prisma7/` | The Prisma tests (separate `package.json` each) |
| `results/RESULTS.md` | Every number I measured, with the script that produced it |
| `app/index.html`, `app/calc.js`, `app/board.js` | The calculator (plain HTML/JS, no build, no network calls, no keys) |
| `app/test-calc.js` | Tests of the calculator's logic: `npm test` |
| `ja/app/index.html` | Japanese page (uses the same `calc.js`) |

## Run the lab

```
supabase init                      # in an empty scratch folder
# add lab/config.example.toml to supabase/config.toml, then:
supabase start -x gotrue,realtime,storage-api,imgproxy,mailpit,studio,edge-runtime,logflare,vector,postgres-meta
docker exec supabase_db_<project_id> psql -U supabase_admin -d postgres -c "alter system set max_connections=60"
docker restart supabase_db_<project_id>        # then restart the pooler and rest containers too
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f lab/setup.sql
```

If your machine already runs another local Supabase project, change the ports in the config and pass them to the scripts: `LAB_DB_PORT`, `LAB_POOLER_PORT`, `LAB_API_PORT` (defaults 54322, 54329, 54321), also `LAB_HOST`, `LAB_TENANT` (default `pooler-dev`) and `LAB_PASSWORD` (the CLI's local development password; never use it for a real database).

```
npm install                                # pg 8.23.1, postgres 4.0.0
node scripts/node/01-postgresjs-hang.mjs pooler '{"max_pipeline":1}'
node scripts/node/03-roles-and-pools.mjs 2 6 probe       # 2 roles, queries hold 6 s, probe the full database
python3 -m venv venv && ./venv/bin/pip install "psycopg[binary,pool]" sqlalchemy "django>=5.2,<5.3"
./venv/bin/python scripts/python/01-psycopg-prepare.py
cd scripts/prisma6 && npm install && npx prisma generate && node run.cjs "<pooler url with ?pgbouncer=true>"
```

Between tests that count backends, restart the database and pooler containers for a clean state (idle backends linger for about 2 minutes). Tests 03 and 07 leave state behind (leaked `SET`, advisory locks, held connections): restart before the next one.

The local pooler runs **one mode at a time** (set `pool_mode` and restart). The Data API requests in the scripts carry no `apikey` header because the local stack accepted them; on a hosted project you must send the project's publishable key, and **never** a service_role key.

## What I found (2026-11-03, lab, details in `results/RESULTS.md`)

- **Each (role, database, mode) has its own pool.** Two roles with pool size 15 can hold 30 backends; on a 60-connection database with other users that is how "the database is full" happens. (The docs have said both "shared between the two ports" and "per user, database and mode".)
- **At the limit** (database full): new direct connections fail (53300), the Data API returns `503 PGRST000`, and a new login through the pooler fails with `EAUTHQUERY`.
- **Client cap:** client 200 connects, client 201 is refused at once (`EMAXCONN`).
- **Waiting:** transaction mode queues clients and gives up after **60 s** (`ECHECKOUTTIMEOUT`); session mode refused extra clients at once (`EMAXCONNSESSION`) although the FAQ says it can queue for up to a minute.
- **The Data API has its own pool** (10 + 1 backends). 50 concurrent 2.5 s calls: 40 ok, 10 failed after exactly 10 s with `504 PGRST003`. `anon` also has `statement_timeout=3s`.
- **postgres.js 4.0.0 hang on the transaction pooler = pipelining**, not prepared statements: `prepare:false` alone still hangs, `max_pipeline:1` alone fixes it.
- **Prepared statements break on the transaction pooler** for Prisma 6 without `?pgbouncer=true` and for psycopg 3 after 5 runs of a query (fix: `prepare_threshold=None`). Prisma 7 with the pg adapter and node-postgres did not.
- **Session state leaks between clients in transaction mode**: `SET` and `set_config(..., false)` leaked 8 of 8 times; use `set_config(..., true)` (transaction-local). Session advisory locks and LISTEN/NOTIFY do not behave either.
- **Library defaults multiply:** 5 processes x pg Pool 10 = 50 direct backends. Prisma 6 = cores x 2 + 1 (21 on 10 cores), Prisma 7 + pg = 10, SQLAlchemy 5 + 10, Django 5.2 no pool by default, `pool=True` = 4.
- **Latency, not just peaks:** throughput capped at about 16 / query time; past the cap extra clients only add waiting (1 s queries, 100 clients: p50 6 s). Little's law predicted the cap.
- **Failure:** a node-postgres pool without an `error` handler crashes the process when the database kills an idle connection; SQLAlchemy needs `pool_pre_ping`.
- **Pool lingering:** about 2 minutes locally after clients closed.
- **Unexplained:** one role with pool size 15 held **16** backends in transaction mode (15 in session mode).

## Cost
- **$0.** The lab runs on your own machine (Docker). Hosted numbers from the Supabase docs (2026-11-03): Nano is free; on a paid plan the smallest compute is Micro at about $10 a month, with the same limits as Nano (60 direct connections, 200 pooler clients, pool size 15). Small is about $15 (90 / 400), Medium about $60 (120 / 600), Large about $111 (160 / 800), XL about $210 (240 / 1000). The Pro plan is $25 a month and includes $10 of compute credit per organization, which covers one Micro project. Upgrading the plan alone buys no connection headroom; only a bigger compute size does.

## Security notes
- The lab uses the CLI's local development password and keys. Do not point these scripts at a real database with real data. `lab/setup.sql` creates login roles with a trivial password: local only.
- The Data API function `slow()` is callable by `anon`. Any slow function exposed like this lets outsiders hold the Data API's pool; do not expose one on a real project.
- Never put a service_role key anywhere here.

## Not verified
- **Not run on a hosted project** (no re-check of the shared pooler, the hosted `max_connections` split between Supabase services and your connections, or the hosted pool settings). The local pooler is the same open-source software (Supavisor 2.9.12 in my CLI) but may be configured differently.
- Counts of **client connections** to the pooler (the dashboard has a chart for it); only backends were counted.
- Rails, Edge Functions with postgres.js, Npgsql, pgx, HikariCP, and the dedicated pooler (PgBouncer).
- Compute sizes above Nano (their numbers are from the docs), latency across regions, restarts of the database during load.
- Each experiment ran a few times at most; the latency table is one 6-second run per cell.
- Versions: pg 8.23.1, postgres 4.0.0, Prisma 6.19.3 and 7.10.1, psycopg 3.3.6 (psycopg_pool 3.3.3), SQLAlchemy 2.1.6, Django 5.2.18, Node 24, Python 3.14, Supabase CLI 2.117.0, Supavisor 2.9.12, PostgREST 16.2.

## Cleanup
`supabase stop` in the scratch folder, and delete it.

## License
MIT, see `LICENSE`.
