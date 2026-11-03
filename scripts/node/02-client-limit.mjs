import pg from 'pg'; import {POOL,snap,sleep} from './lib.mjs'
const N=+process.argv[2]||201, clients=[], errs=[]
const t0=Date.now()
for(let i=0;i<N;i++){
  const c=new pg.Client({connectionString:POOL(),connectionTimeoutMillis:5000}); c.on('error',()=>{})
  try{await c.connect();await c.query('select 1');clients.push(c)}catch(e){errs.push({i:i+1,msg:e.message,ms:Date.now()-t0}); if(errs.length>=2)break}
}
console.log('connected',clients.length,'errors',JSON.stringify(errs.slice(0,2)))
console.log('backends while holding',JSON.stringify((await snap()).by))
for(const c of clients)await c.end()
await sleep(1000);console.log('after close',JSON.stringify((await snap()).by))
