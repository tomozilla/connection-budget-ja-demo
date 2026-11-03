// Open loop: requests keep arriving at a fixed rate, each on its OWN new connection (serverless style), 100 ms queries.
// Capacity here is about 150 queries/s (16 backends / 0.1 s). Usage: node 21-open-loop.mjs <rate_per_s=200> <run_s=15>
import pg from 'pg'
import { POOL, sleep } from './lib.mjs'
const RATE = +process.argv[2] || 200, RUN = +process.argv[3] || 15
const t0 = Date.now(), buckets = {}; let inflight = 0, peak = 0
const b = (s) => (buckets[s] ||= { done: 0, lat: [], err: {} })
const one = async () => {
  const sec = Math.floor((Date.now() - t0) / 1000), t = Date.now(); inflight++; peak = Math.max(peak, inflight)
  const c = new pg.Client({ connectionString: POOL('r1'), connectionTimeoutMillis: 20000 }); c.on('error', () => {})
  try { await c.connect(); await c.query('select pg_sleep(0.1)'); b(sec).done++; b(sec).lat.push(Date.now() - t) }
  catch (e) { const k = e.message.slice(0, 50); b(sec).err[k] = (b(sec).err[k] || 0) + 1 }
  finally { inflight--; c.end().catch(() => {}) }
}
const tasks = []; const total = RATE * RUN
for (let i = 0; i < total; i++) { tasks.push(one()); const next = t0 + ((i + 1) * 1000) / RATE; const d = next - Date.now(); if (d > 1) await sleep(d) }
await Promise.all(tasks)
console.log(`rate ${RATE}/s for ${RUN}s; peak in-flight ${peak}`)
for (const s of Object.keys(buckets).sort((a, c) => a - c)) { const x = buckets[s].lat.sort((a, c) => a - c); console.log(`sec ${s}: arrivals ok ${buckets[s].done}, p50 ${x.length ? x[Math.floor(x.length / 2)] : '-'} ms, max ${x.length ? x[x.length - 1] : '-'} ms, errors ${JSON.stringify(buckets[s].err)}`) }
