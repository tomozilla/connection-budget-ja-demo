// Shared helpers for the lab scripts. Everything points at a LOCAL Supabase CLI stack by default.
// The password default is the CLI's local-only development password. Never use it for a real database.
import pg from 'pg'
const H = process.env.LAB_HOST || '127.0.0.1'
const PW = process.env.LAB_PASSWORD || 'postgres'
const DBP = process.env.LAB_DB_PORT || '54322'
const PLP = process.env.LAB_POOLER_PORT || '54329'
const API = process.env.LAB_API_PORT || '54321'
const TENANT = process.env.LAB_TENANT || 'pooler-dev' // the CLI pooler's tenant id, appended to the user name
export const POOL = (u = 'postgres') => `postgresql://${u}.${TENANT}:${PW}@${H}:${PLP}/postgres`
export const DIRECT = (u = 'postgres') => `postgresql://${u}:${PW}@${H}:${DBP}/postgres`
export const API_URL = `http://${H}:${API}/rest/v1`
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
// Count backends per role through our OWN direct session as supabase_admin (it has reserved slots,
// so it still works when the database is full). Supavisor's own metadata connections are labelled.
export async function snap() {
  const c = new pg.Client({ connectionString: DIRECT('supabase_admin') })
  await c.connect()
  const r = await c.query(`select case when application_name like 'supavisor%' or application_name like 'cluster_node%' then 'supavisor_internal' else coalesce(usename,'(bg)') end u, state, count(*)::int n
    from pg_stat_activity where backend_type='client backend' and pid<>pg_backend_pid() group by 1,2 order by 1,2`)
  await c.end()
  const by = {}
  let total = 0
  for (const x of r.rows) { by[x.u] = (by[x.u] || 0) + x.n; total += x.n }
  return { total, by, rows: r.rows }
}
export async function admin(sql) {
  const c = new pg.Client({ connectionString: DIRECT('supabase_admin') })
  await c.connect()
  const r = await c.query(sql)
  await c.end()
  return r
}
