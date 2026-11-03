// (b) set_config(..., true) is tested separately in 07b-transaction-local.mjs
import pg from "pg"; import {POOL,DIRECT,snap,sleep,admin} from './lib.mjs'
const cl=async(u)=>{const c=new pg.Client({connectionString:u});c.on('error',()=>{});await c.connect();return c}
for(const [name,url] of [['pooler (transaction mode)',POOL('r3')],['direct',DIRECT('r3')]]){
 console.log('###',name)
 // a) session-level SET leaking
 let leaks=0, seen=[]
 for(let i=0;i<8;i++){const a=await cl(url);await a.query("set search_path to pg_catalog");await a.query("select set_config('app.user','alice',false)");await a.end()
  const b=await cl(url);const r=(await b.query("select current_setting('search_path') sp, current_setting('app.user',true) u")).rows[0];seen.push(r.sp+'|'+(r.u||''));if(r.sp==='pg_catalog'||r.u==='alice')leaks++;await b.end()}
 console.log(' a) SET/set_config(false) leaked into the next client:',leaks,'of 8 ->',JSON.stringify([...new Set(seen)]))
 // c) advisory lock session-level
 const a=await cl(url);await a.query('select pg_advisory_lock(4242)');await a.end();await sleep(500)
 const held=(await admin("select count(*)::int n from pg_locks where locktype='advisory' and objid=4242 and granted")).rows[0].n
 const b=await cl(url);const got=(await b.query('select pg_try_advisory_lock(4242) g')).rows[0].g;console.log(` c) session advisory lock after client A disconnected: still held in pg_locks=${held}; client B pg_try_advisory_lock -> ${got}`);await b.end()
 await admin("select pg_advisory_unlock_all()").catch(()=>{}); await admin("select pg_terminate_backend(pid) from pg_locks where locktype='advisory' and objid=4242 and pid<>pg_backend_pid()").catch(()=>{})
 // d) named prepared statement across clients
 const out=[]
 for(let i=0;i<6;i++){const c=await cl(url);try{const r=await c.query({name:'q1',text:'select $1::int as v',values:[i]});out.push('ok')}catch(e){out.push(e.message.slice(0,60))}await c.end()}
 console.log(' d) named prepared statement q1, 6 clients in a row:',JSON.stringify([...new Set(out)]))
 // e) LISTEN
 const l=await cl(url);try{await l.query('listen ch1');const n=await new Promise(res=>{const t=setTimeout(()=>res('no notification'),2500);l.on('notification',m=>{clearTimeout(t);res('got '+m.payload)});admin("notify ch1,'hello'")});console.log(' e) LISTEN/NOTIFY:',n)}catch(e){console.log(' e) LISTEN error',e.message)}await l.end()
}
