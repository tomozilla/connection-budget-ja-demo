// "Should I just raise the pool size?" It depends on what the backends are doing.
// Two queries that both take about 100 ms, for opposite reasons:
//   wait = pg_sleep(0.1)                  -> the backend is idle, waiting; more backends = more work done
//   cpu  = count(*) over 2,000,000 rows   -> the backend is on CPU; more backends just split the same CPU
// Closed loop: each client sends the next query as soon as the previous one returns.
// Run it once at your current pool size, raise the pool size, run it again, compare.
//
// usage: node 30-pool-help.mjs <wait|cpu> [clients] [seconds]
import pg from 'pg'
import { POOL, admin } from './lib.mjs'

const kind = process.argv[2] === 'cpu' ? 'cpu' : 'wait'
const clients = +process.argv[3] || 60
const secs = +process.argv[4] || 8
const ROLE = process.env.LAB_ROLE || 'r1'

const pool = new pg.Pool({ connectionString: POOL(ROLE), max: clients })
pool.on('error', () => {})
const SQL = kind === 'cpu' ? 'select count(*) from generate_series(1,2000000)' : 'select public.slow(0.1)'

const lat = []
let stop = false, errors = 0
const started = Date.now()
const worker = async () => {
  while (!stop) {
    const t = Date.now()
    try { await pool.query(SQL); lat.push(Date.now() - t) } catch { errors++ }
  }
}
const runners = Array.from({ length: clients }, worker)
setTimeout(() => { stop = true }, secs * 1000)
await Promise.all(runners)

const elapsed = (Date.now() - started) / 1000
lat.sort((a, b) => a - b)
const pct = (p) => (lat.length ? lat[Math.floor(lat.length * p)] : null)
const b = await admin(`select count(*)::int n from pg_stat_activity where usename=$1 and backend_type='client backend'`, [ROLE])

console.log(JSON.stringify({
  kind, clients, seconds: +elapsed.toFixed(1),
  completed: lat.length, throughputPerSec: Math.round(lat.length / elapsed),
  p50: pct(0.5), p95: pct(0.95), errors, backendsAtEnd: b.rows[0].n,
}))
await pool.end()
process.exit(0)
