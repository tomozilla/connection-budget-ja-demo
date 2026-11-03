import pg from 'pg'; import {POOL,sleep} from './lib.mjs'
const [N,ms,secs]=[+process.argv[2],+process.argv[3],+process.argv[4]||6]
const pool=new pg.Pool({connectionString:POOL('r2'),max:N});pool.on('error',()=>{})
await pool.query('select 1')
const lat=[];let stop=false;const t0=Date.now()
const loop=async()=>{while(!stop){const t=process.hrtime.bigint();try{await pool.query('select pg_sleep($1)',[ms/1000]);lat.push(Number(process.hrtime.bigint()-t)/1e6)}catch(e){lat.push(-1)}}}
const ws=Array.from({length:N},loop);await sleep(secs*1000);stop=true;await Promise.all(ws);const el=(Date.now()-t0)/1000
const ok=lat.filter(x=>x>=0).sort((a,b)=>a-b);const q=p=>ok[Math.min(ok.length-1,Math.floor(p*ok.length))]
console.log(JSON.stringify({clients:N,query_ms:ms,qps:+(ok.length/el).toFixed(0),p50:Math.round(q(.5)),p95:Math.round(q(.95)),errors:lat.length-ok.length,littles_busy_backends:+(ok.length/el*ms/1000).toFixed(1)}))
await pool.end()
