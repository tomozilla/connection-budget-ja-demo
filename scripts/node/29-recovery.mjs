// "The database says there are no connections left." What actually gets you back in?
// LOCAL LAB ONLY: this fills max_connections on purpose. Never point it at a hosted project.
//
// usage: node 29-recovery.mjs <getin|terminate|idletx> [role] [n]
//   getin     fill the database, then see which roles can still connect
//   terminate fill it, then pg_terminate_backend the offending role's idle backends and time the recovery
//   idletx    leave a transaction open, then fix it with idle_in_transaction_session_timeout
import pg from 'pg'
import { DIRECT, admin, sleep } from './lib.mjs'

const cmd = process.argv[2] || 'getin'
const role = process.argv[3] || 'r1'
const n = +process.argv[4] || 90

const backends = async () => (await admin(
  `select coalesce(usename,'(bg)') u, state, count(*)::int n from pg_stat_activity
   where backend_type='client backend' and pid <> pg_backend_pid() group by 1,2 order by 1,2`)).rows

// Idle connections, no queries: the cheapest way to use up max_connections.
async function fill(r, count) {
  const open = []
  let refused = 0, firstError = null
  for (let i = 0; i < count; i++) {
    const c = new pg.Client({ connectionString: DIRECT(r), connectionTimeoutMillis: 8000 })
    c.on('error', () => {})
    try { await c.connect(); open.push(c) } catch (e) { refused++; firstError = firstError || String(e.message).slice(0, 110) }
  }
  return { open, refused, firstError }
}

const tryConnect = async (r) => {
  const c = new pg.Client({ connectionString: DIRECT(r), connectionTimeoutMillis: 8000 })
  c.on('error', () => {})
  const t = Date.now()
  try { await c.connect(); await c.query('select 1'); await c.end(); return { role: r, ok: true, ms: Date.now() - t } }
  catch (e) { return { role: r, ok: false, ms: Date.now() - t, msg: String(e.message).slice(0, 110) } }
}

if (cmd === 'getin') {
  console.log(JSON.stringify({ step: 'before', backends: await backends() }))
  const { open, refused, firstError } = await fill(role, n)
  console.log(JSON.stringify({ step: 'filled', held: open.length, refused, firstError }))
  // supabase_admin has the reserved superuser slots; postgres does NOT on Supabase.
  for (const r of [role, 'r2', 'postgres', 'supabase_admin']) console.log(JSON.stringify(await tryConnect(r)))
  await Promise.all(open.map((c) => c.end().catch(() => {})))
  console.log(JSON.stringify({ step: 'released' }))
}

if (cmd === 'terminate') {
  const { open, refused } = await fill(role, n)
  console.log(JSON.stringify({ step: 'filled', held: open.length, refused }))
  console.log(JSON.stringify({ step: 'a normal connection while full', ...(await tryConnect('r2')) }))
  // In a real incident add an age filter so you do not kill connections that just started:
  //   and now() - state_change > interval '1 minute'
  const t = Date.now()
  const killed = await admin(
    `select count(pg_terminate_backend(pid))::int n from pg_stat_activity
     where backend_type='client backend' and usename=$1 and state='idle' and pid <> pg_backend_pid()`, [role])
  console.log(JSON.stringify({ step: 'terminated', n: killed.rows[0].n, ms: Date.now() - t }))
  console.log(JSON.stringify({ step: 'the same connection attempt, right after', ...(await tryConnect('r2')) }))
  await sleep(1000)
  console.log(JSON.stringify({ step: 'after', backends: await backends() }))
  await Promise.all(open.map((c) => c.end().catch(() => {})))
}

if (cmd === 'idletx') {
  const c = new pg.Client({ connectionString: DIRECT(role) })
  c.on('error', () => {})
  await c.connect(); await c.query('begin'); await c.query('select 1')
  await sleep(2000)
  const st = await admin(
    `select state, (now()-state_change)::interval(0) held from pg_stat_activity
     where usename=$1 and backend_type='client backend'`, [role])
  console.log(JSON.stringify({ step: 'a transaction left open', rows: st.rows }))

  await admin(`alter role ${role} set idle_in_transaction_session_timeout = '5s'`)
  const c2 = new pg.Client({ connectionString: DIRECT(role) })
  let killMsg = null
  c2.on('error', (e) => { killMsg = String(e.message).slice(0, 110) })
  await c2.connect(); await c2.query('begin'); await c2.query('select 1')
  const t = Date.now()
  for (let i = 0; i < 20 && !killMsg; i++) await sleep(1000)
  console.log(JSON.stringify({ step: 'with idle_in_transaction_session_timeout = 5s', killedAfter_s: +((Date.now() - t) / 1000).toFixed(1), msg: killMsg }))
  await admin(`alter role ${role} reset idle_in_transaction_session_timeout`)
  await c.end().catch(() => {}); await c2.end().catch(() => {})
}
process.exit(0)
