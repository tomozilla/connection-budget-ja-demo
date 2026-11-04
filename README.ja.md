# connection-budget-demo

[English](README.md) | [日本語](README.ja.md)

**個人の学習記録・非公式です。** 同じ立場の作り手として自分で試した記録で、公式の案内でも、権威ある解説でもありません。

アプリは、データベースの接続をいくつ使うのか。**なぜ**その数なのか。それを調べたラボです。**Nano並みの上限にしたローカルのSupabase**に対して動かすスクリプト（Node.js、Python、Prisma 6と7）、無料のホスト版プロジェクト用のごく小さな確認、数を1つの式にまとめる小さな**接続予算の計算ページ**が入っています。

実行・確認: **2026-11-03**、Supabase CLI 2.117（Docker）、1台のPC。ほとんどはローカルです。ホスト版のプーラーは、プールサイズ3にして数本のクライアントだけで確認しました（スクリプト24。「確かめられていないこと」参照）。

## たどりついた「予算の式」

```
使っているバックエンド接続 = 直接つなぐ接続
                         + (ロール, データベース, モード) ごとのプールの min(そのプールのクライアント数, プールサイズ) の合計
                             （トランザクションモードのプールは、私の実験では プールサイズ + 1）
                         + Data APIの自前のプール（10 + LISTEN用の1本 = 11）
                         + ほかのSupabaseのサービス（Auth、Storage、Realtime、ダッシュボード）
                         → max_connections − superuser_reserved_connections（Nano / Micro は 60 − 3 = 57）に収まること

アプリが開くクライアント接続 = アプリの同時コピー数 x ライブラリのプールサイズ
                         → プーラーのクライアント上限（Nano / Micro は200。私のラボではロールごと）に収まること

同時に使うバックエンド数 = 秒間クエリ数 x 1クエリの秒数      （リトルの法則）
```

Supabaseのドキュメント（Connection management）の目安: Data APIをよく使うなら、プールサイズは `max_connections` の約40%以下、使わないなら最大約80%。1つのプールではなく、全部のプールの合計に対する数字として読んでください。

## ファイル

| パス | 内容 |
|---|---|
| `lab/config.example.toml` | Free/Nano相当にする `[db.settings]` と `[db.pooler]`（サイズの考え方つき） |
| `lab/setup.sql`、`setup-services.sql`、`setup-leak.sql` | テスト用ロール `r1`〜`r4`、`slow(s)`、`ping()`。Storageのバケット。RLSの漏れの実験用オブジェクト（ローカルのラボ専用） |
| `scripts/node/` | `lib.mjs` と、番号つきのテスト01〜24（下の表） |
| `scripts/python/` | psycopg 3の自動prepare、SQLAlchemy、Django、ライブラリの待ち |
| `scripts/prisma6/`, `scripts/prisma7/` | Prismaのテスト（プールが埋まったときの動きも。`pool-timeout`）。それぞれ `package.json` あり |
| `results/RESULTS.md` | 測った数字すべてと、出したスクリプト |
| `results/upstream-issue-drafts.md` | 2つの挙動についての、報告文の下書き。**まだ報告していません** |
| `app/` | 計算ページ（素のHTML/JS、ビルド不要、通信なし、鍵なし）。`index.html`、`calc.js`、`board.js`、`i18n/` |
| `app/test-calc.js` | 計算ロジックのテスト: `npm test` |
| `ja/app/index.html` | 日本語のページ（`app/calc.js` と `app/i18n/ja.js` を使う） |

## ラボを動かす

```
supabase init                      # 空の作業フォルダで
# lab/config.example.toml を supabase/config.toml に足してから:
supabase start -x edge-runtime,logflare,vector,imgproxy,mailpit
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f lab/setup.sql
```

`max_connections` は `[db.settings]` に書きます。以前に `alter system set max_connections` を実行したことがあれば、先に `alter system reset max_connections` して再起動してください（`postgresql.auto.conf` が設定ファイルより優先されます）。

