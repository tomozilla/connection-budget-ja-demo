// Same checks as 01/07/15 against a PgBouncer in transaction mode (the "dedicated pooler" software) in front of the same database.
// Usage: LAB_PGBOUNCER_PORT=<port> node 17-pgbouncer-compare.mjs     (user r1; see README for the container command)
import pg from 'pg'
import postgres from 'postgres'
import { PGBOUNCER, admin, sleep } from './lib.mjs'
const url = PGBOUNCER('r1')
const cl = async () => { const c = new pg.Client({ connectionString: url }); c.on('error', () => {}); await c.connect(); return c }
{ const c = await cl(); const r = await c.query("select name, setting from pg_settings where false"); await c.end() }
console.log('== postgres.js, 20 concurrent queries, then 200 repeated queries')
for (const o of [{}, { prepare: false }, { max_pipeline: 1 }, { prepare: false, max_pipeline: 1 }]) {
  const sql = postgres(url, { max: 10, idle_timeout: 2, ...o }); const t = Date.now(); let res = 'ok'
  const kill = setTimeout(() => { console.log(JSON.stringify({ o, result: 'HANG >20s' })); process.exit(0) }, 20000)
  try { await Promise.all(Array.from({ length: 20 }, () => sql`select 1 as x from pg_sleep(0.5)`)); await Promise.all(Array.from({ length: 200 }, (_, i) => sql`select ${i}::int as v`)) } catch (e) { res = 'error: ' + String(e.message).slice(0, 80) }
  clearTimeout(kill); console.log(JSON.stringify({ options: o, result: res, ms: Date.now() - t })); await sql.end({ timeout: 1 })
}
console.log('== state and prepared statements, clients one after another (same role)')
let leaks = 0; const seen = []
for (let i = 0; i < 8; i++) { const a = await cl(); await a.query('set search_path to pg_catalog'); await a.query("select set_config('app.user','alice',false)"); await a.end(); const b = await cl(); const r = (await b.query("select current_setting('search_path') sp, current_setting('app.user',true) u")).rows[0]; seen.push(r.sp + '|' + (r.u || '')); if (r.sp === 'pg_catalog' || r.u === 'alice') leaks++; await b.end() }
console.log(`SET / set_config(false) leaked into the next client: ${leaks} of 8 ->`, JSON.stringify([...new Set(seen)]))
const out = []
for (let i = 0; i < 6; i++) { const c = await cl(); try { await c.query({ name: 'q1', text: 'select $1::int as v', values: [i] }); out.push('ok') } catch (e) { out.push(e.message.slice(0, 60)) } await c.end() }
console.log('named prepared statement q1, 6 clients in a row:', JSON.stringify([...new Set(out)]))
const l = await cl(); try { await l.query('listen ch1'); const n = await new Promise((res) => { const t = setTimeout(() => res('no notification'), 2500); l.on('notification', (m) => { clearTimeout(t); res('got ' + m.payload) }); admin("notify ch1,'hello'") }); console.log('LISTEN/NOTIFY:', n) } catch (e) { console.log('LISTEN error', e.message) } await l.end()
