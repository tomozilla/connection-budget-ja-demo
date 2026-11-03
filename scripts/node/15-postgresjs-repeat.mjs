// postgres.js with the SAME query repeated many times per connection (prepared statements are created after the first runs).
// Usage: node 15-postgresjs-repeat.mjs <pooler|session|direct> '<options json>' [total_queries=200]
import postgres from 'postgres'
import { POOL, POOL_SESSION, DIRECT } from './lib.mjs'
const door = process.argv[2], options = JSON.parse(process.argv[3] || '{}'), total = +process.argv[4] || 200
const url = door === 'direct' ? DIRECT('r1') : door === 'session' ? POOL_SESSION('r1') : POOL('r1')
const sql = postgres(url, { max: 10, idle_timeout: 2, ...options })
const errors = {}, t = Date.now()
const kill = setTimeout(() => { console.log(JSON.stringify({ door, options, total, result: 'HANG >25s' })); process.exit(0) }, 25000)
await Promise.all(Array.from({ length: total }, (_, i) => sql`select ${i}::int as v`.catch((e) => { const k = String(e.message).slice(0, 55); errors[k] = (errors[k] || 0) + 1 })))
clearTimeout(kill)
console.log(JSON.stringify({ door, options, total, result: Object.keys(errors).length ? 'errors' : 'ok', errors, ms: Date.now() - t }))
await sql.end({ timeout: 1 }); process.exit(0)
