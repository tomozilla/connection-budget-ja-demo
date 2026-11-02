import postgres from 'postgres'; import { URLS } from './common.mjs';
const mode = process.argv[2];
const sql = postgres(URLS.transaction, { ssl: 'require', prepare: false, max: 1, connect_timeout: 8 });
setTimeout(() => { console.log(`${mode}: HUNG after 12s`); process.exit(3); }, 12000);
const t0 = Date.now();
if (mode === 'pipelined-select1') await Promise.all([sql`select 1 as x`, sql`select 1 as x`]);
if (mode === 'sequential-sleep') { await sql`select 1 as x from pg_sleep(1)`; await sql`select 1 as x from pg_sleep(1)`; }
console.log(mode, 'ok', Date.now() - t0, 'ms');
process.exit(0);
