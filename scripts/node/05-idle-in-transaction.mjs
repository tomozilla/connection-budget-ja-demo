import pg from 'pg'; import {DIRECT,POOL,snap,sleep,admin} from './lib.mjs'
await admin("alter role r2 set idle_in_transaction_session_timeout='5s'")
for(const [name,url] of [['direct',DIRECT('r2')],['pooler(transaction)',POOL('r2')]]){
 const c=new pg.Client({connectionString:url});c.on('error',e=>console.log(' client error event:',e.message));await c.connect();await c.query('begin');await c.query('select 1')
 await sleep(1500);const s1=(await snap()).rows.filter(r=>r.u==='r2').map(r=>r.state+':'+r.n);
 await sleep(6000);const s2=(await snap()).rows.filter(r=>r.u==='r2').map(r=>r.state+':'+r.n)
 let next='ok';try{await c.query('select 2')}catch(e){next=e.message}
 console.log(name,'| 1.5s later',JSON.stringify(s1),'| 7.5s later',JSON.stringify(s2),'| next query:',next);try{await c.end()}catch{}
}
await admin("alter role r2 reset idle_in_transaction_session_timeout")
