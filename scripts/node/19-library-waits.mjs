// What does the library itself do while it waits for a free connection? (direct connection, role r1)
// node-postgres: connectionTimeoutMillis default is 0 = wait forever; with a value it throws.
import pg from 'pg'
import { DIRECT } from './lib.mjs'
for (const opt of [{}, { connectionTimeoutMillis: 2000 }]) {
  const pool = new pg.Pool({ connectionString: DIRECT('r1'), max: 1, ...opt }); pool.on('error', () => {})
  const t = Date.now(); const res = await Promise.all([1, 2, 3].map((i) => pool.query('select public.slow(3)').then(() => `q${i} ok at ${((Date.now() - t) / 1000).toFixed(1)}s`).catch((e) => `q${i} ${e.message} at ${((Date.now() - t) / 1000).toFixed(1)}s`)))
  console.log('pg Pool max 1,', JSON.stringify(opt), '->', res.join(' | ')); await pool.end()
}
