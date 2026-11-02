// Connection budget calculator: pure functions, no network, no keys.
// Numbers for compute sizes come from the Supabase docs "Compute and Disk" (checked 2026-11-02).
// Framework defaults come from each library's documentation and from my own runs (see README).
(function (root) {
  const COMPUTE = {
    'Nano (free)': { maxConnections: 60, maxPoolerClients: 200, defaultPool: 15 },
    Micro: { maxConnections: 60, maxPoolerClients: 200, defaultPool: null },
    Small: { maxConnections: 90, maxPoolerClients: 400, defaultPool: null },
    Medium: { maxConnections: 120, maxPoolerClients: 600, defaultPool: null },
    Large: { maxConnections: 160, maxPoolerClients: 800, defaultPool: null },
    XL: { maxConnections: 240, maxPoolerClients: 1000, defaultPool: null },
  };
  // clientsPerInstance(n) = how many connections ONE running copy of your app tries to hold at its busiest.
  const FRAMEWORKS = {
    'pg (node-postgres) Pool': { note: 'Pool default max = 10', perInstance: () => 10 },
    'postgres.js': { note: 'default max = 10', perInstance: () => 10 },
    'Drizzle (on node-postgres)': { note: 'Drizzle adds no pool; it uses the driver (pg: 10)', perInstance: () => 10 },
    'Prisma 6': { note: 'default pool = CPUs x 2 + 1 (enter CPU count)', perInstance: (cpus) => cpus * 2 + 1, param: 'CPU cores of the machine running the app' },
    'SQLAlchemy 2': { note: 'pool_size 5 + max_overflow 10 = 15', perInstance: () => 15 },
    'Django 4.2': { note: 'one connection per busy thread (enter threads)', perInstance: (threads) => threads, param: 'busy threads / workers' },
    'Custom': { note: 'enter the number yourself', perInstance: (n) => n, param: 'connections per app copy' },
  };
  const DOORS = ['direct', 'session pooler (5432)', 'transaction pooler (6543)'];

  function budget({ compute, poolSize, instances, framework, param, door, servicesHeadroom }) {
    const c = COMPUTE[compute];
    const f = FRAMEWORKS[framework];
    const perInstance = f.perInstance(Number(param) || 0);
    const clients = instances * perInstance;
    const pool = Number(poolSize) || c.defaultPool || 15;
    const findings = [];
    let backend;
    if (door === 'direct') {
      backend = clients; // one Postgres connection per client
    } else {
      backend = Math.min(clients, pool);
      if (clients > c.maxPoolerClients) findings.push({ level: 'bad', text: `${clients} client connections is above the pooler client limit (${c.maxPoolerClients}).` });
      if (door.startsWith('session') && clients > pool) findings.push({ level: 'bad', text: `Session mode: ${clients} clients but pool size ${pool}. In my run the extra clients got an error (EMAXCONNSESSION), they did not wait.` });
      if (door.startsWith('transaction') && clients > pool && clients <= c.maxPoolerClients) findings.push({ level: 'ok', text: `Transaction mode: ${clients} clients share ${pool} backend connections. Extra clients wait for a free one.` });
    }
    const total = backend + servicesHeadroom;
    if (total > c.maxConnections) findings.push({ level: 'bad', text: `${backend} backend + ${servicesHeadroom} for Supabase services = ${total}, above max_connections (${c.maxConnections}).` });
    else if (total > c.maxConnections * 0.8) findings.push({ level: 'warn', text: `${total} of ${c.maxConnections} connections is above 80%. Idle pooler connections stayed open for about 3 minutes in my run.` });
    if (door === 'direct') findings.push({ level: 'warn', text: 'Direct connections need IPv6 (or the paid IPv4 add-on). My IPv4-only laptop could not resolve the host.' });
    if (!findings.some((x) => x.level === 'bad' || x.level === 'warn')) findings.push({ level: 'ok', text: 'Fits, with the numbers you entered.' });
    return { clients, backend, total, maxConnections: c.maxConnections, maxPoolerClients: c.maxPoolerClients, pool, findings, perInstance };
  }
  const api = { COMPUTE, FRAMEWORKS, DOORS, budget };
  if (typeof module !== 'undefined') module.exports = api; else root.Calc = api;
})(typeof window !== 'undefined' ? window : globalThis);
