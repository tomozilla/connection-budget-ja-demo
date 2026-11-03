// Guardrails against one role starving everyone (local lab). Usage: node 18-guardrails.mjs <limit [n]|timeouts|monitor|cron>
//  limit [n] alter role r1 connection limit n (default 10), then 20 clients (try n = pool size and n = pool size + 1: transaction mode holds one extra backend)
//  timeouts role-level statement_timeout, and what a client SET does to it
//  cron     a pg_cron job cancels r1 queries older than 6 s, although the client ran SET statement_timeout = 0
//  monitor  (needs reserved_connections set and a restart, see README) a role with pg_use_reserved_connections can log in when full
import pg from 'pg'
import { POOL, DIRECT, snap, sleep, admin } from './lib.mjs'
const mode = process.argv[2]
const errs = {}
const note = (k) => { errs[k] = (errs[k] || 0) + 1 }
if (mode === 'limit') {
  const LIM = +process.argv[3] || 10
  await admin(`alter role r1 connection limit ${LIM}`)
  const p1 = new pg.Pool({ connectionString: POOL('r1'), max: 40 }); p1.on('error', () => {})
  const p2 = new pg.Pool({ connectionString: POOL('r2'), max: 20 }); p2.on('error', () => {})
  const w1 = Array.from({ length: 40 }, () => p1.query('select public.slow(5)').catch((e) => note('r1: ' + e.message.slice(0, 70))))
  const w2 = Array.from({ length: 5 }, () => p2.query('select public.slow(5)').catch((e) => note('r2: ' + e.message.slice(0, 70))))
  await sleep(3000); const s = await snap(); console.log(`backends with r1 limited to ${LIM}:`, JSON.stringify({ r1: s.by.r1, r2: s.by.r2 }), '| total', s.total)
  await Promise.all([...w1, ...w2]); console.log('errors', JSON.stringify(errs)); await p1.end(); await p2.end()
  await admin('alter role r1 connection limit -1')
}
if (mode === 'timeouts') {
  await admin("alter role r1 set statement_timeout='2s'")
  const c = new pg.Client({ connectionString: DIRECT('r1') }); await c.connect()
  const t = async (label, sql) => { const s = Date.now(); try { await c.query(sql); console.log(label, '-> finished after', ((Date.now() - s) / 1000).toFixed(1), 's') } catch (e) { console.log(label, '->', e.message, `(${((Date.now() - s) / 1000).toFixed(1)} s)`) } }
  await t('role has statement_timeout=2s, 4 s query', 'select public.slow(4)')
  await c.query('set statement_timeout = 0'); console.log('client ran: set statement_timeout = 0 (allowed? yes if no error)')
  await t('after the client SET, same 4 s query', 'select public.slow(4)')
  await c.end()
  // the same through the transaction pooler: does the SET reach the next client?
  const a = new pg.Client({ connectionString: POOL('r1') }); a.on('error', () => {}); await a.connect(); await a.query('set statement_timeout = 0'); await a.end()
  const b = new pg.Client({ connectionString: POOL('r1') }); b.on('error', () => {}); await b.connect()
  const r = await b.query('show statement_timeout'); console.log('next client through the pooler sees statement_timeout =', r.rows[0].statement_timeout, '(role setting was 2s)')
  await b.end(); await admin('alter role r1 reset statement_timeout')
}
if (mode === 'monitor') {
  await admin("do $$ begin if not exists (select 1 from pg_roles where rolname='r_mon') then create role r_mon login password 'postgres'; end if; end $$")
  await admin('grant pg_use_reserved_connections to r_mon'); await admin('grant pg_monitor to r_mon')
  console.log('settings', JSON.stringify((await admin("select name, setting from pg_settings where name in ('max_connections','superuser_reserved_connections','reserved_connections')")).rows))
  const pools = []; const work = []
  for (let i = 1; i <= 4; i++) { const p = new pg.Pool({ connectionString: POOL('r' + i), max: 20 }); p.on('error', () => {}); pools.push(p); for (let k = 0; k < 20; k++) work.push(p.query('select public.slow(12)').catch(() => {})) }
  await sleep(4000)
  for (const [who, url] of [['r1 (normal role)', DIRECT('r1')], ['r_mon (pg_use_reserved_connections)', DIRECT('r_mon')]]) {
    try { const c = new pg.Client({ connectionString: url, connectionTimeoutMillis: 4000 }); await c.connect(); const n = (await c.query("select count(*)::int n from pg_stat_activity")).rows[0].n; console.log(who, '-> connected; sees', n, 'connections'); await c.end() } catch (e) { console.log(who, '->', e.message) }
  }
  await Promise.all(work); await Promise.all(pools.map((p) => p.end()))
}
if (mode === 'cron') {
  // A backstop OUTSIDE the session: a pg_cron job cancels r1's queries that run longer than 6 s, even if the client ran `set statement_timeout = 0`.
  await admin('create extension if not exists pg_cron')
  await admin("select cron.schedule('cancel-long-r1', '5 seconds', $$select pg_cancel_backend(pid) from pg_stat_activity where usename = 'r1' and state = 'active' and now() - query_start > interval '6 seconds' and pid <> pg_backend_pid()$$)")
  const c = new pg.Client({ connectionString: DIRECT('r1') }); await c.connect()
  await c.query('set statement_timeout = 0'); const s = Date.now()
  try { await c.query('select public.slow(30)'); console.log('finished after', ((Date.now() - s) / 1000).toFixed(1), 's') } catch (e) { console.log('->', e.message, `(${((Date.now() - s) / 1000).toFixed(1)} s)`) }
  await c.end()
  await admin("select cron.unschedule('cancel-long-r1')"); await admin('drop extension pg_cron')
}
