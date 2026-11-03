import pg from 'pg'; import {POOL,DIRECT} from './lib.mjs'
const url=process.argv[2]==='pooler'?POOL('r1'):DIRECT('r1')
const p=new pg.Pool({connectionString:url,max:10});p.on('error',()=>{})
await Promise.all(Array.from({length:10},()=>p.query('select public.slow(5)').catch(e=>{})));await p.end()
