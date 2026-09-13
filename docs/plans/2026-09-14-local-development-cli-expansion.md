# ローカル開発・検証CLIの追加計画

作成: 2026-09-14。状態: 計画のみ・未実装。
対象: DictionaryのMap / Categories / Stacks、および将来のAnalyzer対応。
ユーザーの「今回は追加計画だけまとめる」に基づき、アプリケーションコードは変更しない。

## 目的と範囲

Wranglerの「クラウド向けのコードやサービス連携を、自分のPCで動かして開発・検証する」役割を起点に、近いCLIを少数追加する。
CLIそのもの、CLIが起動する実行環境・エミュレーター、クラウド側のサービスを区別する。
参照会話は意図の確認に用い、製品の仕様は下記の公式資料で確認した。

追加候補は5項目:

| ID案 | 名称 | 代表的なローカル操作 | 掲載する概要 |
| --- | --- | --- | --- |
| wrangler | Wrangler | wrangler dev | Workersのローカル開発、デプロイ、リソース管理を支援するCloudflareのCLI |
| vercel-cli | Vercel CLI | vercel dev | Vercel固有の機能を含むローカル開発とデプロイ・設定管理を支援するCLI |
| netlify-cli | Netlify CLI | netlify dev | Netlify Devを通じて開発サーバーとFunctions・配信規則などを組み合わせるCLI |
| firebase-cli | Firebase CLI | firebase emulators:start | Firebaseの設定・公開・ローカルエミュレーターの起動を管理するCLI |
| supabase-cli | Supabase CLI | supabase start | コンテナを使ったSupabaseのローカル環境とDBマイグレーションなどを管理するCLI |

Firebase Local Emulator Suiteは既存の独立項目を維持する。Netlify DevはNetlify CLIのローカル開発機能として説明し、重複項目は作らない。
workerd / MiniflareはWranglerの説明内で違いを記述し、今回の独立追加には含めない。
AWS CLI / gcloud / Azure CLI、LocalStack / AWS SAM CLIなどへの拡大は今回の範囲外。

## Categories / Map

- 新規カテゴリ `local-development-cli`、名称「ローカル開発・検証CLI」を追加する。
- canonical分類では新しいルートカテゴリとし、表示グループ「開発と配信」の `rootCategoryIds` に追加する。CLIを配備先のプラットフォームの子として扱わない。
- 定義: サービス固有のローカル実行・検証環境を準備、起動、管理するコマンドラインツール。公開や環境管理の機能も持ちうる。
- 用途: デプロイ前の実行確認、サービス連携の検証、開発環境の共有。
- 違い: CLIは操作を受け付ける道具、runtimeはコードを実行する基盤、emulatorはサービスを代替する実装、deployment platformは公開先の基盤。
- 相互の関連カテゴリ: `local-emulator`、`runtime`、`build-tool`、`deployment-platform`、`backend-platform`。既存カテゴリ側にも新カテゴリへの関連を追記する。
- Mapは既存の左右配置と小画面用の縦表示を使用。新しい表示方式・折り畳みは追加しない。
- 既存142技術・52分類を基準に、この案だけを実装した場合は147技術・53分類。UIの件数はデータから算出し、数字を固定しない。
- 幅360 / 390 / 768 / 1024 / 1440px、200%拡大で長いCLI名、カテゴリ名、説明、クリック範囲、横はみ出しを確認する。

## Stacksの説明方針

各項目に概要、詳細、機能、用途、責務、相違点に相当する説明、関連技術、公式URLを揃える。

### Wrangler

`wrangler dev`による開発と`wrangler deploy`による公開を区別する。WranglerはCLIであり、コードを実行するworkerdや、ローカルサービスを再現するMiniflareそのものではない。
ローカルでコードを実行していても、remote bindingなどでクラウド側の資源を使う構成がある。ローカル実行を「完全オフライン」「全サービスが本番と同一」と説明しない。

### Vercel CLI

開発・デプロイ・設定管理の操作を持つことを記述する。`vercel dev`が常に必要とはしない。公式資料では、フレームワーク自身の開発コマンドで必要機能を満たす場合はそちらを使用するよう案内している。

### Netlify CLI

Netlify Devによる開発サーバーとの連携、Functions、redirects / headersなどを説明する。開発時の配信・実行機能を提供することと、CDNや本番インフラ全体を再現することを区別する。

### Firebase CLI

設定・デプロイとEmulator Suiteの起動を説明する。`firebase-tools`はCLIの配布パッケージであり、アプリ用Firebase SDKではない。Emulator Suiteの詳細は既存の独立項目へ誘導する。

### Supabase CLI

Docker互換のコンテナ環境を使ってローカルのサービス一式を起動すること、DB変更を管理することを説明する。CLI、アプリ用SDK、Supabaseサービス本体を区別する。

## パッケージ名と関連技術の移行

| CLI | packageNames案 | 双方向の関連先 |
| --- | --- | --- |
| Wrangler | wrangler | cloudflare-workers、cloudflare-pages、cloudflare-d1、cloudflare-r2、cloudflare-kv |
| Vercel CLI | vercel | vercel |
| Netlify CLI | netlify-cli | netlify |
| Firebase CLI | firebase-tools | firebase、firebase-hosting、firebase-emulator-suite |
| Supabase CLI | supabase | supabase、postgresql、docker |

