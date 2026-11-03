// A leaked session setting becomes a leaked ROW. Roles r_app / r_admin and table notes: lab/setup-leak.sql
// Request A runs as Alice, then a LATER request B (a code path that forgot to set the user) runs on the same role.
import pg from 'pg'
import { POOL, DIRECT } from './lib.mjs'
const cl = async (url) => { const c = new pg.Client({ connectionString: url }); c.on('error', () => {}); await c.connect(); return c }
const rows = async (c) => (await c.query('select owner, body from public.notes order by owner')).rows.map((r) => r.owner).join(',') || '(none)'
for (const [name, url] of [['transaction pooler', POOL('r_app')], ['direct', DIRECT('r_app')]]) {
  console.log('###', name)
  let a, b
  // 1) transaction-local (run FIRST, so no earlier session-level setting can be mistaken for a leak) app.user
  a = await cl(url); await a.query('begin'); await a.query("select set_config('app.user','alice',true)"); console.log(' A (alice, transaction-local) sees:', await rows(a)); await a.query('commit'); await a.end()
  b = await cl(url); console.log(' B after a transaction-local setting sees:', await rows(b)); await b.end()
  // 2) session-level app.user
  a = await cl(url); await a.query("select set_config('app.user','alice',false)"); console.log(' A (alice) sees:', await rows(a)); await a.end()
  b = await cl(url); console.log(' B (forgot to set the user) sees:', await rows(b), '  <- alice\'s row if it leaked'); await b.end()
  // 3) SET ROLE to a privileged role (bypassrls)
  a = await cl(url); await a.query('set role r_admin'); console.log(' A (admin task, SET ROLE r_admin) sees:', await rows(a)); await a.end()
  b = await cl(url); const who = (await b.query('select current_user u')).rows[0].u; console.log(` B (ordinary request) runs as ${who} and sees:`, await rows(b)); await b.end()
}
