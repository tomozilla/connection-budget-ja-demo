// What else stops when the database is full? Auth sign-in, Storage upload/list and the Data API, before / while full / after.
// Needs the FULL local stack (auth, storage, realtime, rest) and LAB_PUBLISHABLE_KEY (the local stack's publishable key; never a secret key).
// Usage: node 16-full-database-services.mjs [roles=3] [hold_s=30] [cold_rest=0|1]
import pg from 'pg'
import { execSync } from 'node:child_process'
import { POOL, BASE, snap, sleep } from './lib.mjs'
const KEY = process.env.LAB_PUBLISHABLE_KEY
if (!KEY) throw new Error('set LAB_PUBLISHABLE_KEY')
const R = +process.argv[2] || 3, HOLD = +process.argv[3] || 30, COLD = process.argv[4] === '1'
const H = { apikey: KEY, 'content-type': 'application/json' }
async function call(name, method, path, { token, body, raw, headers } = {}) {
  const t = Date.now(), ac = new AbortController(), to = setTimeout(() => ac.abort(), 12000)
  try {
    const r = await fetch(BASE + path, { method, headers: { ...H, ...(token ? { authorization: 'Bearer ' + token } : {}), ...headers }, body: raw ?? (body ? JSON.stringify(body) : undefined), signal: ac.signal })
    const text = await r.text(); let j = {}; try { j = JSON.parse(text) } catch {}
    return { name, status: r.status, ms: Date.now() - t, code: j.code || j.error_code || j.error || '', msg: String(j.message || j.msg || j.error_description || text).slice(0, 90), j }
  } catch (e) { return { name, status: 'abort/err', ms: Date.now() - t, code: '', msg: String(e.message).slice(0, 60), j: {} } } finally { clearTimeout(to) }
}
const email = 'alice@example.com', password = 'lab-only-password-1'
await call('signup', 'POST', '/auth/v1/signup', { body: { email, password } }) // idempotent enough: may say "already registered"
const probes = async (label, token) => {
  const out = []
  out.push(await call('Data API rpc/ping', 'POST', '/rest/v1/rpc/ping', { body: {} }))
  const si = await call('Auth sign-in', 'POST', '/auth/v1/token?grant_type=password', { body: { email, password } }); out.push(si)
  const tk = si.j.access_token || token
  out.push(await call('Auth sign-up (new user)', 'POST', '/auth/v1/signup', { body: { email: `u${Date.now()}@example.com`, password } }))
  if (tk) {
    out.push(await call('Storage upload', 'POST', `/storage/v1/object/lab/${label}-${Date.now()}.txt`, { token: tk, raw: 'hello', headers: { 'content-type': 'text/plain', 'x-upsert': 'true' } }))
    out.push(await call('Storage list', 'POST', '/storage/v1/object/list/lab', { token: tk, body: { prefix: '' } }))
  }
  console.log(`-- ${label}`); console.table(out.map(({ name, status, ms, code, msg }) => ({ name, status, ms, code, msg })))
  return tk
}
let tk = await probes('before (warm, not full)')
const s0 = await snap(); console.log('idle footprint by role:', JSON.stringify(s0.by), 'total', s0.total)
if (COLD) { console.log('restarting rest while the database is full: see below') }
const pools = []; const work = []
for (let i = 1; i <= R; i++) { const p = new pg.Pool({ connectionString: POOL('r' + i), max: 20 }); p.on('error', () => {}); pools.push(p); for (let k = 0; k < 20; k++) work.push(p.query('select public.slow($1)', [HOLD]).catch(() => {})) }
await sleep(5000)
const s1 = await snap(); console.log('while full: total', s1.total, JSON.stringify(s1.by))
if (COLD) { try { execSync('docker restart supabase_rest_lab', { stdio: 'ignore' }) } catch {} ; await sleep(8000) }
await probes(COLD ? 'while full, after restarting PostgREST' : 'while full', tk)
await Promise.all(work); await Promise.all(pools.map((p) => p.end()))
const tFree = Date.now()
await sleep(2000)
await probes('after (clients gone, pooler backends still lingering)', tk)
// how long until Auth sign-in works again?
for (let i = 0; i < 14; i++) {
  const r = await call('Auth sign-in', 'POST', '/auth/v1/token?grant_type=password', { body: { email, password } })
  const sn = await snap()
  console.log(`t+${Math.round((Date.now() - tFree) / 1000)}s after the clients finished: sign-in ${r.status}, backends ${sn.total}`)
  if (r.status === 200) break
  await sleep(15000)
}
