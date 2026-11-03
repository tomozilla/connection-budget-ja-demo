// postgres.js (v4) against the pooler: does a query that hits a server-side "prepared statement does not exist" (26000) get retried silently?
// Counts the protocol messages the client SENDS (Parse = 'P', Bind = 'B') and the errors it SEES, for the same N queries per option set.
// Usage: node 25-postgresjs-retry.mjs <pooler|session|direct|pgbouncer> '<options json>' [total=3000]
import net from 'node:net'
import postgres from 'postgres'
import { POOL, POOL_SESSION, PGBOUNCER, DIRECT } from './lib.mjs'
const door = process.argv[2], options = JSON.parse(process.argv[3] || '{}'), total = +process.argv[4] || 3000
const url = { direct: DIRECT, session: POOL_SESSION, pgbouncer: PGBOUNCER }[door]?.('r1') ?? POOL('r1')
const sent = { P: 0, B: 0, other: 0 }
const w = net.Socket.prototype.write
net.Socket.prototype.write = function (chunk, ...a) {
  if (Buffer.isBuffer(chunk) && chunk.length > 4) { // frontend messages: 1 type byte + int32 length (startup/SSL packets are skipped by the length check)
    let o = 0
    while (o + 5 <= chunk.length) { const len = chunk.readInt32BE(o + 1), t = String.fromCharCode(chunk[o]); if (len < 4 || o + 1 + len > chunk.length) break; if (t === 'P') sent.P++; else if (t === 'B') sent.B++; else sent.other++; o += 1 + len }
  }
  return w.call(this, chunk, ...a)
}
const sql = postgres(url, { max: 10, idle_timeout: 2, ...options })
const errors = {}, t = Date.now()
const kill = setTimeout(() => { console.log(JSON.stringify({ door, options, total, result: 'HANG >25s', sent })); process.exit(0) }, 25000)
await Promise.all(Array.from({ length: total }, (_, i) => sql`select ${i}::int as v`.catch((e) => { const k = e.code + ' ' + String(e.message).slice(0, 50); errors[k] = (errors[k] || 0) + 1 })))
clearTimeout(kill)
console.log(JSON.stringify({ door, options, total, result: Object.keys(errors).length ? 'errors' : 'ok', errors, ms: Date.now() - t, parse_sent: sent.P, bind_sent: sent.B }))
await sql.end({ timeout: 1 }); process.exit(0)