すでに別のローカルSupabaseが動いているPCでは、設定のポートを変えて、スクリプトには環境変数で渡します: `LAB_DB_PORT`、`LAB_POOLER_PORT`、`LAB_API_PORT`（既定は54322、54329、54321）、ほかに `LAB_HOST`、`LAB_TENANT`（既定 `pooler-dev`）、`LAB_PASSWORD`（CLIのローカル開発用パスワード。本物のデータベースには使わないでください）、`LAB_PUBLISHABLE_KEY`（ローカルの**公開用（publishable）**キー。スクリプト16と23用。secretやservice_roleキーは使いません）。

任意の追加:
- **セッションモードのポート**: プーラーのコンテナは、ポート5432でセッションモードも提供しています（`PROXY_PORT_SESSION=5432`）。転送用のコンテナで公開して、`LAB_SESSION_PORT` を指定します:
  `docker run -d --rm --name lab_session_port -p 54430:5432 --network supabase_network_<project_id> alpine/socat tcp-listen:5432,fork,reuseaddr tcp-connect:supabase_pooler_<project_id>:5432`
- **PgBouncer**（スクリプト17、`LAB_PGBOUNCER_PORT`）: `docker run -d --name lab_pgbouncer --network supabase_network_<project_id> -p 54431:5432 -e DB_HOST=supabase_db_<project_id> -e DB_USER=r1 -e DB_PASSWORD="$LAB_PASSWORD" -e POOL_MODE=transaction -e AUTH_TYPE=scram-sha-256 -e DEFAULT_POOL_SIZE=15 -e MAX_CLIENT_CONN=200 edoburu/pgbouncer:latest`

```
npm install                                # pg 8.23.1、postgres 4.0.0
node scripts/node/01-postgresjs-hang.mjs pooler '{"max_pipeline":1}'
node scripts/node/03-roles-and-pools.mjs 3 6 probe      # ロール3つ、クエリは6秒保持、満杯のデータベースを確かめる
python3 -m venv venv && ./venv/bin/pip install "psycopg[binary,pool]" sqlalchemy "django>=5.2,<5.3"
./venv/bin/python scripts/python/01-psycopg-prepare.py
cd scripts/prisma6 && npm install && npx prisma generate && node run.cjs "<?pgbouncer=true つきのプーラーURL>"
```

接続数を数えるテストの合間には、プーラーのコンテナを再起動してください（アイドルの接続は約2分残ります）。03、07、13、22は状態を残します（漏れた設定、アドバイザリロック、握ったままの接続）。次のテストの前に再起動を。スクリプト08は、`max_connections` を90より上げる必要があります（私は `alter system set max_connections=150` と再起動、終わったら `alter system reset`）。スクリプト18の `monitor` は、`alter system set reserved_connections = 3` と再起動が要ります（終わったら戻す）。

ローカルのプーラーは**一度に1つのモード**です（`pool_mode` を変えて再起動）。上の転送コンテナで、同じコンテナのもう一方のポートに届くので、テスト13は両方を同時に流せます。

