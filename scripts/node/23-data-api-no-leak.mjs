// Contrast: the Data API (PostgREST) applies per-request settings INSIDE the request's transaction. Local Auth, publishable key only.
// Needs LAB_PUBLISHABLE_KEY. Two users (alice@, bob@example.com) sign up, own one row each in public.notes2, then 40 mixed concurrent requests.
import { BASE, admin } from './lib.mjs'
const KEY = process.env.LAB_PUBLISHABLE_KEY; if (!KEY) throw new Error('set LAB_PUBLISHABLE_KEY')
const H = { apikey: KEY, 'content-type': 'application/json' }
const pw = 'lab-only-password-1'
const login = async (email) => { await fetch(`${BASE}/auth/v1/signup`, { method: 'POST', headers: H, body: JSON.stringify({ email, password: pw }) }); const r = await (await fetch(`${BASE}/auth/v1/token?grant_type=password`, { method: 'POST', headers: H, body: JSON.stringify({ email, password: pw }) })).json(); return { token: r.access_token, id: r.user.id } }
const alice = await login('alice@example.com'), bob = await login('bob@example.com')
await admin(`create table if not exists public.notes2 (owner uuid, body text); alter table public.notes2 enable row level security; truncate public.notes2;
 grant select on public.notes2 to authenticated, anon; drop policy if exists own on public.notes2;
 create policy own on public.notes2 for select to authenticated using (owner = auth.uid());
 insert into public.notes2 values ('${alice.id}', 'Alice: salary review draft'), ('${bob.id}', 'Bob: holiday plan');`)
await admin("notify pgrst, 'reload schema'"); await new Promise((r) => setTimeout(r, 1500)) // PostgREST must learn about the new table
const get = async (token) => (await (await fetch(`${BASE}/rest/v1/notes2?select=body`, { headers: { ...H, ...(token ? { authorization: 'Bearer ' + token } : {}) } })).json()).map?.((r) => r.body)?.join(' | ') || '(none)'
console.log('alice sees:', await get(alice.token)); console.log('anonymous right after sees:', await get(null)); console.log('bob sees:', await get(bob.token)); console.log('anonymous again sees:', await get(null))
const jobs = Array.from({ length: 40 }, (_, i) => [['alice', alice.token], ['bob', bob.token], [null, null], ['alice', alice.token]][i % 4])
const res = await Promise.all(jobs.map(async ([who, tk]) => ({ who, got: await get(tk) })))
const wrong = res.filter((r) => (r.who === 'alice' && r.got !== 'Alice: salary review draft') || (r.who === 'bob' && r.got !== 'Bob: holiday plan') || (!r.who && r.got !== '(none)'))
console.log(`40 mixed concurrent requests: ${wrong.length} got someone else's data (or nothing when they should have data)`)
