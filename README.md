# connection-budget-demo

[English](README.md) | [日本語](README.ja.md)

**This is a personal learning record, unofficial.** I am a fellow builder who tried this myself; this is not official guidance and not an authority.

How many database connections does my app really use, and **why**? This repo has the lab I used to find out: scripts (Node.js, Python, Prisma 6 and 7) that run against a **local Supabase stack set to Nano-like limits**, a few tiny checks for a hosted Free project, and a small static **connection budget calculator** page that puts the numbers into one equation.

Run and checked: **2026-11-03**, on one laptop with the Supabase CLI 2.117 (Docker). Almost everything ran locally. The hosted pooler was checked only at pool size 3 with a handful of clients (script `24`); see "Not verified".

## The budget equation I ended up with

```
backends in use  =  direct connections
                  + sum over every (role, database, mode) pool of  min(clients of that pool, pool size)
                      (a transaction-mode pool held pool size + 1 in my runs)
                  + the Data API's own pool (10, plus one LISTEN connection = 11)
                  + other Supabase services (Auth, Storage, Realtime, the dashboard)
must stay under  max_connections - superuser_reserved_connections     (Nano / Micro: 60 - 3 = 57)

clients your app opens  =  running copies of the app  x  that library's pool size
must stay under the pooler's client cap  (Nano / Micro: 200; per role in my lab)

busy backends  =  queries per second  x  seconds per query      (Little's law)
```

Rule of thumb from the Supabase docs (Connection management): keep the pool size under about 40% of `max_connections` if you use the Data API heavily, up to about 80% if you do not. Read it as a budget for all pools together, not for one.

## Files

| Path | What it is |
|---|---|
| `lab/config.example.toml` | `[db.settings]` and `[db.pooler]` to mirror a Free/Nano project locally (and the sizing reasoning) |
| `lab/setup.sql`, `setup-services.sql`, `setup-leak.sql` | Test roles `r1`..`r4`, `slow(s)`, `ping()`; a Storage bucket for the probe; the RLS leak demo objects (local lab only) |
| `scripts/node/` | `lib.mjs` plus numbered tests 01-24 (table below) |
| `scripts/python/` | psycopg 3 auto-prepare, SQLAlchemy, Django, library waits |
| `scripts/prisma6/`, `scripts/prisma7/` | The Prisma tests (separate `package.json` each) |
| `results/RESULTS.md` | Every number I measured, with the script that produced it |
| `results/upstream-issue-drafts.md` | Draft issue texts for two behaviours. **Not filed.** |
| `app/` | The calculator (plain HTML/JS, no build, no network calls, no keys): `index.html`, `calc.js`, `board.js`, `i18n/en.js` |
| `app/test-calc.js` | Tests of the calculator's logic: `npm test` |

## Run the lab

```
supabase init                      # in an empty scratch folder
# add lab/config.example.toml to supabase/config.toml, then:
supabase start -x edge-runtime,logflare,vector,imgproxy,mailpit
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f lab/setup.sql
```

`max_connections` goes under `[db.settings]`. If you ever ran `alter system set max_connections`, run `alter system reset max_connections` first (`postgresql.auto.conf` overrides the config) and restart.

If your machine already runs another local Supabase project, change the ports in the config and pass them to the scripts: `LAB_DB_PORT`, `LAB_POOLER_PORT`, `LAB_API_PORT` (defaults 54322, 54329, 54321), also `LAB_HOST`, `LAB_TENANT` (default `pooler-dev`), `LAB_PASSWORD` (the CLI's local development password; never use it for a real database), `LAB_PUBLISHABLE_KEY` (the local stack's **publishable** key, for scripts 16 and 23; never a secret or service_role key).

Optional extras:
- **Session mode port.** The pooler container serves session mode on its port 5432 too (`PROXY_PORT_SESSION=5432`). Expose it with a forwarder and set `LAB_SESSION_PORT`:
  `docker run -d --rm --name lab_session_port -p 54430:5432 --network supabase_network_<project_id> alpine/socat tcp-listen:5432,fork,reuseaddr tcp-connect:supabase_pooler_<project_id>:5432`
- **PgBouncer** (script 17, `LAB_PGBOUNCER_PORT`): `docker run -d --name lab_pgbouncer --network supabase_network_<project_id> -p 54431:5432 -e DB_HOST=supabase_db_<project_id> -e DB_USER=r1 -e DB_PASSWORD="$LAB_PASSWORD" -e POOL_MODE=transaction -e AUTH_TYPE=scram-sha-256 -e DEFAULT_POOL_SIZE=15 -e MAX_CLIENT_CONN=200 edoburu/pgbouncer:latest`

