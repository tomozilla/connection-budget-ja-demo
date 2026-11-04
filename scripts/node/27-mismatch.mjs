// The docs say postgres.js on the transaction pooler "can hang queries or return mismatched rows".
// This chases the second one: plain (non-transaction) concurrent queries, each sending a unique marker
// that must come back unchanged. Two column shapes alternate so a swapped reply is obvious.
// A hang is reported as a hang, with how many queries finished before everything stopped.
//
// Usage: node 27-mismatch.mjs <pooler|direct> '<options json>' [queries] [connections]
//   node 27-mismatch.mjs pooler '{}' 300 10
//   node 27-mismatch.mjs pooler '{"max_pipeline":1}' 1000 20
import postgres from 'postgres'
import { readFileSync } from 'node:fs'
import { POOL, DIRECT } from './lib.mjs'

// postgres.js 4.x does not export ./package.json, so read it from node_modules directly.
let version = 'unknown'
try { version = JSON.parse(readFileSync(new URL('../../node_modules/postgres/package.json', import.meta.url), 'utf8')).version } catch { /* reported as unknown */ }

const door = process.argv[2] === 'direct' ? 'direct' : 'pooler'
const options = JSON.parse(process.argv[3] || '{}')
const n = +process.argv[4] || 300
const conns = +process.argv[5] || 10

const sql = postgres(door === 'direct' ? DIRECT() : POOL(), { max: conns, idle_timeout: 2, onnotice: () => {}, ...options })
const out = { pgjs: version, door, options, queries: n, connections: conns }
const started = Date.now()
let completed = 0
const kill = setTimeout(() => { console.log(JSON.stringify({ ...out, result: 'HANG >25s', completed })); process.exit(0) }, 25000)

try {
  const res = await Promise.all(Array.from({ length: n }, async (_, i) => {
    const r = i % 2 === 0
      ? await sql`select ${i}::int as v, 'even' as kind`
      : await sql`select ${i}::int as v, 'odd' as kind`
    completed++
    return { i, v: r[0].v, kind: r[0].kind }
  }))
  const wrong = res.filter((r) => r.v !== r.i || r.kind !== (r.i % 2 === 0 ? 'even' : 'odd'))
  console.log(JSON.stringify({ ...out, result: 'ok', ms: Date.now() - started, mismatched: wrong.length, sample: wrong.slice(0, 5) }))
} catch (e) {
  console.log(JSON.stringify({ ...out, result: 'error', ms: Date.now() - started, completed, code: e.code, msg: String(e.message).slice(0, 140) }))
}
clearTimeout(kill)
await sql.end({ timeout: 1 }).catch(() => {})
process.exit(0)
