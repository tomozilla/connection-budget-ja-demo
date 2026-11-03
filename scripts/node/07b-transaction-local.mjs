import pg from 'pg'; import {POOL,DIRECT} from './lib.mjs'
for(const [n,u] of [['pooler',POOL('r4')],['direct',DIRECT('r4')]]){
 const x=new pg.Client({connectionString:u});await x.connect()
 await x.query('begin');await x.query("select set_config('app.tx_only','alice',true)")
 const inTx=(await x.query("select current_setting('app.tx_only',true) v")).rows[0].v
 await x.query('commit');const after=(await x.query("select current_setting('app.tx_only',true) v")).rows[0].v
 console.log(n,'set_config(is_local=true): inside tx',JSON.stringify(inTx),'| after commit',JSON.stringify(after));await x.end()}
