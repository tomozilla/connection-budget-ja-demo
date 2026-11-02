import postgres from 'postgres'; import { URLS, measure, final } from './common.mjs';
const door = process.argv[2]; const K = 20; const opts = process.argv[3] === 'nopipe' ? { prepare: false, max_pipeline: 1 } : process.argv[3] === 'noprep' ? { prepare: false } : {};
const sql = postgres(URLS[door], { ssl: 'require', ...opts });
await measure(`postgres.js default (max=${sql.options.max}) ${door} ${process.argv[3] || ''} K=${K}`, async () => (await Promise.all(Array.from({ length: K }, () => sql`select 1 as x from pg_sleep(1)`))).length);
await sql.end(); await final();
