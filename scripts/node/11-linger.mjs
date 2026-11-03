import pg from 'pg'; import {POOL,snap,sleep} from './lib.mjs'
const log=console.log
log('baseline '+JSON.stringify((await snap()).by))
const pool=new pg.Pool({connectionString:POOL(),max:20})
await Promise.all(Array.from({length:20},()=>pool.query('select 1 from pg_sleep(1)')))
await pool.end()
const t0=Date.now(); log('clients closed at t=0')
for(let i=0;i<30;i++){await sleep(15000);const s=await snap();log(`t=${Math.round((Date.now()-t0)/1000)}s ${JSON.stringify(s.by)} states=${JSON.stringify(s.rows.filter(r=>r.u==='postgres').map(r=>r.state+':'+r.n))}`)}
