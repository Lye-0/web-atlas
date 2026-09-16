# タブ10：操作・成果物・環境別構成を同じ図へ接続

2026-09-16。ブランチ「小規模修正３」、着手HEAD `08a28fc96a335c4ae519a3fa3d26dac7c7c5d68a`。着手時の未追跡差分は既存の`.playwright-mcp/`のみ。Codex単独で作業し、サブエージェント・push・デプロイは使用していない。

## 変更

既存検出の再利用:

- package scriptの展開、workspace selector、CLI認識、元Evidence、Runtime/Resource、Wrangler設定と環境別binding、アプリ内の要求・DBアクセス、未特定要求の集約。
- 上記を既存のArchitectureモデルと2D/3Dの選択・階層移動へ接続。

今回追加した対応付け:

- `architectureCommands.ts`: 元コマンドID、script ID、呼出関係・Evidenceをworkerへ渡す。リテラルの転送引数は呼出文脈ごとに保持。
- `architectureToolFlows.ts`: 使用箇所別の操作、コード・定義、成果物、環境別実行構成を追加。CLIだけを巨大な一つのハブへ統合しない。
- Wranglerのdev/deploy/D1 migrations apply、Viteのdev/build、Drizzle Kit generate、Firebaseのemulator起動、その他既存CLIのローカル操作を有限形式で扱う。
- パス・環境を照合して生成物と公開・適用入力を対応付ける。対象不明の操作も「操作対象は未特定」として保持。
- 元の関係を実行構成へ対応付ける際にprovenanceとconfidenceを維持。DB bindingだけを読取/書込と扱わない。
- 操作・成果物・実行構成の件数を対象数の内訳として表示。実行/生成/公開/適用はいずれも未観測。
- 2Dの環境見出し、関係名、初期倍率、3Dの主要操作の集約保護、詳細欄、対応scriptを指定するCommand Flow導線を更新。

## 実入力と独立した期待値

原本はファイルをデータとして読み取るのみ。実入力のdev/build/migrationを実行していない。検証用storeは既存scannerのマスク済みデータをローカル`.cache/unified-review/`に保存。ブラウザはWeb Atlas自身のローカルサーバー上でproductionコンポーネントとworkerを使用する検証用入口から同じstoreを読み込んだ。

### vehicle-management

確認した原本: root/package.json、apps/web/package.json、apps/web/vite.config.ts、apps/api/package.json、apps/api/wrangler.jsonc、apps/api/drizzle.config.ts等。

- rootのdevはconcurrentlyからauth/api/webのscriptを呼ぶ。Firebase CLI起動、Wrangler development起動、Vite開発配信が同じモデルに接続する。
- apps/apiのdev/startはDB local migrationの呼出後、`&&`でWrangler development起動を記述。前後関係は成功時の記述であり、実行成功ではない。
- rootのprodはbuild:productionの後にdeploy:production。Vite productionビルドのdistとWranglerのassets入力をパスで照合し、公開操作・production実行構成に接続する。
- apps/api/drizzle.config.tsのschemaはpackages/database/src/schema.ts、outはapps/api/migrations。SQL生成の入力・出力と、Wrangler applyの入力を同じパスで接続する。
- D1 applyはdevelopment/localとproduction/remoteを区別する。アプリの既存DBアクセス関係を同じ対象へ対応付ける。識別子不足のDBは同名の別環境DBと統合しない。
- 既存の認証・HTTP要求は保持する。動的接続先やtokenの受領・検証を追加推定しない。未特定要求は既存集合のまま。

### git-lines

root scriptsはVite webviewのbuild/devと独自node build-extension等。Wrangler/D1の定型経路は生成しない。Viteで静的に対応できた部分を表示し、独自nodeプログラムが内部で行う生成処理は今回新たに実行・推論しない。

今回の読み取り入力にはartifacts配下の拡張機能コピーも含まれ、それぞれのパスを持つVite使用として解析される。rootだけの件数ではない。これとは別に、tests/fixturesの操作が初期図へ漏れないよう元のauxiliary区分を引き継ぎ、独立fixtureで除外を検証した。

### Chess

root scriptsはNext dev/build/start。今回の有限CLI対応にNextの操作展開は追加していない。既存モデルを維持し、Wrangler・D1・Drizzle等を自動生成しない。

## 正確性テスト

独立した合成入力で以下を確認:

