import pg from 'pg'; import {POOL,DIRECT,snap,sleep,API_URL} from './lib.mjs'
const R=+process.argv[2], HOLD=+process.argv[3]||8, probe=process.argv[4]==='probe'
const pools=[]; const errs={}
const work=[]
for(let i=1;i<=R;i++){
  const p=new pg.Pool({connectionString:POOL('r'+i),max:20}); p.on('error',()=>{}); pools.push(p)
  for(let k=0;k<20;k++) work.push(p.query('select public.slow($1)',[HOLD]).catch(e=>{errs['r'+i+':'+e.message.slice(0,70)]=(errs['r'+i+':'+e.message.slice(0,70)]||0)+1}))
}
await sleep(3000)
const s=await snap(); console.log(`R=${R} peak backends by role`,JSON.stringify(s.by),'total',s.total)
if(probe){
  const t=Date.now()
  const res={}
  try{const c=new pg.Client({connectionString:DIRECT('r1'),connectionTimeoutMillis:4000});await c.connect();await c.query('select 1');res.direct_r1='ok';await c.end()}catch(e){res.direct_r1=e.message}
  try{const t1=Date.now();const r=await fetch(`${API_URL}/rpc/ping`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});res.data_api=r.status+' '+(await r.text()).slice(0,200)+' ('+(Date.now()-t1)+'ms)'}catch(e){res.data_api=String(e)}
  try{const c=new pg.Client({connectionString:POOL('postgres'),connectionTimeoutMillis:15000});const t1=Date.now();await c.connect();await c.query('select 1');res.new_pooler_postgres='ok after '+(Date.now()-t1)+'ms';await c.end()}catch(e){res.new_pooler_postgres=e.message}
  console.log('probes while full:',JSON.stringify(res,null,1))
}
await Promise.all(work); console.log('errors',JSON.stringify(errs))
await Promise.all(pools.map(p=>p.end()))
