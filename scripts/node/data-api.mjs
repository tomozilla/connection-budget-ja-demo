import { createClient } from '@supabase/supabase-js'; import { REF, PUB, measure, final } from './common.mjs';
const mode = process.argv[2]; const K = 20;
const sb = createClient(`https://${REF}.supabase.co`, PUB);
await measure(`${mode} Data API K=${K}`, async () => {
  const f = mode === 'supabase-js'
    ? () => sb.rpc('probe_sleep', { s: 1 }).then((r) => { if (r.error) throw new Error(r.error.message); })
    : () => fetch(`https://${REF}.supabase.co/rest/v1/rpc/probe_sleep`, { method: 'POST', headers: { apikey: PUB, 'content-type': 'application/json' }, body: '{"s":1}' }).then(async (r) => { if (!r.ok) throw new Error(r.status + ' ' + await r.text()); });
  return (await Promise.all(Array.from({ length: K }, f))).length;
});
await final();