| スクリプト | 試すこと |
|---|---|
| `01-postgresjs-hang` | postgres.js、20並列。`prepare` と `max_pipeline` |
| `02-client-limit` | プーラーのクライアント200本目と201本目 |
| `03-roles-and-pools` | Nロール x 20クライアント。ロールごとのバックエンド数。`probe` は満杯のときに何が失敗するか |
| `04-queue-timeout` | クエリを握るクライアント。60秒のチェックアウト。`LAB_MODE=session` |
| `05-idle-in-transaction` | `BEGIN` して止まる。`idle_in_transaction_session_timeout` |
| `06-data-api-pool` | PostgREST経由の並列RPC。10秒の `PGRST003` |
| `07-state-leak`, `07b-...` | プーラー越しの `SET`、`set_config`、アドバイザリロック、prepared statement、LISTEN |
| `08-instances` | プロセス数 x プールサイズ = 直接のバックエンド数 |
| `09-latency` | 閉じたループ。クライアント数ごとの毎秒の回数、p50、p95 |
| `10-pool-error` | 切られたアイドル接続と `error` ハンドラ |
| `11-linger` | プーラーのアイドル接続が残る時間 |
| `12-backend-detail` | プールのバックエンドとPostgRESTの接続の正体（`pg_stat_activity`） |
| `13-two-modes` | 1つのロールで、トランザクションとセッションのポートを同時に |
| `14-client-cap-scope` | クライアント上限200は、ロールごとか |
| `15-postgresjs-repeat` | postgres.jsで、同じクエリを接続ごとに繰り返す |
| `16-full-database-services` | データベースが満杯のときの、Authのサインイン、Storage、Data API。回復までの時間 |
| `17-pgbouncer-compare` | 同じ検査を、PgBouncerに |
| `18-guardrails` | `limit [n]`（ロールの接続上限。プールサイズと、プールサイズ + 1で比べる）、`timeouts`、`cron`（クライアントが `SET` で外せない `pg_cron` の後ろ盾）、`monitor`（`pg_use_reserved_connections`） |
| `19-library-waits` | node-postgresの待ち（ほかのライブラリは、Pythonの04、05と、Prisma 6の `pool-timeout.cjs`） |
| `20-timeout-prediction` | 199クライアント。待ちと60秒の上限 |
| `21-open-loop` | 到着が一定の速さで続く。1リクエストごとに接続 |
| `22-leak-rls`, `23-data-api-no-leak` | 漏れた設定が、漏れた行になる。Data APIとの対照 |
| `25-postgresjs-retry` | postgres.jsが送るParseメッセージと、見えるエラーを数える。ハングやエラーが出ないのは、黙ったやり直しのせいか |
| `26-begin-pipeline` | `max_pipeline` が 0 と 1 のとき、`sql.begin()` はトランザクションプーラーで動くか。目印の値と、トランザクションが1本のバックエンドに留まるかを確認 |
| `27-mismatch` | ドキュメントのもう1つの警告「食い違った行」を探す。1クエリごとに違う目印を送り、返りを全部照合する（ハングはハングとして報告） |
| `24-hosted-tiny` | **ホスト版の無料プロジェクト専用**。プールサイズ3、数本のクライアント（下記） |
| `28-hosted-lifetime` | **ホスト版専用**。クライアントが去ったあと接続が何秒残るか（`lifetime`）、「1本は維持される」の確認（`hot`）、セッションモードは本当にすぐ閉じるか（`session`） |
| `29-recovery` | **ラボ専用。わざと `max_connections` を満杯にします**。満杯のとき誰がつなげるか（`getin`）、アイドル接続を切って復旧時間を測る（`terminate`）、開いたままのトランザクションとその時間制限（`idletx`） |
| `30-pool-help` | 「プールサイズを上げればいいのか」。同じ約100ミリ秒を、待つ形（`wait`）とCPUを使う形（`cpu`）で比べる。1回測って、プールサイズを上げて、もう1回測る |

## ホスト版の確認（スクリプト24）
使い捨ての**無料**プロジェクトで、Database settingsの**プールサイズを3**にしてから、だけです。自分で作ったパスワードのテスト用ログインロールと、小さな関数2つ（`probe_sleep(numeric)` と、公開用キーに許可した接続数カウント用の関数）をSQL Editorで作り、`node scripts/node/24-hosted-tiny.mjs modes`、`... postgresjs '<オプションのJSON>'`（1回に1パターン）、`... checkout`（5クライアントで約70秒）を実行して、ロールと関数を消し、プールサイズを元（Nanoなら15）に戻します。環境変数は `PROJECT_REF`、`POOLER_HOST`、`PROBE_PASSWORD`、`PUBLISHABLE_KEY`。スクリプトは、手軽さのために `ssl: { rejectUnauthorized: false }` を使い、証明書を検証しません。

