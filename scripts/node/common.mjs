// Configuration comes from environment variables only (never from files in this repo):
//   PROJECT_REF, POOLER_HOST (from the dashboard Connect dialog), PROBE_PASSWORD (the password you chose in sql/probe-setup.sql), PUBLISHABLE_KEY
const need = (k) => { if (!process.env[k]) { console.error('missing env var ' + k); process.exit(1); } return process.env[k]; };
export const REF = need('PROJECT_REF');
export const PUB = need('PUBLISHABLE_KEY');
export const PW = need('PROBE_PASSWORD');
export const HOST = need('POOLER_HOST');
export const URLS = {
  session: `postgresql://conn_probe.${REF}:${PW}@${HOST}:5432/postgres`,
  transaction: `postgresql://conn_probe.${REF}:${PW}@${HOST}:6543/postgres`,
  direct: `postgresql://conn_probe:${PW}@db.${REF}.supabase.co:5432/postgres`,
};
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function stats() {
  const r = await fetch(`https://${REF}.supabase.co/rest/v1/rpc/conn_stats`, { method: 'POST', headers: { apikey: PUB, 'content-type': 'application/json' }, body: '{}' });
  const rows = await r.json();
  const sum = (u) => rows.filter((x) => x.usename === u).reduce((a, x) => a + Number(x.n), 0);
  return { probe: sum('conn_probe'), auth: sum('authenticator'), total: rows.reduce((a, x) => a + Number(x.n), 0) };
}
// run fn() while polling backend counts; K, label printed. returns peaks
export async function measure(label, fn) {
  const before = await stats();
  let peakProbe = 0, peakAuth = 0, stop = false;
  const poll = (async () => { while (!stop) { try { const s = await stats(); peakProbe = Math.max(peakProbe, s.probe); peakAuth = Math.max(peakAuth, s.auth); } catch {} await sleep(200); } })();
  const t0 = Date.now(); let err = null, res = null;
  const killer = setTimeout(async () => { console.log(JSON.stringify({ label, TIMEOUT_after_s: 25, peakProbe, peakAuth })); process.exit(3); }, 25000);
  try { res = await fn(); } catch (e) { err = e; }
  clearTimeout(killer); const ms = Date.now() - t0;
  await sleep(1500); stop = true; await poll;
  await sleep(1500);
  const after = await stats();
  const out = { label, ms, err: err && String(err.message || err).slice(0, 160), res, before, peakProbe, peakAuth, after };
  console.log(JSON.stringify(out));
  return out;
}
export async function final(tag = '') { await sleep(3000); console.log('final-after-close' + tag, JSON.stringify(await stats())); }
