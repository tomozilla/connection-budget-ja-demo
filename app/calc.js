// Connection budget calculator: pure functions, no network, no keys.
// Compute-size numbers: Supabase docs "Compute and Disk" (checked 2026-11-03).
// Behaviours (errors, timeouts, pool multiplication) are from my local lab runs, see results/RESULTS.md.
(function (root) {
  const COMPUTE = {
    'Nano (free)': { maxConnections: 60, maxPoolerClients: 200, defaultPool: 15 },
    Micro: { maxConnections: 60, maxPoolerClients: 200, defaultPool: 15 },
    Small: { maxConnections: 90, maxPoolerClients: 400, defaultPool: 15 },
    Medium: { maxConnections: 120, maxPoolerClients: 600, defaultPool: 15 },
    Large: { maxConnections: 160, maxPoolerClients: 800, defaultPool: 20 },
    XL: { maxConnections: 240, maxPoolerClients: 1000, defaultPool: 20 },
  };
  // perInstance(n): how many connections ONE running copy of the app tries to hold at its busiest.
  const FRAMEWORKS = {
    'pg (node-postgres) Pool': { perInstance: () => 10 },
    'postgres.js 4': { perInstance: () => 10, txFix: true },
    'Drizzle (on node-postgres)': { perInstance: () => 10 },
    'Prisma 6 (query engine)': { perInstance: (n) => n * 2 + 1, param: true, txFix: true },
    'Prisma 7 (pg adapter)': { perInstance: () => 10 },
    'SQLAlchemy 2': { perInstance: () => 15, txFix: true },
    'Django (default, no pool)': { perInstance: (n) => n, param: true },
    'Django 5.1+ OPTIONS pool=True': { perInstance: () => 4, txFix: true },
    Custom: { perInstance: (n) => n, param: true },
  };
  const DOORS = ['direct', 'session pooler (5432)', 'transaction pooler (6543)'];
  const DATA_API_POOL = 11; // PostgREST pool 10 + 1 more, as seen in my lab and in my hosted run

  // Texts live in i18n/<lang>.js (window.CalcI18N, or globalThis in Node).
  const text = (lang) => (root.CalcI18N && (root.CalcI18N[lang] || root.CalcI18N.en)) || { fw: {}, msg: {} };
  const fwText = (name, lang) => text(lang).fw[name] || {};

  function budget(o) {
    const lang = o.lang || 'en';
    const M = text(lang).msg;
    const c = COMPUTE[o.compute];
    const f = FRAMEWORKS[o.framework];
    const perInstance = f.perInstance(Number(o.param) || 0);
    const clients = o.instances * perInstance;
    const pool = Number(o.poolSize) || c.defaultPool;
    const roles = Math.max(1, Number(o.roles) || 1);
    const modes = o.door === 'direct' ? 0 : Math.max(1, Number(o.modes) || 1);
    const dataApi = o.usesDataApi ? DATA_API_POOL : 0;
    const other = Number(o.otherServices) || 0;
    const findings = [];
    let backend;
    if (o.door === 'direct') {
      backend = clients; // one Postgres connection per client
      findings.push({ level: 'warn', text: M.ipv6 });
    } else {
      const pools = roles * modes;
      const perPool = Math.ceil(clients / pools);
      // In my lab, transaction mode ran pool size + 1 backends (16 on a pool of 15); session mode exactly the pool size.
      const eff = o.door.startsWith('transaction') ? pool + 1 : pool;
      backend = pools * Math.min(perPool, eff);
      if (pools > 1) findings.push({ level: 'warn', text: M.multi(pools, eff) });
      if (clients > c.maxPoolerClients) findings.push({ level: 'bad', text: M.maxclients(clients, c.maxPoolerClients) });
      if (o.door.startsWith('session') && perPool > pool) findings.push({ level: 'bad', text: M.session(perPool, pool) });
      if (o.door.startsWith('transaction') && perPool > eff && clients <= c.maxPoolerClients) findings.push({ level: 'warn', text: M.queue(perPool, eff) });
      if (o.door.startsWith('transaction') && f.txFix) findings.push({ level: 'warn', text: fwText(o.framework, lang).txFix });
    }
    const total = backend + dataApi + other;
    if (total > c.maxConnections) findings.push({ level: 'bad', text: M.full(total, c.maxConnections) });
    else if (total > c.maxConnections * 0.8) findings.push({ level: 'warn', text: M.high(total, c.maxConnections) });
    if (o.door !== 'direct') {
      const lim = Math.floor(c.maxConnections * (o.usesDataApi ? 0.4 : 0.8));
      if (pool > lim) findings.push({ level: 'warn', text: M.rule(pool, lim) });
    }
    let busy = null;
    if (Number(o.qps) > 0 && Number(o.queryMs) > 0) {
      busy = (Number(o.qps) * Number(o.queryMs)) / 1000;
      const cap = o.door === 'direct' ? backend : backend;
      findings.push({ level: busy > cap * 0.8 ? 'warn' : 'ok', text: (busy > cap * 0.8 ? M.little : M.littleOk)(busy, cap) });
    }
    if (!findings.some((x) => x.level === 'bad' || x.level === 'warn')) findings.push({ level: 'ok', text: M.fits });
    return { clients, backend, dataApi, other, total, maxConnections: c.maxConnections, maxPoolerClients: c.maxPoolerClients, pool, findings, perInstance, busy };
  }
  const api = { COMPUTE, FRAMEWORKS, DOORS, DATA_API_POOL, budget, fwText };
  if (typeof module !== 'undefined') module.exports = api; else root.Calc = api;
})(typeof window !== 'undefined' ? window : globalThis);