## 分かったこと（詳細は `results/RESULTS.md`）

- **(ロール, データベース, モード) ごとに別のプール。** 1つのロールで両方のポートを使うと、16 + 15 = 31本。ホスト版のプールサイズ3では、4 + 3。ドキュメントには「2つのポートで共有」と「ユーザー・DB・モードごと」の両方がありました。ダッシュボードは「per user+db」。
- **トランザクションモードは、プールサイズ + 1**（15で16、ホスト版は3で4）。セッションモードはちょうどプールサイズ、PgBouncer 1.26.1は15ちょうど。余分な1本の理由は分かりません。
- **ロールは掛け算:** 2ロールで16 + 16、3ロールでラボが満杯（87 / 87）。
- **クライアント上限の200は、私のラボではロールごと**（2ロールで300本、全部つながった）。Supavisorのソース（`main`、2026-11-03）は、プール（ロール × モード）ごとにクライアント数を `max_clients` と比べています。ホスト版の `max_clients` の値そのものは見ていません。
- **満杯になると、新しい接続が要るものから失敗:** 直接接続（53300）、プーラーのログイン（`EAUTHQUERY`）、**Authのサインイン（500）**。Data APIとStorageは、開いている接続で足りる間は動いた。重いクライアントが止まったあと、サインインは約62秒で回復。**この順番はラボ固有**（次の項目）。
- **ホスト版のサービスは、使われると接続を持つ**（Pro／Micro、2026-11-04）。何もしていないとき: Auth 0本、Storage 0本。サインイン40本同時のあと `supabase_auth_admin` が**9〜10本**（約1分で手放す）。公開バケットへのリクエスト40本同時のあと `supabase_storage_admin` が**8本**（14分後も保持）。つまりホスト版のAuthは温かいプールを持つので、最初に倒れるとは限らない。Storageは、一度使うと57本のうち約8本を使い続ける。
- **Microの `max_connections` はNanoと同じ60**（Pro／Microのプロジェクトで実測）。プランを上げても接続は増えず、増えるのはコンピュートサイズを上げたときだけ。実際にMicro → Smallへ上げると `max_connections` は**90**、クライアント上限は**400**になりましたが、**プールサイズは15のまま**でした（インスタンスを上げても、プールは自分で広げる必要があります）。`superuser_reserved_connections` はNano／Micro／Smallのいずれも3、`reserved_connections` は0（どちらもドキュメントには値の記載なし）。
- **クライアント上限200は、ホスト版でも「ロールごと」でした。** 使い捨てのホスト版プロジェクトで実測（2026-11-04、クエリなしの接続のみ）: 1ロールで215本 → ちょうど**200本**成功、残りは `(EMAXCONN) max client connections reached, limit: 200`。**2ロールで150本ずつ → 300本すべて成功、拒否ゼロ**。設定画面の「200に固定」は、1つのプールあたりの値です。
- **ただしクライアントの枠は、足りなくなる資源ではありません。** その300本が握っていたバックエンドは**2本**だけ（ロールごとに1本）。ロールを分けるとクライアントの枠は増えますが、バックエンドの枠は1本も増えません。
- **プールサイズの変更は、再起動なしで即座に効きます。** ホスト版で、8秒のクエリを10クライアントが投げたとき、プールサイズ3では**25.3秒**（バックエンド4本）、15では**9.3秒**（10本）。間はダッシュボードで変えただけです。
- **postgres.jsと `sql.begin()`:** `max_pipeline: 1` はハングを直し、`sql.begin()` を壊さなかった（値の食い違い0、トランザクションの分断0、繰り返し確認）。`max_pipeline: 0` は4.0.0では `42P05 prepared statement already exists`（ドキュメントが書く `UNSAFE_TRANSACTION` ではない。該当する上流のissueは2026-10-29にcompletedで閉じ、同じ日に4.0.0が公開された）。`prepare: false` を足せば動くが100倍以上遅い（19ミリ秒 → 2029ミリ秒）。**ドキュメントが警告する「食い違った行」は、1件も再現できなかった**（先にハングする）。
- **接続が消えるまで:** FAQは「トランザクションモードは5分、セッションモードはすぐ、クライアントがいる間は最低1本維持」と書く。実測は、ラボもホスト版Proも**約2分**（106秒で6本、122秒で0本）。「1本維持」は確認できた（アイドルのクライアント1本で、137秒後も1本）。セッションモードは**すぐ閉じなかった**（3分以上残り、再利用された）。見積もりは、大きいほうの5分で。
- **待ち:** トランザクションモードは待たせて、**60秒**で諦める（`ECHECKOUTTIMEOUT`。ホスト版でも）。セッションモードは、FAQでは待たせるとあるのに、超えた分を即座に拒否（`EMAXCONNSESSION`）。予想 `(クライアント数 − バックエンド数) ÷ バックエンド数 × クエリの秒数` が当たった: 199クライアント、4.5秒のクエリはエラーなし、5.5秒のクエリは46件がタイムアウト。
- **オープンループ:** 毎秒200回の到着（処理能力は約150回）で、遅延が4秒で0.23秒から1.26秒に上がり、その後は到着の約4分の1が `EMAXCONN`。
- **Data APIにも自前のプール**（10 + `LISTEN "pgrst"` の1本）。2.5秒の呼び出しを50本同時: 40本成功、10本がちょうど10秒で `504 PGRST003`。`anon` には `statement_timeout=3s`。
- **postgres.js 4.0.0がトランザクションモードでハングする原因はパイプライン**で、prepared statementではありません（ラボもホスト版も）。`prepare:false` だけではハングし、`max_pipeline:1` だけで直ります。同じクエリを3000回繰り返しても同じ。PgBouncer 1.26.1ではハングしませんでした。
- **Supavisorのトランザクションモードでprepared statementが壊れる**: `?pgbouncer=true` なしのPrisma 6、5回目から自動prepareされるpsycopg 3（直し方は `prepare_threshold=None`）。Prisma 7のpgアダプタ、node-postgres、postgres.js（`max_pipeline: 1`）は壊れませんでした。
- **トランザクションモードでは、セッションの状態が別のクライアントに漏れる**（PgBouncerでも）: `set_config(..., false)` は8回中8回、`SET statement_timeout = 0` はガードレールを静かに外し、RLSのポリシー越しに、ユーザーの設定を忘れたリクエストへAliceの行が見えました。`SET ROLE r_admin` は権限が漏れました。`set_config(..., true)` は漏れません。Data APIは漏れませんでした（40本の混在で0件）。
- **ライブラリの既定値と待ち:** Prisma 6は コア数x2+1（10コアで21）、Prisma 7 + pgは10、SQLAlchemyは5+10、psycopg_poolは4、Django 5.2の `pool=True` は4。待ちは、pgは無制限、Prisma 6は10秒、psycopg_poolとSQLAlchemyは30秒。
- **ガードレール:** ロールの `connection limit` は、1つのロールを止めて、すぐ断る。ロールの `statement_timeout` は、クライアントに外される。`reserved_connections` + `pg_use_reserved_connections` で、満杯でも監視ロールが入れた（ラボ）。
- **ピークだけでなく遅延も:** スループットは「約16 / クエリ時間」で頭打ち。超えた分のクライアントは待ちが増えるだけ。リトルの法則が上限を言い当てました。
- **失敗時:** node-postgresのプールは、`error` ハンドラがないと、データベースがアイドル接続を切った瞬間にプロセスごと落ちます。SQLAlchemyは `pool_pre_ping` が要ります。
- **プーラーに接続が残る時間:** クライアントが閉じてから、ローカルで約2分。

