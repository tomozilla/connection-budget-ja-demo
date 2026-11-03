// English texts for the calculator. Loaded before calc.js (browser) or required by the tests (Node).
(function (root) {
  root.CalcI18N = root.CalcI18N || {};
  root.CalcI18N.en = {
    fw: {
      'pg (node-postgres) Pool': { note: 'Pool default max = 10' },
      'postgres.js 4': { note: 'default max = 10. On the transaction pooler set max_pipeline: 1', txFix: 'postgres.js: set max_pipeline: 1 (queries pipelined on one connection hung; prepare: false alone did not fix it).' },
      'Drizzle (on node-postgres)': { note: 'No pool of its own; uses the driver (pg: 10)' },
      'Prisma 6 (query engine)': { note: 'default pool = physical CPU cores x 2 + 1', param: 'Physical CPU cores of the machine running the app', txFix: 'Prisma 6: add ?pgbouncer=true to the URL (without it: prepared statement "sN" does not exist).' },
      'Prisma 7 (pg adapter)': { note: 'pool default max = 10 (the pg driver)' },
      'SQLAlchemy 2': { note: 'pool_size 5 + max_overflow 10 = 15', txFix: 'SQLAlchemy + psycopg 3: set prepare_threshold=None (auto-prepare after 5 runs breaks on the transaction pooler).' },
      'Django (default, no pool)': { note: 'one connection per busy thread, closed per request', param: 'Busy threads / workers per copy' },
      'Django 5.1+ OPTIONS pool=True': { note: 'psycopg_pool default: min_size 4, max_size = min_size', txFix: 'Django + psycopg 3: set prepare_threshold=None in OPTIONS.' },
      Custom: { note: 'enter the number yourself', param: 'Connections per app copy' },
    },
    msg: {
      maxclients: (c, m) => `${c} client connections for one role is above the pooler client limit (${m}). In my lab client ${m + 1} was refused at once (EMAXCONN).`,
      capShared: (c, m) => `${c} clients in total is above ${m}, but spread over several roles. In my lab the cap applied per role (300 clients over 2 roles all connected). I did not test this on a hosted project.`,
      session: (c, p) => `Session mode: ${c} clients for a pool of ${p} per role. The extra clients are refused at once (EMAXCONNSESSION), they do not wait.`,
      queue: (c, p) => `Transaction mode: ${c} clients share ${p} backends per role (pool size + 1 in my lab and on a hosted pooler at pool size 3). The extra ones wait; after 60 s a waiting client gets ECHECKOUTTIMEOUT.`,
      full: (t, u, m, r) => `Total ${t} is above ${u} (max_connections ${m} minus ${r} reserved for superusers). In my lab this is the "database is full" state: new direct connections fail (53300), new pooler logins fail (EAUTHQUERY), Auth sign-in returned 500, and the Data API or Storage fail as soon as they need a new connection.`,
      high: (t, u) => `${t} of ${u} usable connections is above 80%. Idle pooler connections stayed open for about 2 minutes after the clients closed, so peaks add up.`,
      rule: (n, p, budget, lim) => `${n} pool(s) of ${p} can hold ${budget} backends together. The docs' rule of thumb (about 40% of max_connections with the Data API, up to 80% without = ${lim}) is for ALL pools together, not for one.`,
      multi: (n, p) => `${n} pools of ${p} (roles x modes) can hold ${n * p} backends at once. Each (role, database, mode) gets its own pool.`,
      ipv6: 'Direct connections need IPv6 (or the paid IPv4 add-on). An IPv4-only laptop could not resolve the host.',
      little: (b, cap) => `Little's law: ${b.toFixed(1)} busy backends needed (queries/s x seconds per query) for ${cap} available. Above that, requests queue and latency grows.`,
      littleOk: (b, cap) => `Little's law: about ${b.toFixed(1)} busy backends needed, ${cap} available.`,
      fits: 'Fits, with the numbers you entered.',
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
