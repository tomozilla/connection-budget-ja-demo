// postgres.js hang check. Usage: node 01-postgresjs-hang.mjs <pooler|direct> '<options json>' [queries]
//   node 01-postgresjs-hang.mjs pooler '{}'                              default options
//   node 01-postgresjs-hang.mjs pooler '{"prepare":false}'               prepared statements off only
//   node 01-postgresjs-hang.mjs pooler '{"max_pipeline":1}'              pipelining off only
import postgres from 'postgres'
import { POOL, DIRECT } from './lib.mjs'
const door = process.argv[2]
const options = JSON.parse(process.argv[3] || '{}')
const n = +process.argv[4] || 20
const sql = postgres(door === 'direct' ? DIRECT() : POOL(), { max: 10, idle_timeout: 2, ...options })
const t = Date.now()
const kill = setTimeout(() => { console.log(JSON.stringify({ door, options, n, result: 'HANG >20s' })); process.exit(0) }, 20000)
try {
  await Promise.all(Array.from({ length: n }, () => sql`select 1 as x from pg_sleep(0.5)`))
  console.log(JSON.stringify({ door, options, n, result: 'ok', ms: Date.now() - t }))
} catch (e) {
  console.log(JSON.stringify({ door, options, n, result: 'error', msg: String(e.message).slice(0, 100) }))
}
clearTimeout(kill)
await sql.end({ timeout: 1 })
process.exit(0)