- 現行 `stacks.ts` のVercelから `vercel` をCLI側へ移す。
- 現行 `deliveryStacks.ts` のNetlifyから `netlify-cli` をCLI側へ移す。
- Firebase / SupabaseのSDKパッケージは本体側の現行対応を維持する。特にnpmの `supabase` とPyPIの同名パッケージをAnalyzerで混同しない。
- 同一パッケージを本体とCLIの両方の正規検索キーとして重複登録しない。
- 新規CLI側の関係は既存 `integrates-with` を用い、「ローカル開発・公開を操作」「エミュレーターの起動を管理」などの説明を付ける。単に `runs-on` でクラウド上で動くCLIと表現しない。
- 既存サービス・Suite側の `relatedStackIds` に対応CLIを追加。CLI同士は同カテゴリから比較できるため、無条件の全相互リンクは追加しない。

## Analyzerの実装計画

### 現行調査で確認した点

- `commandTargets.ts` にWranglerのdev / deployの解決処理がある。
- `expandedCommands.ts` はnetlifyをサービス本体へ対応付けている。
- 同ファイルのfirebase判定はサブコマンドからSuite / Hosting / Firebaseを返している。
- `stackRegistry.ts` はNetlifyにnpm:netlify-cli、Supabaseにnpm:@supabase/supabase-jsとpypi:supabaseを登録している。
- Dictionaryの表示追加だけでは、CLIと操作対象を分離した検出にはならない。

### 検出とEvidence

1. 5項目のregistryを追加し、エコシステムを含めてパッケージ宣言を識別する。
2. package scriptsと現在対応しているCIコマンドで、正規化済みargvからCLIの使用を記録する。単なる本文・コメント内の製品名一致で検出しない。
3. CLIの検出と操作対象の検出を分ける。既存のfirebase→Suite / Hostingの判定をCLIへ単純置換して失わない。コマンド箇所にCLI使用と対象の設定関係を別々に記録する。
4. 各CLIの最初の対応範囲は表のローカル起動操作。バージョン照会・help・loginをローカル起動扱いにしない。
5. `npx` / `pnpm exec`など既存のラッパー解決、working directory、設定パスの指定を引き継ぐ。動的な変数や未知のオプションで対象が確定できない場合は未確定にする。
6. 設定ファイルだけからCLIの実行済み・インストール済みを断言しない。Cloudflare Vite plugin経由など、CLIを直接使わない開発経路もある。
7. 宣言・静的コマンド・設定根拠は分離し、元ファイル、行、範囲、IDを維持。実行、クラウド問い合わせ、秘密値の解決は行わない。

### タブごとの配置

- Stack Map: CLIを新カテゴリの開発ツールとして掲載。クラウド側のサービスやruntimeとして重複生成しない。
- Workspace / Command Flow: script → CLIコマンド → 確認できた開発対象の順で既存の表現に接続。起動宣言と公開操作を区別する。
- Package Dependency: npm依存として実際に宣言されたCLIパッケージを保持する。
- Module Dependency / Runtime / Function / Data系: CLI導入だけでアプリのimport・呼び出し・データ関係を作らない。
- Architecture Map: 所属アプリの「技術の宣言・参照」に開発用CLIとして表示。CLIパッケージがあるだけで外部サービスブロックを追加しない。ローカル実行対象を作る場合は起動コマンドと対応設定を根拠にする。既存Suite・個別EmulatorのIDと親子関係を保持する。
- local / remote / deployの区別は各コマンドと設定の有限な対応範囲で行う。「CLI名＝local」と固定しない。

## 実装順と受け入れ条件

1. Dictionaryカテゴリ・5項目・検索パッケージ・既存関連リンクを同時に追加。
2. CLI使用と操作対象を分離するAnalyzer検出を追加し、既存Wrangler / Firebase / Netlifyの検出を回帰確認。
3. 単体fixtureで、各CLIの直接起動、ラッパー、宣言のみ、help、remote設定、複数workspace、同名PyPIパッケージ、未確定の設定指定を確認。
4. Map / Categories / Stacksの到達性、検索、件数、逆リンク、上記画面幅を実ブラウザ確認。
5. AnalyzerのCLI分類、Command Flowの向き、Architectureの重複なし・Evidence・選択とカメラの安定性を2D / 3Dで確認。
6. Dictionary整合性、registry coverage、package lookup、command解析、provider解析、型検査、lint、build、関連回帰テストを通す。
7. 修正内容ごとにコミット。push / 公開は別途ユーザー依頼がある場合のみ。

実装開始時にはその時点の差分・公式仕様を再確認する。この計画の作成時点で新規CLI検出・UIの実装やテストは行っていない。

## 公式資料（2026-09-14確認）

- [Wrangler](https://developers.cloudflare.com/workers/wrangler/)
- [Cloudflareのローカル開発と実行・bindingの区別](https://developers.cloudflare.com/workers/local-development/)
- [vercel devと使用する場面](https://vercel.com/docs/cli/dev)
- [Netlify CLIのローカル開発](https://docs.netlify.com/api-and-cli-guides/cli-guides/local-development/)
- [Firebase Emulator Suiteの導入・CLIによる起動](https://firebase.google.com/docs/emulator-suite/install_and_configure)
- [Supabase CLIとローカル環境](https://supabase.com/docs/guides/local-development/cli/getting-started)
