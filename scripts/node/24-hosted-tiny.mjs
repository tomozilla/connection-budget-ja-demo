// TINY checks on a hosted FREE project whose pooler pool size you set to 3 (Database settings). A handful of clients, seconds, then stop.
// Needs: PROJECT_REF, POOLER_HOST (Connect dialog), PROBE_PASSWORD (a test role you created), PUBLISHABLE_KEY. Never a service_role key.
// Usage: node 24-hosted-tiny.mjs <modes|checkout>   or   node 24-hosted-tiny.mjs postgresjs '<options json>'   (one variant per call: a hang ends the process)
import pg from 'pg'
import postgres from 'postgres'
const { PROJECT_REF: REF, POOLER_HOST: HOST, PROBE_PASSWORD: PW, PUBLISHABLE_KEY: KEY } = process.env
if (!REF || !HOST || !PW || !KEY) throw new Error('set PROJECT_REF, POOLER_HOST, PROBE_PASSWORD, PUBLISHABLE_KEY')
const url = (port) => `postgresql://conn_probe.${REF}:${encodeURIComponent(PW)}@${HOST}:${port}/postgres`
const ssl = { rejectUnauthorized: false } // convenience only: it does not verify the certificate
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const stats = async () => { const r = await fetch(`https://${REF}.supabase.co/rest/v1/rpc/conn_stats`, { method: 'POST', headers: { apikey: KEY, 'content-type': 'application/json' }, body: '{}' }); const j = await r.json(); return Array.isArray(j) ? Object.fromEntries(Object.entries(j.reduce((a, x) => ((a[x.usename] = (a[x.usename] || 0) + Number(x.n)), a), {}))) : { error: JSON.stringify(j).slice(0, 80) } }
const mode = process.argv[2]
const mk = (port, max) => { const p = new pg.Pool({ connectionString: url(port), max, ssl }); p.on('error', () => {}); return p }
if (mode === 'modes') {
  const tx = mk(6543, 5), se = mk(5432, 5), errs = {}
  const run = (p, tag) => Array.from({ length: 5 }, () => p.query('select public.probe_sleep($1)', [8]).catch((e) => { const k = tag + ': ' + e.message.slice(0, 70); errs[k] = (errs[k] || 0) + 1 }))
  const work = [...run(tx, 'transaction'), ...run(se, 'session')]
  await sleep(4500); console.log('conn_probe backends with pool size 3, 5 clients per mode at once:', JSON.stringify(await stats()))
  await Promise.all(work); console.log('errors', JSON.stringify(errs)); await tx.end(); await se.end()
}
if (mode === 'postgresjs') {
  for (const o of [JSON.parse(process.argv[3] || '{}')]) {
    const sql = postgres(url(6543), { max: 2, idle_timeout: 2, ssl, ...o }); const t = Date.now(); let res = 'ok'
    const kill = setTimeout(() => { console.log(JSON.stringify({ options: o, result: 'HANG >15s' })); process.exit(0) }, 15000)
    try { await Promise.all(Array.from({ length: 6 }, () => sql`select 1 as x from pg_sleep(0.5)`)) } catch (e) { res = 'error: ' + String(e.message).slice(0, 70) }
    clearTimeout(kill); console.log(JSON.stringify({ options: o, result: res, ms: Date.now() - t })); await sql.end({ timeout: 1 }); await sleep(1000)
  }
}
if (mode === 'checkout') {
  const tx = mk(6543, 5), t0 = Date.now(), res = []
  await Promise.all(Array.from({ length: 5 }, (_, i) => tx.query('select public.probe_sleep($1)', [65]).then(() => res.push(`client ${i + 1}: ok at ${((Date.now() - t0) / 1000).toFixed(0)} s`)).catch((e) => res.push(`client ${i + 1}: ${e.message.slice(0, 90)} at ${((Date.now() - t0) / 1000).toFixed(0)} s`))))
  console.log(res.sort().join('\n')); await tx.end()
}
