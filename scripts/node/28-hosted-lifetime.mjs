// How long does a pooled backend stay after the client goes away, on a HOSTED project?
// The Supavisor FAQ makes three claims this checks:
//   1. transaction mode closes a backend unused for 5 minutes
//   2. at least 1 "hot" connection is sustained while any client is connected
//   3. session mode closes the backend immediately when the client disconnects
//
// Tiny and read-mostly: at most 6 clients, one short query each, then it just counts.
// Needs: PROJECT_REF, POOLER_HOST (Connect dialog), PROBE_PASSWORD (a test login role you created).
// The test role needs `grant pg_monitor to <role>` so it can see other sessions in pg_stat_activity,
// and `probe_sleep(double precision)` from sql/ for the lifetime run. Drop the role when you are done.
//
// Usage: node 28-hosted-lifetime.mjs <lifetime|hot|session> [clients] [minutes]
import pg from 'pg'

const { PROJECT_REF: REF, POOLER_HOST: HOST, PROBE_PASSWORD: PW } = process.env
if (!REF || !HOST || !PW) throw new Error('set PROJECT_REF, POOLER_HOST, PROBE_PASSWORD')
const ssl = { rejectUnauthorized: false } // convenience only: it does not verify the certificate
const url = (port) => `postgresql://conn_probe.${REF}:${encodeURIComponent(PW)}@${HOST}:${port}/postgres`
const TX = () => ({ connectionString: url(6543), ssl, connectionTimeoutMillis: 15000 })
const SESSION = () => ({ connectionString: url(5432), ssl, connectionTimeoutMillis: 15000 })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const clock = () => new Date().toTimeString().slice(0, 8)

// One stable census connection over session mode, excluded from its own counts.
const census = new pg.Client(SESSION())
await census.connect()
const selfPid = (await census.query('select pg_backend_pid() as p')).rows[0].p
const probePids = async () =>
  (await census.query(`select pid from pg_stat_activity where usename = 'conn_probe' and pid <> $1 order by pid`, [selfPid])).rows.map((r) => r.pid)
const byRole = async () =>
  Object.fromEntries((await census.query(
    `select usename, count(*)::int as n from pg_stat_activity
     where backend_type = 'client backend' and pid <> $1 group by 1 order by 1`, [selfPid])).rows.map((r) => [r.usename, r.n]))

const cmd = process.argv[2] || 'lifetime'

if (cmd === 'lifetime') {
  const n = +process.argv[3] || 6
  const minutes = +process.argv[4] || 8
  const clients = Array.from({ length: n }, () => new pg.Client(TX()))
  await Promise.all(clients.map((c) => c.connect()))
  // concurrent sleeps force the pooler to open n distinct backends
  await Promise.all(clients.map((c) => c.query('select public.probe_sleep(2)')))
  console.log(JSON.stringify({ step: 'loaded', at: clock(), byRole: await byRole() }))
  await Promise.all(clients.map((c) => c.end().catch(() => {})))
  const t0 = Date.now()
  console.log(JSON.stringify({ step: 'all_clients_disconnected', at: clock() }))
  for (let i = 0; i <= minutes * 4; i++) {
    const pids = await probePids()
    console.log(JSON.stringify({ sec: Math.round((Date.now() - t0) / 1000), at: clock(), backends: pids.length }))
    if (pids.length === 0 && i > 2) break
    await sleep(15000)
  }
}

if (cmd === 'hot') {
  // One idle transaction-mode client: does exactly one backend stay alive past the close time?
  const minutes = +process.argv[3] || 5
  const c1 = new pg.Client(TX())
  await c1.connect()
  await c1.query('select 1')
  const t0 = Date.now()
  for (let i = 0; i <= minutes * 4; i++) {
    console.log(JSON.stringify({ sec: Math.round((Date.now() - t0) / 1000), at: clock(), backends: (await probePids()).length, note: 'one idle client still connected' }))
    await sleep(15000)
  }
  await c1.end().catch(() => {})
}

if (cmd === 'session') {
  // Session mode: is the backend really closed "immediately" on disconnect?
  const c1 = new pg.Client(SESSION())
  await c1.connect()
  await c1.query('select 1')
  console.log(JSON.stringify({ step: 'connected_session_mode', backends: (await probePids()).length }))
  const t0 = Date.now()
  await c1.end()
  let previous = -1
  for (let i = 0; i < 60; i++) {
    const pids = await probePids()
    if (pids.length !== previous) {
      console.log(JSON.stringify({ afterDisconnect_s: +((Date.now() - t0) / 1000).toFixed(1), backends: pids.length }))
      previous = pids.length
    }
    if (pids.length === 0) break
    await sleep(i < 5 ? 2000 : 10000)
  }
}

await census.end().catch(() => {})
process.exit(0)
