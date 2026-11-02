// run: node app/test-calc.js
const assert = require('node:assert');
const { budget } = require('./calc.js');
const base = { compute: 'Nano (free)', poolSize: 15, instances: 1, framework: 'Prisma 6', param: 10, door: 'session pooler (5432)', servicesHeadroom: 17 };
// my run: Prisma default on 10 cores = 21 clients; session mode with pool 15 -> over pool size
let r = budget(base); assert.equal(r.clients, 21); assert.equal(r.backend, 15); assert(r.findings.some((f) => f.level === 'bad' && /セッションモード/.test(f.text)));
// transaction mode: same clients share the pool, no error
r = budget({ ...base, door: 'transaction pooler (6543)' }); assert.equal(r.backend, 15); assert(r.findings.some((f) => /15本を分け合/.test(f.text)));
// direct: backend = clients; 21 + 17 = 38 of 60
r = budget({ ...base, door: 'direct' }); assert.equal(r.backend, 21); assert.equal(r.total, 38);
// 4 app copies direct with pg: 40 + 17 = 57 > 80%
r = budget({ ...base, framework: 'pg (node-postgres) Pool', instances: 4, door: 'direct' }); assert.equal(r.clients, 40); assert(r.findings.some((f) => f.level === 'warn'));
// 6 copies direct: 60 + 17 > 60
r = budget({ ...base, framework: 'pg (node-postgres) Pool', instances: 6, door: 'direct' }); assert(r.findings.some((f) => f.level === 'bad'));
// serverless: 30 functions x pg 10 on transaction = 300 clients > 200 on Nano
r = budget({ ...base, framework: 'pg (node-postgres) Pool', instances: 30, door: 'transaction pooler (6543)' }); assert(r.findings.some((f) => /プーラーのクライアント上限/.test(f.text)));
assert(!r.findings.some((f) => f.level === 'ok'), 'no "extra clients wait" message above the client limit');
console.log('calc tests passed');
