// Usage: node 04-queue-timeout.mjs <clients=16> <hold_s=65>   (LAB_MODE=session uses the session-mode port, needs LAB_SESSION_PORT)
import pg from 'pg'; import {POOL,POOL_SESSION,sleep} from './lib.mjs'
const URL=process.env.LAB_MODE==='session'?POOL_SESSION('r1'):POOL('r1')
const N=+process.argv[2]||16, HOLD=+process.argv[3]||65
const t0=Date.now(); const res=[]
await Promise.all(Array.from({length:N},async(_,i)=>{
  const c=new pg.Client({connectionString:URL}); c.on('error',()=>{})
  try{await c.connect();const t=Date.now();await c.query('select public.slow($1)',[HOLD]);res.push({i,ok:true,s:+((Date.now()-t)/1000).toFixed(1)})}
  catch(e){res.push({i,ok:false,s:+((Date.now()-t0)/1000).toFixed(1),err:e.message.slice(0,90)})}
  try{await c.end()}catch{}
}))
res.sort((a,b)=>a.s-b.s); console.log(`N=${N} hold=${HOLD}s`);console.log(JSON.stringify(res.filter(r=>!r.ok)));console.log('ok',res.filter(r=>r.ok).length,'failed',res.filter(r=>!r.ok).length, 'total s',((Date.now()-t0)/1000).toFixed(1))