```
npm install                                # pg 8.23.1, postgres 4.0.0
node scripts/node/01-postgresjs-hang.mjs pooler '{"max_pipeline":1}'
node scripts/node/03-roles-and-pools.mjs 3 6 probe      # 3 roles, queries hold 6 s, probe the full database
python3 -m venv venv && ./venv/bin/pip install "psycopg[binary,pool]" sqlalchemy "django>=5.2,<5.3"
./venv/bin/python scripts/python/01-psycopg-prepare.py
cd scripts/prisma6 && npm install && npx prisma generate && node run.cjs "<pooler url with ?pgbouncer=true>"
```

Between tests that count backends, restart the pooler container (idle backends linger for about 2 minutes). Tests 03, 07, 13 and 22 leave state behind (leaked settings, advisory locks, held connections): restart before the next one. Script 08 needs `max_connections` above 90 (I used `alter system set max_connections=150`, a restart, and `alter system reset` afterwards). Script 18 `monitor` needs `alter system set reserved_connections = 3` and a restart (reset afterwards).

The local pooler runs **one mode at a time** (set `pool_mode`, restart); the forwarder above reaches the other port of the same container, which is how test 13 runs both at once.

| Script | What it tests |
|---|---|
| `01-postgresjs-hang` | postgres.js, 20 concurrent queries; `prepare` vs `max_pipeline` |
| `02-client-limit` | client 200 and 201 on the pooler |
| `03-roles-and-pools` | N roles x 20 clients: backends per role; `probe` = what fails when full |
| `04-queue-timeout` | clients holding queries: the 60 s checkout timeout; `LAB_MODE=session` |
| `05-idle-in-transaction` | `BEGIN` and stall, `idle_in_transaction_session_timeout` |
| `06-data-api-pool` | concurrent RPCs through PostgREST: 10 s `PGRST003` |
| `07-state-leak`, `07b-...` | `SET`, `set_config`, advisory locks, prepared statements, LISTEN through the pooler |
| `08-instances` | processes x pool size = direct backends |
| `09-latency` | closed loop: qps, p50, p95 vs clients |
| `10-pool-error` | killed idle connections, `error` handler |
| `11-linger` | how long idle pooler backends stay |
| `12-backend-detail` | what the backends of a pool and PostgREST really are (`pg_stat_activity`) |
| `13-two-modes` | one role on the transaction and session port at once |
| `14-client-cap-scope` | is the 200 client cap per role? |
| `15-postgresjs-repeat` | postgres.js with the same query repeated per connection |
| `16-full-database-services` | Auth sign-in, Storage, Data API while the database is full, and recovery time |
| `17-pgbouncer-compare` | the same checks against PgBouncer |
| `18-guardrails` | `limit` (role connection limit), `timeouts`, `monitor` (`pg_use_reserved_connections`) |
| `19-library-waits` | node-postgres waits (the other libraries: Python scripts 04, 05 and Prisma 6 `pool-timeout.cjs`) |
| `20-timeout-prediction` | 199 clients: waits vs the 60 s limit |
| `21-open-loop` | fixed arrival rate with a connection per request |
| `22-leak-rls`, `23-data-api-no-leak` | a leaked setting becomes a leaked row; the Data API contrast |
| `24-hosted-tiny` | **hosted Free project only**, pool size 3, a handful of clients (see below) |

## Hosted check (script 24)
Only on a throwaway **Free** project, and only after setting the pooler **pool size to 3** in Database settings. Create a test login role with a password you generate yourself, and two small functions (`probe_sleep(numeric)` and a connection-counting function granted to the publishable key) in the SQL Editor, run `node scripts/node/24-hosted-tiny.mjs modes`, `... postgresjs '<options json>'` (one variant per call) and `... checkout` (about 70 s with 5 clients), then drop the role and functions and put the pool size back (15 on Nano). Variables: `PROJECT_REF`, `POOLER_HOST`, `PROBE_PASSWORD`, `PUBLISHABLE_KEY`. The script uses `ssl: { rejectUnauthorized: false }` for convenience, which does not verify the certificate.

## What I found (details in `results/RESULTS.md`)

