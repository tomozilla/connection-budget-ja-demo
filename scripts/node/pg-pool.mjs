import pg from 'pg'; import { URLS, measure, final } from './common.mjs';
const door = process.argv[2]; const K = 20;
const pool = new pg.Pool({ connectionString: URLS[door], ssl: { rejectUnauthorized: false } });
await measure(`pg Pool default (max=${pool.options.max}) ${door} K=${K}`, async () => { const r = await Promise.all(Array.from({ length: K }, () => pool.query('select pg_sleep(1)'))); return r.length; });
await pool.end(); await final();