- 開発/本番の操作が同時に存在し、同名で異なるDB IDを混同しない。
- DBへのソースアクセスとmigration適用が同じlocal DBへ接続。アクセスのinferredをsourceへ格上げしない。
- local Workerのremote bindingはcloud対象へ接続し、local migrationとは別。
- Vite出力とWrangler入力の正規化パス一致。動的出力、不明config、依存のみ、helpでは実行先や既定出力を捏造しない。
- SQL生成・適用、scriptの条件付き後続関係、元Evidence範囲、未観測状態を維持。
- 通常選択で座標と準備済み3D入力を再利用し、補助fixtureの操作を初期図から除外。

全体suite: 1,313成功・9スキップ（補助fixtureの追加テスト前）。最終の補助区分・環境表示・集約の重点suiteは26件成功。直前の2D/3D・選択・CLI重点suiteは68件成功（重複するため合算しない）。既存タブ1〜9、Architectureの集約・選択・Canvas後始末等の回帰を含む。新規実入力検証はopt-inであり通常suiteではスキップする。

build/typecheck/lint成功。buildには既存tree-sitterのeval・fs/path外部化とchunkサイズ警告がある。diff whitespace確認も実施。

## 実ブラウザ

Chrome Playwright MCPを使用。

- vehicle-managementの同じ初期グラフにWranglerの用途別操作、Vite、Drizzle、Firebase CLI、成果物、development/production構成を確認。
- 2Dで別対象のDrizzle生成操作を選択し、元scope・全座標・camera X/Y/scaleの一致を確認。
- 3Dで開発サーバーへ選択を変更し、scopeと保存cameraの一致を確認。
- Companion内部へダブルクリックで移動し、戻る操作後にprojectへの復帰を確認。直後のReact更新前の値と更新後を区別。
- 全画面、Escape、390px、reduced motion、SVGのキーボードパンを確認。390pxではclient/scroll幅380pxで一致。
- 自動省略・囲いの切替、モード往復を確認。2D中のcanvas数0、3D中1、2Dへ戻ると0。FPSやリーク不在を証明するものではない。
- 途中のスクリーンショットで全体Fitが縮みすぎる点を確認し、初期倍率に下限を設けた。明示Fitは全体確認のため従来どおり縮小できる。
- consoleには初回favicon 404があり、最終ページの取得ではアプリ例外0。全実入力・全機能のGUI網羅はしていない。

## 性能

同じvehicle-management入力226ファイル、SHA-256集合fingerprint `50a27bf54cff318a21880e68a5b8edd246208f3a624fda8515619a5798840d67`。

| 項目 | 変更前 | 最終調整時の測定 |
| --- | ---: | ---: |
| 初期表示対象 | 26 | 59 |
| 初期表示関係 | 36 | 102 |
| semantic input準備 | 1.26ms | 20.43ms |
| semantic解析 | 28.09秒 | 28.74秒 |
| 選択100回の投影・2D座標取得 | 0.70ms | 0.87ms |

同じ端末・入力・コード経路の単回測定で、時点により他の検証処理が動作している。厳密な速度比や統計的な劣化/改善を断定しない。追加対応付けはscanごとの一度であり、カメラ操作でソースを再解析しない。3Dカメラ操作の修正前後FPS、長時間GPUメモリ推移は未測定。

基準取得の一度目は解析全体の巨大JSON書き出しでInvalid string lengthとなった。解析・計測は完了しており、以後は必要なモデル情報だけを書き出すよう検証コードを変更した。製品の解析エラーとして扱っていない。

## 対応限界

- **未対応**: 任意shell、動的引数・設定、独自nodeスクリプト内部のビルド処理、Next等の操作ノード展開、全CLIの全サブコマンド/オプション。CIは既存の静的script解決範囲に依存。
- **未特定**: 動的config、解決できない出力/接続先、論理アプリ内の固有担当、安定IDがない実体間の同一性。確認できた操作は残し、対応先を捏造しない。
- **未観測**: ツールの実行場所、実行成功、生成完了、公開・稼働状態、DB適用完了、実通信。local/remoteは操作先の指定であり観測ではない。
- **未検証**: 全CLIバージョン、全実入力の全操作GUI、200%拡大、変更前後のブラウザFPS/長期リーク、全要求集合の実入力操作。既存の集合・履歴・選択契約は自動回帰を実施。

既定値の参照: [Vite build.outDir](https://vite.dev/config/build-options)、[Vite CLI](https://vite.dev/guide/cli)、[Wrangler環境設定](https://developers.cloudflare.com/workers/wrangler/environments/)、[D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)。Viteのdist補完は既知の2〜8系依存宣言と静的設定に限定する。既定環境を本番へ自動分類しない。
