const {PrismaClient}=require('@prisma/client'); const pg=require('pg')
const url=process.argv[2]
;(async()=>{
 const p=new PrismaClient({datasources:{db:{url}}})
 const t=Date.now(); const errs={}
 const ws=Array.from({length:30},()=>p.$queryRaw`select 1 as x from pg_sleep(1.5)`.catch(e=>{const m=(e.message||'').split('\n').filter(Boolean).pop().slice(0,110);errs[m]=(errs[m]||0)+1}))
 await new Promise(r=>setTimeout(r,1000))
 const c=new pg.Client({connectionString:`postgresql://supabase_admin:${process.env.LAB_PASSWORD||'postgres'}@${process.env.LAB_HOST||'127.0.0.1'}:${process.env.LAB_DB_PORT||'54322'}/postgres`});await c.connect()
 const n=(await c.query("select count(*)::int n from pg_stat_activity where usename='r3'")).rows[0].n;await c.end()
 await Promise.all(ws);console.log(JSON.stringify({url:url.replace(/:postgres@/,':***@'),backends_at_1s:n,errors:errs,ms:Date.now()-t}));await p.$disconnect()
})()
