// run: node app/test-calc.js
const assert = require('node:assert');
require('./i18n/en.js');
require('./i18n/ja.js');
const { budget } = require('./calc.js');
const base = { compute: 'Nano (free)', poolSize: 15, instances: 1, framework: 'pg (node-postgres) Pool', param: 0, door: 'transaction pooler (6543)', roles: 1, modes: 1, usesDataApi: true, otherServices: 5, reserved: 3 };
const has = (r, level, re) => r.findings.some((f) => f.level === level && re.test(f.text));
// 1 app copy of pg (10) on the transaction pooler: 10 backends + 11 Data API + 5 = 26 of 57 usable (60 - 3 reserved), fits
let r = budget(base); assert.equal(r.clients, 10); assert.equal(r.backend, 10); assert.equal(r.total, 26); assert.equal(r.usable, 57); assert(!r.findings.some((f) => f.level === 'bad'));
// the limit is max_connections MINUS reserved slots: 58 total would fit under 60 but not under 57
r = budget({ ...base, door: 'direct', instances: 4, otherServices: 7 }); assert.equal(r.total, 58); assert(has(r, 'bad', /57/));
r = budget({ ...base, door: 'direct', instances: 4, otherServices: 7, reserved: 0 }); assert(!has(r, 'bad', /max_connections/));
// pools are per (role, mode); transaction mode holds pool + 1
r = budget({ ...base, instances: 30, roles: 4, modes: 2 }); assert.equal(r.backend, 8 * 16); assert(has(r, 'bad', /max_connections/));
r = budget({ ...base, instances: 3, roles: 2 }); assert.equal(r.backend, 30); assert.equal(r.total, 46);
r = budget({ ...base, instances: 5, roles: 3 }); assert.equal(r.backend, 48); assert.equal(r.total, 64); assert(has(r, 'bad', /max_connections/));
// 16 clients on one pool in transaction mode did not wait in my lab or on a hosted pooler (pool 3: 4 ran); 17 did
r = budget({ ...base, framework: 'Custom', param: 16 }); assert.equal(r.backend, 16); assert(!has(r, 'warn', /ECHECKOUTTIMEOUT/));
r = budget({ ...base, framework: 'Custom', param: 17 }); assert(has(r, 'warn', /ECHECKOUTTIMEOUT/));
// session mode refuses above the pool size
r = budget({ ...base, door: 'session pooler (5432)', instances: 2 }); assert(has(r, 'bad', /Session mode/));
// transaction mode queues (and warns about the 60 s timeout)
r = budget({ ...base, instances: 2 }); assert(has(r, 'warn', /ECHECKOUTTIMEOUT/)); assert.equal(r.backend, 16);
// direct: instances x pool: 5 copies of pg = 50 + 11 + 5 = 66 > 57
r = budget({ ...base, door: 'direct', instances: 5 }); assert.equal(r.backend, 50); assert(has(r, 'bad', /max_connections/));
// client cap is per role in my lab: 300 clients on ONE role is refused, over 2 roles only a warning
r = budget({ ...base, instances: 30 }); assert(has(r, 'bad', /client limit/)); assert(!has(r, 'warn', /ECHECKOUTTIMEOUT/));
r = budget({ ...base, instances: 30, roles: 2 }); assert(!has(r, 'bad', /client limit/)); assert(has(r, 'warn', /per role/));
// frameworks
r = budget({ ...base, framework: 'Prisma 6 (query engine)', param: 10 }); assert.equal(r.clients, 21); assert(has(r, 'warn', /pgbouncer=true/));
r = budget({ ...base, framework: 'Prisma 7 (pg adapter)' }); assert.equal(r.clients, 10);
r = budget({ ...base, framework: 'postgres.js 4' }); assert(has(r, 'warn', /prepare: false alone did not fix/));
r = budget({ ...base, framework: 'Django (default, no pool)', param: 20 }); assert.equal(r.clients, 20);
r = budget({ ...base, framework: 'Django 5.1+ OPTIONS pool=True' }); assert.equal(r.clients, 4);
// rule of thumb applies to ALL pools together: 2 roles x 15 = 30 > 24 (40% of 60 with the Data API); 1 role x 15 = 15 does not
r = budget({ ...base, roles: 2, instances: 3 }); assert(has(r, 'warn', /ALL pools together/)); r = budget(base); assert(!has(r, 'warn', /rule of thumb/));
r = budget({ ...base, usesDataApi: false, roles: 3, instances: 3 }); assert(!has(r, 'warn', /rule of thumb/)); // 45 <= 48 without the Data API
// Little's law: 100 qps x 200 ms = 20 busy backends > 10 available
r = budget({ ...base, qps: 100, queryMs: 200 }); assert(r.busy === 20); assert(has(r, 'warn', /Little/));
// Japanese messages exist
r = budget({ ...base, lang: 'ja', door: 'session pooler (5432)', instances: 2 }); assert(has(r, 'bad', /セッションモード/));
console.log('calc tests passed');
