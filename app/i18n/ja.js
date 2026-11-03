// 計算ページの日本語の文言。calc.js より前に読み込む（ブラウザ）か、テストから require する（Node）。
(function (root) {
  root.CalcI18N = root.CalcI18N || {};
  root.CalcI18N.ja = {
    fw: {
      'pg (node-postgres) Pool': { note: 'Poolの既定 max = 10' },
      'postgres.js 4': { note: '既定 max = 10。トランザクションモードでは max_pipeline: 1 を指定', txFix: 'postgres.js: max_pipeline: 1 を指定（1本の接続に2つ重ねるとハングしました）。' },
      'Drizzle (on node-postgres)': { note: '自前のプールなし。ドライバのプール（pg: 10）' },
      'Prisma 6 (query engine)': { note: '既定のプール = 物理CPUコア数 x 2 + 1', param: 'アプリを動かすマシンの物理CPUコア数', txFix: 'Prisma 6: URLに ?pgbouncer=true を付ける（無いと prepared statement "sN" does not exist）。' },
      'Prisma 7 (pg adapter)': { note: 'プールの既定 max = 10（pgドライバ）' },
      'SQLAlchemy 2': { note: 'pool_size 5 + max_overflow 10 = 15', txFix: 'SQLAlchemy + psycopg 3: prepare_threshold=None を指定（5回で自動prepareされ、トランザクションモードで壊れます）。' },
      'Django (default, no pool)': { note: 'busyなスレッドごとに1接続（リクエスト終了で閉じる）', param: '1コピーあたりのbusyなスレッド数' },
      'Django 5.1+ OPTIONS pool=True': { note: 'psycopg_poolの既定: min_size 4、max_size は min_size と同じ', txFix: 'Django + psycopg 3: OPTIONS で prepare_threshold=None を指定。' },
      Custom: { note: '自分で数を入れる', param: 'アプリ1コピーあたりの接続数' },
    },
    msg: {
      maxclients: (c, m) => `クライアント接続が${c}本で、プーラーの上限（${m}）を超えています。${m + 1}本目は即座に拒否されました（EMAXCONN）。`,
      session: (c, p) => `セッションモード: 1ロールあたりプール${p}に対してクライアント${c}本。超えた分は待たずに即エラー（EMAXCONNSESSION）です。`,
      queue: (c, p) => `トランザクションモード: 1ロールあたりバックエンド${p}本（私のラボではプールサイズ+1）をクライアント${c}本で共有。超えた分は待ち、60秒待つと ECHECKOUTTIMEOUT になります。`,
      full: (t, m) => `合計${t}が max_connections（${m}）を超えています。私のラボでは「データベースが満杯」の状態で、新しい直接接続は失敗（53300）、Data APIは503 PGRST000、プーラー経由の新規ログインまで失敗しました。`,
      high: (t, m) => `${m}のうち${t}は80%超です。クライアントが閉じたあとも、プーラーの接続は約2分残るので、ピークが重なります。`,
      rule: (p, lim) => `プールサイズ${p}は、ドキュメントの目安（${lim}: Data APIを使うなら max_connections の約40%、使わないなら最大80%）を超えています。`,
      multi: (n, p) => `プール${p}が${n}個（ロール x モード）あり、最大${n * p}本を同時に握れます。(ロール, データベース, モード) ごとに別のプールです。`,
      ipv6: '直接接続はIPv6（または有料のIPv4アドオン）が必要です。IPv4だけのPCでは、ホスト名が引けませんでした。',
      little: (b, cap) => `リトルの法則: 秒間クエリ数 x 1クエリの秒数 = 同時に使うバックエンド${b.toFixed(1)}本。使える数は${cap}本。超えると待ち行列ができ、遅くなります。`,
      littleOk: (b, cap) => `リトルの法則: 同時に使うのは約${b.toFixed(1)}本、使える数は${cap}本。`,
      fits: '入力した数なら収まります。',
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
