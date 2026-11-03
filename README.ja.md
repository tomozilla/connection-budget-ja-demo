# connection-budget-demo

[English](README.md) | [日本語](README.ja.md)

**個人の学習記録・非公式です。** 同じ立場の作り手として自分で試した記録で、公式の案内でも、権威ある解説でもありません。

アプリは、データベースの接続をいくつ使うのか。**なぜ**その数なのか。それを調べたラボです。**Nano並みの上限にしたローカルのSupabase**に対して動かすスクリプト（Node.js、Python、Prisma 6と7）と、数を1つの式にまとめる小さな**接続予算の計算ページ**が入っています。

実行・確認: **2026-11-03**、Supabase CLI 2.117（Docker）、1台のPC。この版では**ホスト版のプロジェクトでは何も動かしていません**（「確かめられていないこと」参照）。

## たどりついた「予算の式」

```
使っているバックエンド接続 = 直接つなぐ接続
                         + (ロール, データベース, モード) ごとのプールの min(そのプールのクライアント数, プールサイズ) の合計
                         + Data APIの自前のプール（私の実験では約11本）
                         + ほかのSupabaseのサービス（Auth、Storage、Realtime、ダッシュボード）
                         → max_connections（Nano / Micro は60）に収まること

アプリが開くクライアント接続 = アプリの同時コピー数 x ライブラリのプールサイズ
                         → プーラーのクライアント上限（Nano / Micro は200）に収まること

同時に使うバックエンド数 = 秒間クエリ数 x 1クエリの秒数      （リトルの法則）
```

Supabaseのドキュメント（Connection management）の目安: Data APIをよく使うなら、プールサイズは `max_connections` の約40%以下、使わないなら最大約80%。

## ファイル

| パス | 内容 |
|---|---|
| `lab/config.example.toml` | Free/Nano相当にする `[db.pooler]` の設定（と `max_connections` の手順） |
| `lab/setup.sql` | テスト用ロール `r1`〜`r4`、`slow(s)` 関数、`ping()` 関数（ローカルのラボ専用） |
| `scripts/node/` | `lib.mjs` と、番号つきのテスト01〜11（`results/RESULTS.md`参照） |
| `scripts/python/` | psycopg 3 の自動prepare、SQLAlchemy 2、Django 5.2 |
| `scripts/prisma6/`, `scripts/prisma7/` | Prismaのテスト（それぞれ `package.json` あり） |
| `results/RESULTS.md` | 測った数字すべてと、出したスクリプト |
| `app/index.html`, `app/calc.js`, `app/board.js` | 計算ページ（素のHTML/JS、ビルド不要、通信なし、鍵なし） |
| `app/test-calc.js` | 計算ロジックのテスト: `npm test` |
| `ja/app/index.html` | 日本語のページ（`calc.js` は共通） |

## ラボを動かす

```
supabase init                      # 空の作業フォルダで
# lab/config.example.toml を supabase/config.toml に足してから:
supabase start -x gotrue,realtime,storage-api,imgproxy,mailpit,studio,edge-runtime,logflare,vector,postgres-meta
docker exec supabase_db_<project_id> psql -U supabase_admin -d postgres -c "alter system set max_connections=60"
docker restart supabase_db_<project_id>        # そのあとプーラーとrestのコンテナも再起動
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f lab/setup.sql
```

すでに別のローカルSupabaseが動いているPCでは、設定のポートを変えて、スクリプトには環境変数で渡します: `LAB_DB_PORT`、`LAB_POOLER_PORT`、`LAB_API_PORT`（既定は54322、54329、54321）、ほかに `LAB_HOST`、`LAB_TENANT`（既定 `pooler-dev`）、`LAB_PASSWORD`（CLIのローカル開発用パスワード。本物のデータベースには使わないでください）。

```
npm install                                # pg 8.23.1、postgres 4.0.0
node scripts/node/01-postgresjs-hang.mjs pooler '{"max_pipeline":1}'
node scripts/node/03-roles-and-pools.mjs 2 6 probe       # ロール2つ、クエリは6秒保持、満杯のデータベースを確かめる
python3 -m venv venv && ./venv/bin/pip install "psycopg[binary,pool]" sqlalchemy "django>=5.2,<5.3"
./venv/bin/python scripts/python/01-psycopg-prepare.py
cd scripts/prisma6 && npm install && npx prisma generate && node run.cjs "<?pgbouncer=true つきのプーラーURL>"
```

接続数を数えるテストの合間には、データベースとプーラーのコンテナを再起動してきれいな状態に戻してください（アイドルの接続は約2分残ります）。03と07は状態を残します（漏れた `SET`、アドバイザリロック、握ったままの接続）。次のテストの前に再起動を。

ローカルのプーラーは**一度に1つのモード**です（`pool_mode` を変えて再起動）。スクリプトのData APIリクエストには `apikey` ヘッダーを付けていません（ローカルでは通ったため）。ホスト版では、プロジェクトの公開用（publishable）キーが必要です。**service_roleキーは絶対に使わないでください。**

## 分かったこと（2026-11-03、ラボ。詳細は `results/RESULTS.md`）

