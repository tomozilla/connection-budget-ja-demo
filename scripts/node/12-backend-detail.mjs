// What are the backends behind one role's pool? Usage: node 12-backend-detail.mjs [clients=20] [hold_s=6]
import pg from 'pg'
import { POOL, DIRECT, API_URL, sleep } from './lib.mjs'
const N = +process.argv[2] || 20, HOLD = +process.argv[3] || 6
const pool = new pg.Pool({ connectionString: POOL('r1'), max: N }); pool.on('error', () => {})
const work = Array.from({ length: N }, () => pool.query('select public.slow($1)', [HOLD]).catch((e) => e.message))
// touch the Data API once so PostgREST has opened its connections
const codes = await Promise.all(Array.from({ length: 12 }, () => fetch(`${API_URL}/rpc/slow`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ s: 1 }) }).then((r) => r.status)))
console.log('Data API statuses:', JSON.stringify(codes.reduce((a, s) => ((a[s] = (a[s] || 0) + 1), a), {})))
await sleep(+process.env.SNAP_AFTER_MS || 3000)
const c = new pg.Client({ connectionString: DIRECT('supabase_admin') }); await c.connect()
const q = async (title, sql) => { const r = await c.query(sql); console.log('--', title); console.table(r.rows) }
await q(`r1 backends (clients=${N}, pool 15)`, `select state, coalesce(nullif(application_name,''),'-') app, left(query,40) q, count(*)::int n from pg_stat_activity where usename='r1' group by 1,2,3 order by 4 desc`)
await q('authenticator (Data API)', `select state, coalesce(nullif(application_name,''),'-') app, left(query,60) q, count(*)::int n from pg_stat_activity where usename='authenticator' group by 1,2,3 order by 4 desc`)
await q('all roles', `select coalesce(usename,'(bg)') u, count(*)::int n from pg_stat_activity where backend_type='client backend' and pid<>pg_backend_pid() group by 1 order by 2 desc`)
await c.end(); await Promise.all(work); await pool.end()
