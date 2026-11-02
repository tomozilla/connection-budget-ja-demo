import { PrismaClient } from '@prisma/client'; import { URLS, measure, final } from './common.mjs';
const door = process.argv[2]; const K = 20;
const url = URLS[door] + (door === 'transaction' ? '?pgbouncer=true' : '');
process.env.DATABASE_URL = url;
const prisma = new PrismaClient();
await prisma.$queryRaw`select 1`;   // warm-up, one connection
await measure(`Prisma 6 default pool ${door} K=${K}`, async () => (await Promise.allSettled(Array.from({ length: K }, () => prisma.$queryRaw`select 1 as x from pg_sleep(1)`))).map((r) => r.status === 'fulfilled' ? 'ok' : String(r.reason.message).split('\n').slice(-1)[0].slice(0, 120)).reduce((a, x) => (a[x] = (a[x] || 0) + 1, a), {}));
await prisma.$disconnect(); await final();
