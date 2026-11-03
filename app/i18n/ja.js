// 計算ページの日本語の文言。calc.js より前に読み込む（ブラウザ）か、テストから require する（Node）。
(function (root) {
  root.CalcI18N = root.CalcI18N || {};
  root.CalcI18N.ja = {
    fw: {
      'pg (node-postgres) Pool': { note: 'Poolの既定 max = 10' },
      'postgres.js 4': { note: '既定 max = 10。トランザクションモードでは max_pipeline: 1 を指定', txFix: 'postgres.js: max_pipeline: 1 を指定（1本の接続に複数のクエリを重ねるとハングしました。prepare: false だけでは直りませんでした）。' },
      'Drizzle (on node-postgres)': { note: '自前のプールなし。ドライバのプール（pg: 10）' },
      'Prisma 6 (query engine)': { note: '既定のプール = 物理CPUコア数 x 2 + 1', param: 'アプリを動かすマシンの物理CPUコア数', txFix: 'Prisma 6: URLに ?pgbouncer=true を付ける（無いと prepared statement "sN" does not exist）。' },
      'Prisma 7 (pg adapter)': { note: 'プールの既定 max = 10（pgドライバ）。待ちの上限は既定でなし: connectionTimeoutMillis を付ける（Prisma 6は10秒で諦めた）' },
      'SQLAlchemy 2': { note: 'pool_size 5 + max_overflow 10 = 15', txFix: 'SQLAlchemy + psycopg 3: prepare_threshold=None を指定（5回で自動prepareされ、トランザクションモードで壊れます）。' },
      'Django (default, no pool)': { note: 'busyなスレッドごとに1接続（リクエスト終了で閉じる）', param: '1コピーあたりのbusyなスレッド数' },
      'Django 5.1+ OPTIONS pool=True': { note: 'psycopg_poolの既定: min_size 4、max_size は min_size と同じ', txFix: 'Django + psycopg 3: OPTIONS で prepare_threshold=None を指定。' },
      Custom: { note: '自分で数を入れる', param: 'アプリ1コピーあたりの接続数' },
    },
    msg: {
      maxclients: (c, m) => `1つのロールで、クライアント接続が${c}本です。プーラーの上限（${m}）を超えています。私のラボでは${m + 1}本目が即座に拒否されました（EMAXCONN）。`,
      capShared: (c, m) => `合計${c}本は${m}を超えていますが、複数のロールに分かれています。私のラボでは上限がロールごとでした（2ロールで300本、全部つながりました）。ホスト版では確かめていません。`,
      session: (c, p) => `セッションモード: 1ロールあたりプール${p}に対してクライアント${c}本。超えた分は待たずに即エラー（EMAXCONNSESSION）です。`,
      queue: (c, p) => `トランザクションモード: 1ロールあたりバックエンド${p}本（プールサイズ+1。私のラボと、プールサイズ3にしたホスト版で確認）をクライアント${c}本で共有。超えた分は待ち、60秒待つと ECHECKOUTTIMEOUT になります。`,
      full: (t, u, m, r) => `合計${t}が${u}（max_connections ${m} から、管理者用の予約${r}本を引いた数）を超えています。私のラボでは「データベースが満杯」の状態で、新しい直接接続は失敗（53300）、プーラー経由の新規ログインも失敗（EAUTHQUERY）、Authのサインインは500、Data APIとStorageは、新しい接続が要った時点で失敗しました。`,
      high: (t, u) => `使える${u}本のうち${t}本は80%超です。クライアントが閉じたあとも、プーラーの接続は約2分残るので、ピークが重なります。`,
      rule: (n, p, budget, lim) => `プール${p}が${n}個あり、合わせて${budget}本を握れます。ドキュメントの目安（Data APIを使うなら max_connections の約40%、使わないなら最大80% = ${lim}）は、1つのプールではなく、全部のプールの合計に対するものです。`,
      multi: (n, p) => `プール${p}が${n}個（ロール x モード）あり、最大${n * p}本を同時に握れます。(ロール, データベース, モード) ごとに別のプールです。`,
      ipv6: '直接接続はIPv6（または有料のIPv4アドオン）が必要です。IPv4だけのPCでは、ホスト名が引けませんでした。',
      little: (b, cap) => `リトルの法則: 秒間クエリ数 x 1クエリの秒数 = 同時に使うバックエンド${b.toFixed(1)}本。使える数は${cap}本。超えると待ち行列ができ、遅くなります。`,
      littleOk: (b, cap) => `リトルの法則: 同時に使うのは約${b.toFixed(1)}本、使える数は${cap}本。`,
      fits: '入力した数なら収まります。',
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
