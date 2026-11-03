// run: node app/test-calc.js
const assert = require('node:assert');
require('./i18n/en.js');
require('./i18n/ja.js');
const { budget } = require('./calc.js');
const base = { compute: 'Nano (free)', poolSize: 15, instances: 1, framework: 'pg (node-postgres) Pool', param: 0, door: 'transaction pooler (6543)', roles: 1, modes: 1, usesDataApi: true, otherServices: 5 };
const has = (r, level, re) => r.findings.some((f) => f.level === level && re.test(f.text));
// 1 app copy of pg (10) on the transaction pooler: 10 backends + 11 Data API + 5 = 26 of 60, fits
let r = budget(base); assert.equal(r.clients, 10); assert.equal(r.backend, 10); assert.equal(r.total, 26); assert(!r.findings.some((f) => f.level === 'bad'));
// pool size x roles x modes: 4 roles x 2 modes x 15 = up to 120, but only as many as there are clients
r = budget({ ...base, instances: 30, roles: 4, modes: 2 }); assert.equal(r.backend, 8 * 16); assert(has(r, 'bad', /pooler client limit/)); assert(has(r, 'bad', /max_connections/));
// 2 roles x 15 + Data API 11 + 5 = 46: fits; 3 roles x 15 = 45 + 16 = 61 > 60
r = budget({ ...base, instances: 3, roles: 2 }); assert.equal(r.backend, 30); assert.equal(r.total, 46);
r = budget({ ...base, instances: 5, roles: 3 }); assert.equal(r.backend, 48); assert.equal(r.total, 64); assert(has(r, 'bad', /max_connections/));
// 16 clients on one pool in transaction mode did not wait in my lab; 17 did
r = budget({ ...base, framework: 'Custom', param: 16 }); assert.equal(r.backend, 16); assert(!has(r, 'warn', /ECHECKOUTTIMEOUT/));
r = budget({ ...base, framework: 'Custom', param: 17 }); assert(has(r, 'warn', /ECHECKOUTTIMEOUT/));
// session mode refuses above the pool size
r = budget({ ...base, door: 'session pooler (5432)', instances: 2 }); assert(has(r, 'bad', /Session mode/));
// transaction mode queues (and warns about the 60 s timeout)
r = budget({ ...base, instances: 2 }); assert(has(r, 'warn', /ECHECKOUTTIMEOUT/)); assert.equal(r.backend, 16);
// direct: instances x pool: 5 copies of pg = 50 + 11 + 5 = 66 > 60
r = budget({ ...base, door: 'direct', instances: 5 }); assert.equal(r.backend, 50); assert(has(r, 'bad', /max_connections/));
// Prisma 6 on 10 cores = 21 per copy; Prisma 7 pg adapter = 10
r = budget({ ...base, framework: 'Prisma 6 (query engine)', param: 10 }); assert.equal(r.clients, 21); assert(has(r, 'warn', /pgbouncer=true/));
r = budget({ ...base, framework: 'Prisma 7 (pg adapter)' }); assert.equal(r.clients, 10);
// Django: default no pool = threads; pool=True = 4
r = budget({ ...base, framework: 'Django (default, no pool)', param: 20 }); assert.equal(r.clients, 20);
r = budget({ ...base, framework: 'Django 5.1+ OPTIONS pool=True' }); assert.equal(r.clients, 4);
// rule of thumb: pool 40 on Nano with the Data API is above 24
r = budget({ ...base, poolSize: 40 }); assert(has(r, 'warn', /rule of thumb/));
// Little's law: 100 qps x 200 ms = 20 busy backends > 10 available
r = budget({ ...base, qps: 100, queryMs: 200 }); assert(r.busy === 20); assert(has(r, 'warn', /Little/));
// Japanese messages exist
r = budget({ ...base, lang: 'ja', door: 'session pooler (5432)', instances: 2 }); assert(has(r, 'bad', /セッションモード/));
// above the client limit there is no reassuring "wait" message
r = budget({ ...base, instances: 30 }); assert(!has(r, 'warn', /ECHECKOUTTIMEOUT/));
console.log('calc tests passed');
