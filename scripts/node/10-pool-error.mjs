import pg from 'pg'; import {POOL,DIRECT,sleep,admin} from './lib.mjs'
const [door,handler]=[process.argv[2],process.argv[3]==='handler']
const pool=new pg.Pool({connectionString:door==='pooler'?POOL('r3'):DIRECT('r3'),max:5})
if(handler)pool.on('error',e=>console.log('  pool error event (handled):',e.message))
await Promise.all(Array.from({length:5},()=>pool.query('select 1'))) // 5 idle connections now in the pool
await admin("select pg_terminate_backend(pid) from pg_stat_activity where usename='r3'") // database side kills them
await sleep(1000)
const out=[];for(let i=0;i<6;i++){try{await pool.query('select 1');out.push('ok')}catch(e){out.push('ERR '+e.message.slice(0,50))}}
console.log(`${door}${handler?'+handler':' (no handler)'}: next 6 queries ->`,JSON.stringify(out));await pool.end()
