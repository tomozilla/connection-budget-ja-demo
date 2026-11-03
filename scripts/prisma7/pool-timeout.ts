// Prisma 7 + @prisma/adapter-pg: pool of ONE connection, five 3 s queries at once.
// Prisma 6 gave up on the 4th at its 10 s pool_timeout (P2024). The adapter hands the pool to node-postgres, which waits without limit unless you set connectionTimeoutMillis.
// Usage: node pool-timeout.ts <url> [connectionTimeoutMillis]
import { PrismaClient } from './gen/client.ts'
import { PrismaPg } from '@prisma/adapter-pg'
const [url, cto] = [process.argv[2], process.argv[3]]
const adapter = new PrismaPg({ connectionString: url, max: 1, ...(cto ? { connectionTimeoutMillis: +cto } : {}) })
const p = new PrismaClient({ adapter }); const t = Date.now()
const res = await Promise.all(Array.from({ length: 5 }, (_, i) => p.$queryRaw`select 1 as x from pg_sleep(3)`.then(() => `q${i + 1} ok at ${((Date.now() - t) / 1000).toFixed(1)}s`).catch((e: any) => `q${i + 1} ${e.code ?? e.name} at ${((Date.now() - t) / 1000).toFixed(1)}s: ${String(e.message).split('\n').filter(Boolean).pop()!.slice(0, 90)}`)))
console.log(`connectionTimeoutMillis=${cto ?? '(default)'}\n` + res.join('\n')); await p.$disconnect()