- **(ロール, データベース, モード) ごとに別のプール**。プールサイズ15のロールが2つなら、最大30本。60本のデータベースでは、これで「満杯」になります。（ドキュメントには「2つのポートで共有」という書き方と「ユーザー・DB・モードごと」という書き方の両方がありました。）
- **満杯になると**: 新しい直接接続は失敗（53300）、Data APIは `503 PGRST000`、プーラー経由の新規ログインも `EAUTHQUERY` で失敗。
- **クライアント上限**: 200本目は入り、201本目は即座に拒否（`EMAXCONN`）。
- **待ち**: トランザクションモードは待たせて、**60秒**で諦める（`ECHECKOUTTIMEOUT`）。セッションモードは、FAQでは「最大1分待たせる」とあるのに、私の環境では超えた分を即座に拒否（`EMAXCONNSESSION`）。
- **Data APIにも自前のプール**（10 + 1本）。2.5秒の呼び出しを50本同時: 40本成功、10本がちょうど10秒で `504 PGRST003`。`anon` には `statement_timeout=3s` もあります。
- **postgres.js 4.0.0がトランザクションモードでハングする原因はパイプライン**で、prepared statementではありません。`prepare:false` だけではハングし、`max_pipeline:1` だけで直ります。
- **トランザクションモードでprepared statementが壊れる**: `?pgbouncer=true` なしのPrisma 6、5回同じクエリを流したあとのpsycopg 3（直し方は `prepare_threshold=None`）。Prisma 7のpgアダプタとnode-postgresは壊れませんでした。
- **トランザクションモードでは、セッションの状態が別のクライアントに漏れる**: `SET` と `set_config(..., false)` は8回中8回漏れました。`set_config(..., true)`（トランザクション内だけ）を使います。セッションのアドバイザリロックとLISTEN/NOTIFYも、期待どおりには動きません。
- **ライブラリの既定が掛け算になる**: pg Pool 10 のプロセス5つ = 直接接続50本。Prisma 6 は コア数x2+1（10コアで21）、Prisma 7 + pg は10、SQLAlchemy は5+10、Django 5.2 は既定でプールなし、`pool=True` で4。
- **ピークだけでなく遅延も**: スループットは「約16 / クエリ時間」で頭打ち。超えた分のクライアントは待ちが増えるだけ（1秒のクエリ、100クライアントでp50が6秒）。リトルの法則が上限を言い当てました。
- **失敗時**: node-postgresのプールは、`error` ハンドラがないと、データベースがアイドル接続を切った瞬間にプロセスごと落ちます。SQLAlchemyは `pool_pre_ping` が要ります。
- **プーラーに接続が残る時間**: クライアントが閉じてから、ローカルで約2分。
- **説明できていないこと**: プールサイズ15のロール1つで、トランザクションモードでは**16本**が使われました（セッションモードは15本）。

## 費用
- **$0。** ラボは自分のPC（Docker）で動きます。ホスト版の数字（Supabaseのドキュメント、2026-11-03）: Nanoは無料。有料プランの最小はMicroで月約$10、上限はNanoと同じ（直接60、プーラーのクライアント200、プールサイズ15）。Smallは約$15（90 / 400）、Mediumは約$60（120 / 600）、Largeは約$111（160 / 800）、XLは約$210（240 / 1000）。Proプランは月$25で、組織ごとに$10分のコンピュートクレジットが含まれ、Micro 1プロジェクト分をまかないます。プランを上げるだけでは接続の余裕は増えません。増えるのは、コンピュートのサイズを上げたときだけです。

## セキュリティ上の注意
- ラボはCLIのローカル開発用のパスワードと鍵を使います。本物のデータのある本物のデータベースに、このスクリプトを向けないでください。`lab/setup.sql` はごく簡単なパスワードのログインロールを作ります（ローカル専用）。
- Data APIの関数 `slow()` は `anon` が呼べます。こういう遅い関数を公開すると、外部の人にData APIのプールを握られます。本物のプロジェクトでは公開しないでください。
- service_roleキーは、ここには絶対に置かないでください。

## 確かめられていないこと
- **ホスト版のプロジェクトでは動かしていません**（共有プーラーの再確認、ホスト版の `max_connections` のうちSupabaseのサービスが使う分、ホスト版のプール設定）。ローカルのプーラーは同じオープンソース（私のCLIではSupavisor 2.9.12）ですが、設定が違う可能性があります。
- プーラーへの**クライアント接続数**（ダッシュボードにグラフがあります）。数えたのはバックエンドだけです。
- Rails、postgres.jsを使うEdge Function、Npgsql、pgx、HikariCP、専用プーラー（PgBouncer）。
- Nanoより大きいコンピュートサイズ（数字はドキュメントによる）、リージョンをまたぐ遅延、負荷中のデータベース再起動。
- 各実験は多くても数回。遅延の表は、1マスあたり6秒の1回です。
- バージョン: pg 8.23.1、postgres 4.0.0、Prisma 6.19.3 と 7.10.1、psycopg 3.3.6（psycopg_pool 3.3.3）、SQLAlchemy 2.1.6、Django 5.2.18、Node 24、Python 3.14、Supabase CLI 2.117.0、Supavisor 2.9.12、PostgREST 16.2。

## 後片付け
作業フォルダで `supabase stop` して、フォルダを消します。

## ライセンス
MIT。`LICENSE` を見てください。