## 費用
- **0ドル。** ラボは自分のPC（Docker）で動き、ホスト版の確認は無料プロジェクトでした。ホスト版の数字（Supabaseのドキュメント、2026-11-03）: Nanoは無料。有料プランの最小はMicroで月約10ドル、上限はNanoと同じ（直接60、プーラーのクライアント200、プールサイズ15）。Smallは約15ドル（90 / 400）、Mediumは約60ドル（120 / 600）、Largeは約111ドル（160 / 800）、XLは約210ドル（240 / 1000）。Proプランは月25ドルで、組織ごとに10ドル分のコンピュートクレジットが含まれ、Micro 1プロジェクト分をまかないます。プランを上げるだけでは接続の余裕は増えません。増えるのは、コンピュートのサイズを上げたときだけです。コンピュートは時間単位で課金され、Spend Capの対象外です。

## セキュリティ上の注意
- ラボはCLIのローカル開発用のパスワードと鍵を使います。本物のデータのある本物のデータベースに、このスクリプトを向けないでください。セットアップSQLはごく簡単なパスワードのログインロールを作ります（ローカル専用）。
- Data APIの関数 `slow()` は `anon` が呼べます。こういう遅い関数を公開すると、外部の人にData APIのプールを握られます。本物のプロジェクトでは公開しないでください。
- スクリプトが必要とするのは**公開用（publishable）**キーだけです。secretやservice_roleキーは、ここには絶対に置かないでください。

