import { drizzle } from 'drizzle-orm/node-postgres'; import { sql } from 'drizzle-orm'; import pg from 'pg'; import { URLS, measure, final } from './common.mjs';
const door = process.argv[2]; const K = 20;
const pool = new pg.Pool({ connectionString: URLS[door], ssl: { rejectUnauthorized: false } });
const db = drizzle(pool);
await measure(`Drizzle(node-postgres) default ${door} K=${K}`, async () => (await Promise.all(Array.from({ length: K }, () => db.execute(sql`select pg_sleep(1)`)))).length);
await pool.end(); await final();
