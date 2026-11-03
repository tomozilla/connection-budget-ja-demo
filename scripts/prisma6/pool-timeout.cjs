// Prisma 6: connection_limit=1, five 3 s queries at once. pool_timeout defaults to 10 s, so the last ones fail with P2024.
const { PrismaClient } = require('@prisma/client')
const url = process.argv[2] + (process.argv[2].includes('?') ? '&' : '?') + 'connection_limit=1'
;(async () => {
  const p = new PrismaClient({ datasources: { db: { url } } }); const t = Date.now()
  const res = await Promise.all(Array.from({ length: 5 }, (_, i) => p.$queryRaw`select 1 as x from pg_sleep(3)`.then(() => `q${i + 1} ok at ${((Date.now() - t) / 1000).toFixed(1)}s`).catch((e) => `q${i + 1} ${e.code} at ${((Date.now() - t) / 1000).toFixed(1)}s: ${String(e.message).split('\n').filter(Boolean).pop().slice(0, 90)}`)))
  console.log(res.join('\n')); await p.$disconnect()
})()