## 確かめられていないこと
- **プールサイズ3より先のホスト版:** クライアント接続数のグラフ、クライアント上限がロールごとかどうか、PostgRESTのプール設定、満杯のときのStudio、**本当の上限に近いホスト版の負荷（ホスト版のデータベースは一度も満杯にしていません。共有の設備なので、「何から止まるか」はすべてラボの結果です）**、満杯のときにホスト版のAuthがどこまで粘るか。
- **ホスト版の専用プーラーは未検証:** ここのPgBouncerはコンテナの既定値です。ホスト版の専用プーラーは既定でIPv6のみで、IPv4だけの回線からはIPv4アドオン（月4ドル）が必要なため、設定画面を読むだけにしました。
- **Storageの経路:** SupavisorのFAQには、StorageもSupavisorを独自の user+db+mode として使うとあります。私が測ったプロジェクトでは、Storageの接続の `application_name` は `Supabase Storage API` で、`Supavisor` ではありませんでした。1プロジェクト・1回の観察です。
- **ホスト版の専用プーラーではありません:** ここのPgBouncerは、イメージの既定値のコンテナです。
- **Supavisorの設定:** CLIのテナントには、prepared statementの切り替えがなく、私も見つけられませんでした。ホスト版のテナント設定は分かりません。新しい版では挙動が違うかもしれません。
- Rails、postgres.jsを使うEdge Function、Npgsql、pgx、HikariCP。Nanoより大きいコンピュートサイズ（数字はドキュメント）。リージョンをまたぐ遅延。プラットフォームのリクエスト上限。
- 各実験は多くても数回。遅延の表は、1マスあたり6秒の1回です。
- バージョン: pg 8.23.1、postgres 4.0.0、Prisma 6.19.3 と 7.10.1、psycopg 3.3.6（psycopg_pool 3.3.3）、SQLAlchemy 2.1.6、Django 5.2.18、Node 24、Python 3.14、Supabase CLI 2.117.0、Supavisor 2.9.12、PostgREST 16.2、PostgreSQL 17、PgBouncer 1.26.1。

## 後片付け
作業フォルダで `supabase stop` して、フォルダを消します。`alpine/socat` とPgBouncerのコンテナも消します。ホスト版では、テスト用のロールと関数を消し、プールサイズを元に戻します。

## ライセンス
MIT。`LICENSE` を見てください。
