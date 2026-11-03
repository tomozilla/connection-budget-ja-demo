// Is the pooler's client cap (200) per role or shared? Usage: node 14-client-cap-scope.mjs <clients_per_role> <roles>
// Opens N idle clients per role (transaction mode), counts refusals per role, then closes everything.
import pg from 'pg'
import { POOL, sleep } from './lib.mjs'
const N = +process.argv[2] || 150, R = +process.argv[3] || 2
const clients = [], refused = {}, ok = {}
for (let r = 1; r <= R; r++) {
  const role = 'r' + r; ok[role] = 0; refused[role] = {}
  for (let i = 0; i < N; i++) {
    const c = new pg.Client({ connectionString: POOL(role), connectionTimeoutMillis: 8000 }); c.on('error', () => {})
    try { await c.connect(); await c.query('select 1'); ok[role]++; clients.push(c) }
    catch (e) { const k = e.message.slice(0, 70); refused[role][k] = (refused[role][k] || 0) + 1 }
  }
}
console.log(`${R} roles x ${N} clients = ${R * N} requested`); console.log('connected per role', JSON.stringify(ok), '| total', Object.values(ok).reduce((a, b) => a + b, 0)); console.log('refused', JSON.stringify(refused))
for (const c of clients) await c.end().catch(() => {})
await sleep(500)
