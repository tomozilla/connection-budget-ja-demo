# Draft issue texts (NOT filed)

Texts ready to post upstream. At the time of writing nothing had been posted. The behaviour was seen in a local Supabase CLI stack (Supavisor 2.9.12) and also on hosted projects where noted.

Last reviewed against the docs on **2026-11-04**. The docs were rewritten in late October 2026, and that closed two of the items that used to be here — see "Resolved by the docs" at the end.

## 1. Supavisor: transaction mode opens pool_size + 1 backend connections

- Setup: pool size 15 (hosted: 3), one role, transaction mode, more clients than the pool.
- Observed: 16 backends for pool size 15 (one role, 20 clients each holding a query), and 16 clients run at the same time while the 17th waits. Session mode on the same pool opens exactly 15. On a hosted project with pool size 3: 4 backends on the transaction port and 3 on the session port. PgBouncer 1.26.1 with default_pool_size 15 in front of the same database opened exactly 15.
- Docs say database connections follow the configured pool size. The extra one matters when the budget is tight (3 roles x 16 = 48 instead of 45).
- Possibly related, from the Supavisor FAQ: "If a client is connected to the pooler, then at least 1 hot connection will be sustained, even if no client needs it." On a hosted Pro project, one idle transaction-mode client did keep exactly 1 backend alive, still present at 137 s — past the roughly 2 minutes at which unused backends are closed. Whether that is the same mechanism as the +1 is unclear.
- Reproduce: `scripts/node/03-roles-and-pools.mjs 1 6` (lab), `scripts/node/24-hosted-tiny.mjs modes` (hosted, pool size 3), `scripts/node/28-hosted-lifetime.mjs hot` (hosted).
- Question: is the extra connection intended (a reserved, auth or hot connection counted outside the pool), and should the docs say pool size + 1?

## 2. Supavisor FAQ: the documented backend lifetimes do not match what I measured

- The FAQ says: transaction-mode connections unused for **5 minutes** are closed; **"In session mode, the connection will be immediately closed"**; at least 1 hot connection is sustained while a client is connected.
- Measured on a hosted Pro/Micro project (2026-11-04) and in the lab:
  - Transaction mode: 6 backends were still there at 106 s and gone at 122 s, i.e. about **2 minutes**, not 5. The lab agreed (present at 105 s, gone at 120 s, two runs).
  - Session mode: after the only client disconnected, its backend stayed for **over 3 minutes** and was **reused** by a later client, disappearing around 4 to 5 minutes idle. Not "immediately".
  - The hot-connection claim held.
- Reproduce: `scripts/node/28-hosted-lifetime.mjs lifetime|session|hot`.
- Question: is the 5-minute figure a maximum rather than the actual idle timeout, and is the session-mode sentence still accurate? Both matter for sizing, because readers subtract these from their connection budget.

## 3. Docs: three different granularities for "pool size"

- Connection management: "This pool size applies per database user (role)".
- Supavisor FAQ: "per unique user, database, and mode combination".
- Dashboard (Database settings): "per user+db combination".
- My measurements say mode counts: one role on both ports held 16 + 15 = 31 backends in the lab, and 4 + 3 on a hosted project at pool size 3.
- Suggestion: use one phrasing (user + database + mode) in all three places, since the narrower readings under-count the budget.

## 4. Docs: is Storage routed through Supavisor?

- The Supavisor FAQ says "the Storage server also uses Supavisor as a unique 'user+db+mode' combination, so the pool size you set for your general application will apply to it, too."
- On a hosted Pro/Micro project (2026-11-04), after 40 concurrent public-object requests, `supabase_storage_admin` held 8 connections whose `application_name` was `Supabase Storage API`, not `Supavisor` (pooler-routed connections in the same snapshot showed `Supavisor`). They looked like direct connections with a pool of their own.
- This is one project and one observation, so it may be configuration-specific rather than a docs error.
- Question: does Storage go through the pooler on all projects, and if so, does the pool size really apply to it?

## Resolved by the docs (kept for the record, no longer worth filing)

- **postgres.js hanging on the transaction pooler.** This was item 2 in an earlier version of this file. The Connecting to Postgres page now states it outright: "Query pipelining isn't supported... `postgres.js` pipelines queries by default, so this combination can hang queries or return mismatched rows." Nothing left to report.
  - One open question remains, but it belongs upstream in postgres.js rather than here: the docs say `max_pipeline: 0` breaks `sql.begin()`. On 4.0.0 (published 2026-10-29, the same day the matching upstream issues were closed as completed) `max_pipeline: 0` through the pooler instead failed with `42P05 prepared statement already exists`, and worked with `prepare: false` at over 100x the latency. `max_pipeline: 1` worked and did not break `sql.begin()`. Reproduce: `scripts/node/26-begin-pipeline.mjs`.
- **"Pool size is shared between ports 5432 and 6543".** That sentence is gone; the current docs say the pool size is per role and is applied independently by each pooler. This matches what I measured.