- **Each (role, database, mode) has its own pool.** One role on both ports held 16 + 15 = 31 backends; on a hosted pooler at pool size 3: 4 + 3. The docs have said both "shared between the two ports" and "per user, database and mode"; the dashboard says per user+db.
- **Transaction mode held pool size + 1** (16 for 15, hosted 4 for 3). Session mode held exactly the pool size, PgBouncer 1.26.1 exactly 15. I can't explain the extra one.
- **Roles multiply:** 2 roles = 16 + 16, 3 roles filled the lab (87 of 87).
- **The client cap of 200 was per role** in my lab (300 clients over 2 roles all connected). Not tested on hosted.
- **When the database is full,** what needs a new connection fails first: direct connections (53300), pooler logins (`EAUTHQUERY`), **Auth sign-in (500)**. The Data API and Storage kept working while their open connections were enough. After the heavy clients stopped, sign-in recovered at about 62 s.
- **Waiting:** transaction mode queues and gives up after **60 s** (`ECHECKOUTTIMEOUT`; hosted too); session mode refused extra clients at once (`EMAXCONNSESSION`) although the FAQ says it can queue. A prediction, `(clients - backends) / backends x query time`, matched: 199 clients, 4.5 s queries no errors, 5.5 s queries 46 timeouts.
- **Open loop:** at 200 arrivals/s against about 150/s of capacity, latency rose from 0.23 s to 1.26 s in 4 s, then about a quarter of arrivals got `EMAXCONN`.
- **The Data API has its own pool** (10 + a `LISTEN "pgrst"` connection). 50 concurrent 2.5 s calls: 40 ok, 10 failed after exactly 10 s with `504 PGRST003`. `anon` has `statement_timeout=3s`.
- **postgres.js 4.0.0 hang on the transaction pooler = pipelining**, not prepared statements (lab and hosted): `prepare:false` alone still hangs, `max_pipeline:1` alone fixes it, also with the same query repeated 3000 times. PgBouncer 1.26.1 did not hang.
- **Prepared statements break on Supavisor's transaction mode** for Prisma 6 without `?pgbouncer=true` and for psycopg 3 after 5 runs (fix: `prepare_threshold=None`). Prisma 7 with the pg adapter, node-postgres and postgres.js (with `max_pipeline: 1`) did not.
- **Session state leaks between clients in transaction mode** (also through PgBouncer): `set_config(..., false)` 8 of 8, `SET statement_timeout = 0` silently removed the guardrail, and through an RLS policy a leaked setting showed Alice's row to a request that forgot to set the user; `SET ROLE r_admin` leaked a privilege. `set_config(..., true)` did not leak. The Data API did not leak (0 of 40 mixed requests).
- **Library defaults and waits:** Prisma 6 = cores x 2 + 1 (21 on 10 cores), Prisma 7 + pg = 10, SQLAlchemy 5 + 10, psycopg_pool 4, Django 5.2 `pool=True` = 4; waits: pg none, Prisma 6 10 s, psycopg_pool and SQLAlchemy 30 s.
- **Guardrails:** a role `connection limit` stops one role and refuses at once; a role `statement_timeout` can be removed by the client; `reserved_connections` + `pg_use_reserved_connections` lets a monitoring role in when full (lab).
- **Latency, not just peaks:** throughput capped near 16 / query time; past the cap extra clients only add waiting. Little's law predicted the cap.
- **Failure:** a node-postgres pool without an `error` handler crashes the process when the database kills an idle connection; SQLAlchemy needs `pool_pre_ping`.
- **Pool lingering:** about 2 minutes locally after clients closed.

## Cost
- **$0.** The lab runs on your own machine (Docker); the hosted check used a Free project. Hosted numbers from the Supabase docs (2026-11-03): Nano is free; on a paid plan the smallest compute is Micro at about $10 a month, with the same limits as Nano (60 direct connections, 200 pooler clients, pool size 15). Small is about $15 (90 / 400), Medium about $60 (120 / 600), Large about $111 (160 / 800), XL about $210 (240 / 1000). The Pro plan is $25 a month and includes $10 of compute credit per organization, which covers one Micro project. Upgrading the plan alone buys no connection headroom; only a bigger compute size does. Compute is billed by the hour and is not covered by the Spend Cap.

## Security notes
- The lab uses the CLI's local development password and keys. Do not point these scripts at a real database with real data. The setup SQL creates login roles with a trivial password: local only.
- The Data API function `slow()` is callable by `anon`. A slow function exposed like this lets outsiders hold the Data API's pool; do not expose one on a real project.
- The scripts need only a **publishable** key. Never put a secret or service_role key anywhere here.

## Not verified
- **Hosted beyond pool size 3:** the client-connection chart, the client cap per role on hosted, the hosted `max_connections` split between Supabase services and your connections (I used a first-run estimate of about 16 at idle), hosted PostgREST pool settings, `reserved_connections` on hosted, Studio at saturation, any hosted load near the real limits.
- **Not a hosted dedicated pooler:** the PgBouncer here is a container with its image defaults.
- **Supavisor settings:** the CLI tenant sets no prepared-statement switch and I found none; hosted tenant settings are unknown. Newer Supavisor versions may behave differently.
- Rails, Edge Functions with postgres.js, Npgsql, pgx, HikariCP; compute sizes above Nano (numbers from the docs); latency across regions; platform request limits.
- Each experiment ran a few times at most; the latency table is one 6-second run per cell.
- Versions: pg 8.23.1, postgres 4.0.0, Prisma 6.19.3 and 7.10.1, psycopg 3.3.6 (psycopg_pool 3.3.3), SQLAlchemy 2.1.6, Django 5.2.18, Node 24, Python 3.14, Supabase CLI 2.117.0, Supavisor 2.9.12, PostgREST 16.2, PostgreSQL 17, PgBouncer 1.26.1.

## Cleanup
`supabase stop` in the scratch folder and delete it; remove the `alpine/socat` and PgBouncer containers. On the hosted project: drop the test role and functions and restore the pool size.

## License
MIT, see `LICENSE`.
