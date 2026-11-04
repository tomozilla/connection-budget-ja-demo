// Does `sql.begin()` survive the transaction pooler, and does `max_pipeline` change the answer?
// The docs warn that `max_pipeline: 0` breaks `sql.begin()`. This checks 0 AND 1, and also looks for
// "mismatched rows": every statement sends a marker and must get that same marker back.
// Each transaction runs two queries and we check (a) both markers come back, (b) both ran on the SAME
// backend (pg_backend_pid), i.e. the transaction never moved to another connection mid-flight.
//
// Usage: node 26-begin-pipeline.mjs <pooler|direct> '<options json>' [transactions]
//   node 26-begin-pipeline.mjs pooler '{}'
//   node 26-begin-pipeline.mjs pooler '{"max_pipeline":1}'
//   node 26-begin-pipeline.mjs pooler '{"max_pipeline":0}'
//   node 26-begin-pipeline.mjs pooler '{"prepare":false,"max_pipeline":0}'
import postgres from 'postgres'
import { readFileSync } from 'node:fs'
import { POOL, DIRECT } from './lib.mjs'

// postgres.js 4.x does not export ./package.json, so read it from node_modules directly.
let version = 'unknown'
try { version = JSON.parse(readFileSync(new URL('../../node_modules/postgres/package.json', import.meta.url), 'utf8')).version } catch { /* reported as unknown */ }

const door = process.argv[2] === 'direct' ? 'direct' : 'pooler'
const options = JSON.parse(process.argv[3] || '{}')
const n = +process.argv[4] || 8

const sql = postgres(door === 'direct' ? DIRECT() : POOL(), { max: 5, idle_timeout: 2, onnotice: () => {}, ...options })
const out = { pgjs: version, door, options, transactions: n }
const started = Date.now()
const kill = setTimeout(() => { console.log(JSON.stringify({ ...out, result: 'HANG >25s' })); process.exit(0) }, 25000)

try {
  const res = await Promise.all(Array.from({ length: n }, (_, i) =>
    sql.begin(async (tx) => {
      const a = await tx`select ${i}::int as v, pg_backend_pid() as pid`
      const b = await tx`select ${i}::int as v, pg_backend_pid() as pid`
      return { i, v1: a[0].v, v2: b[0].v, pid1: a[0].pid, pid2: b[0].pid }
    })
  ))
  const wrongValue = res.filter((r) => r.v1 !== r.i || r.v2 !== r.i)
  const splitTx = res.filter((r) => r.pid1 !== r.pid2)
  console.log(JSON.stringify({
    ...out,
    result: 'ok',
    ms: Date.now() - started,
    wrongValue: wrongValue.length,
    splitTx: splitTx.length,
    distinctBackends: new Set(res.map((r) => r.pid1)).size,
    sample: wrongValue.slice(0, 3),
  }))
} catch (e) {
  console.log(JSON.stringify({ ...out, result: 'error', ms: Date.now() - started, code: e.code, msg: String(e.message).slice(0, 140) }))
}
clearTimeout(kill)
await sql.end({ timeout: 1 }).catch(() => {})
process.exit(0)
