// 接続数の見積もり計算機：純粋な関数だけ。通信もキーもなし。
// コンピュートサイズごとの上限は、Supabaseのドキュメント「Compute and Disk」から（2026-11-02確認）。
// フレームワークの既定値は、各ライブラリの説明と私の実行から（READMEを参照）。
(function (root) {
  const COMPUTE = {
    'Nano (free)': { maxConnections: 60, maxPoolerClients: 200, defaultPool: 15 },
    Micro: { maxConnections: 60, maxPoolerClients: 200, defaultPool: null },
    Small: { maxConnections: 90, maxPoolerClients: 400, defaultPool: null },
    Medium: { maxConnections: 120, maxPoolerClients: 600, defaultPool: null },
    Large: { maxConnections: 160, maxPoolerClients: 800, defaultPool: null },
    XL: { maxConnections: 240, maxPoolerClients: 1000, defaultPool: null },
  };
  // perInstance = アプリ1つ分が、いちばん忙しいときに持とうとする接続の数。
  const FRAMEWORKS = {
    'pg (node-postgres) Pool': { note: 'Poolの既定は最大10', perInstance: () => 10 },
    'postgres.js': { note: '既定は最大10', perInstance: () => 10 },
    'Drizzle (on node-postgres)': { note: 'Drizzle自体にはプールがなく、ドライバー（pg: 10）に従う', perInstance: () => 10 },
    'Prisma 6': { note: '既定のプールは CPU数 x 2 + 1（CPU数を入れる）', perInstance: (cpus) => cpus * 2 + 1, param: 'アプリを動かすマシンのCPUコア数' },
    'SQLAlchemy 2': { note: 'pool_size 5 + max_overflow 10 = 15', perInstance: () => 15 },
    'Django 4.2': { note: '忙しいスレッドごとに1本（スレッド数を入れる）', perInstance: (threads) => threads, param: '忙しいスレッド／ワーカーの数' },
    'Custom': { note: '数を自分で入れる', perInstance: (n) => n, param: 'アプリ1つあたりの接続数' },
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
      if (clients > c.maxPoolerClients) findings.push({ level: 'bad', text: `クライアント接続${clients}本は、プーラーのクライアント上限（${c.maxPoolerClients}）を超えています。` });
      if (door.startsWith('session') && clients > pool) findings.push({ level: 'bad', text: `セッションモード：クライアント${clients}本に対して、プールサイズは${pool}。私の実行では、超えた分は待たされず、エラー（EMAXCONNSESSION）になりました。` });
      if (door.startsWith('transaction') && clients > pool && clients <= c.maxPoolerClients) findings.push({ level: 'ok', text: `トランザクションモード：クライアント${clients}本が、バックエンド接続${pool}本を分け合います。超えた分は、空くまで待ちます。` });
    }
    const total = backend + servicesHeadroom;
    if (total > c.maxConnections) findings.push({ level: 'bad', text: `バックエンド${backend} + Supabase自身の分${servicesHeadroom} = ${total}で、max_connections（${c.maxConnections}）を超えています。` });
    else if (total > c.maxConnections * 0.8) findings.push({ level: 'warn', text: `${c.maxConnections}本中${total}本で、80%を超えています。私の実行では、使われなくなったプーラーの接続が約3分残りました。` });
    if (door === 'direct') findings.push({ level: 'warn', text: 'ダイレクト接続にはIPv6（または有料のIPv4アドオン）が必要です。IPv4だけの私のノートPCでは、ホストを解決できませんでした。' });
    if (!findings.some((x) => x.level === 'bad' || x.level === 'warn')) findings.push({ level: 'ok', text: '入力した数字なら、収まります。' });
    return { clients, backend, total, maxConnections: c.maxConnections, maxPoolerClients: c.maxPoolerClients, pool, findings, perInstance };
  }
  const api = { COMPUTE, FRAMEWORKS, DOORS, budget };
  if (typeof module !== 'undefined') module.exports = api; else root.Calc = api;
})(typeof window !== 'undefined' ? window : globalThis);
