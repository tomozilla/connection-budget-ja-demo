// Is the pool per MODE? One role, transaction-mode clients and session-mode clients at the same time.
// Usage: LAB_SESSION_PORT=<port> node 13-two-modes.mjs [clients_per_mode=20] [hold_s=8]
import pg from 'pg'
import { POOL, POOL_SESSION, snap, sleep } from './lib.mjs'
const N = +process.argv[2] || 20, HOLD = +process.argv[3] || 8
const mk = (url) => { const p = new pg.Pool({ connectionString: url, max: N }); p.on('error', () => {}); return p }
const tx = mk(POOL('r1')), se = mk(POOL_SESSION('r1'))
const errs = {}
const run = (p, tag) => Array.from({ length: N }, () => p.query('select public.slow($1)', [HOLD]).catch((e) => { const k = tag + ': ' + e.message.slice(0, 60); errs[k] = (errs[k] || 0) + 1 }))
const work = [...run(tx, 'transaction'), ...run(se, 'session')]
await sleep(4000)
const s = await snap()
console.log(`r1 backends with ${N} transaction clients + ${N} session clients at once:`, s.by.r1 || 0, '| all roles', JSON.stringify(s.by))
await Promise.all(work)
console.log('errors', JSON.stringify(errs))
await tx.end(); await se.end()
