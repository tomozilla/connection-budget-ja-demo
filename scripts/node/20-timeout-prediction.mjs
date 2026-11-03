// Prediction: with C clients on B backends, a client waits about (C - B) / B x query_time. Above 60 s the pooler gives up.
// Usage: node 20-timeout-prediction.mjs <clients=199> <query_s=5.5> <run_s=100>
import pg from 'pg'
import { POOL, sleep } from './lib.mjs'
const C = +process.argv[2] || 199, Q = +process.argv[3] || 5.5, RUN = +process.argv[4] || 100
const pool = new pg.Pool({ connectionString: POOL('r1'), max: C }); pool.on('error', () => {})
const lat = [], errs = {}; let stop = false; const t0 = Date.now()
const loop = async () => { while (!stop) { const t = Date.now(); try { await pool.query('select public.slow($1)', [Q]); lat.push((Date.now() - t) / 1000) } catch (e) { const k = e.message.slice(0, 60); errs[k] = (errs[k] || 0) + 1; await sleep(500) } } }
const ws = Array.from({ length: C }, loop); await sleep(RUN * 1000); stop = true; await Promise.all(ws)
lat.sort((a, b) => a - b); const q = (p) => lat[Math.min(lat.length - 1, Math.floor(p * lat.length))]
console.log(JSON.stringify({ clients: C, query_s: Q, predicted_wait_s: +(((C - 16) / 16) * Q).toFixed(1), finished: lat.length, p50: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), max: +lat[lat.length - 1].toFixed(1), errors: errs }))
await pool.end()
