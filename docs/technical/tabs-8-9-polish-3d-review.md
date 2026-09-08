# タブ8・9仕上げと共通3D自動省略の検証記録

2026-09-08。開始HEAD `f97bafe59bb72d7af596504bbc0de319a84cb625`。親と、実装・操作性/視認性・正確性の3担当（GPT-6 Astra / medium）が分担し、S1の独立指摘を修正、S2、Fullscreenの局所CSS修正だけを加えたS3で照合した。ソース原本は読み取り専用の静的入力として扱った。

## 最終成果物と確認範囲

- S3実行ソース/設定/技術文書3本の225ファイルmanifest: `5eb62e79edb9267414d4346fed4c5a735ced9e986404649908ead72fb51237b4`。
- 同じS3ソースに公開スキャナー用の検証入口だけを追加した通常QA build: `ba90ce3eb2892d44d80bcb04764fae95d9517a13a4c699d71ff823e72849a587`（42ファイル）。原本の設定やアプリを実行する入口ではない。
- 読み取り専用geometry計測build: `e4f58fe8bab86594debb37b182a40961a410c29d99773022f879fe77dc056dbd`。通常UIの応答測定と分離した。
- QA loaderを含まない製品buildも別途成功。入力・大きいログ・スクリーンショット・計測補助コードはGit管理へ含めない。
- 真の200%ブラウザ拡大、タッチ、OSのreduced-motion切替はIABの機能不足でBLOCKED。これらを実施済みや代替viewportによる200%検証とはしていない。

## 実装と判定

|ID|実装/確認|判定|
|---|---|---|
|DF-01|主要な値と数付きの細式一覧。検索選択・明示経路の対象は保護、元の値は全て残す。|PASS|
|DF-02|仮引数、使用、実引数、操作、結果の役割表示と明示した多段経路の強調。|PASS|
|DF-03|構文に基づく共通短名、awaitの区別、元式・所属・Evidenceとコピー。|PASS|
|DM-01|詳細パネル自身の幅で表/縦構成を切替、長い型の全文導線。実300pxと狭い画面を確認。|PASS（上記環境制約あり）|
|DM-02|union候補を先に一覧化し、個別展開と状態復元。判別値なし/重複/混合/12候補を確認。|PASS|
|AG-01|初期ON、5View間共有、他設定と独立、2Dへ影響しない。|PASS|
|AG-02|下記5Viewへ接続。小規模は個別を維持、密集fixtureは説明可能な集約。|PASS|
|AG-03|選択/元関係の両端/明示経路/検索選択/手動展開を保護。|PASS|
|AG-04|元ID・関係・Evidence、方向/種類/確度、内部関係を保全。表示集合から架空の経路を作らない。|PASS|
|AG-05|元座標・カメラ・状態、点線端点、5Viewのカメラ操作、微小zoom往復と復帰。|PASS|
|AG-06|個別+自動メンバー+手動メンバーの重複なし。全件OFF、検索一致数、負荷を実測。|PASS（性能制約は下記）|
|QA|同一最終ソース/通常artifactで独立照合・実操作。実装に関係する基本ゲートを確認。|環境3項目はBLOCKED|
|REG|568既存/追加テスト、完全なcanonical比較、Views1–5投影、Dictionary代表導線。|PASS（既存Trace UI未確認は継続）|
|SAFE|原本非変更、原本の実行なし、ソース/Evidence外部送信なし、未公開。|PASS|

|既存3D View|表示集約の単位|確認|
|---|---|---|
|Module Dependency|同一ディレクトリとその下位のモジュール集合|小規模/実入力のON/OFF、明示展開/手動、元import、pan/zoom|
|Runtime Flow|記録された所属・実行文脈、種類/確度を区別する集合|実行環境未判定を維持、元request、orbit/pan/zoom|
|Function Call Flow|関数/呼び出しの所属。定義先未特定を別扱い|未特定480の明示展開/手動、元呼び出し、orbit/pan/zoom|
|Data Flow|役割、関数、ファイル、ディレクトリ。混在の内訳を表示|35,303/142,244実入力、81,118fixture、元経路、orbit/pan/zoom|
|Data Model|所属とコード型/検証/保存定義の区別|別定義を合成せず、元外部キー/2Evidence、orbit/pan/zoom|

Views1–4とArchitecture Mapは既存3Dを持たず、自動省略はN/A。Moduleの回転は固定角度という既存仕様のためN/A。

## 独立指摘と再確認

ページ縮小後に一覧が空になる問題、コメントの括弧でawait短名を壊す問題、手動で閉じたModuleを元レイアウトから落とす問題、表示集合の相手へのrole/hover照合を修正し、報告者が同じ65ケースを最終S3で再実行した。UI側の狭幅列指定、密集fixtureで自動集約0になる問題、現在メンバーと元所属の説明不足も、元レビュー者が再操作して確認した。

1024pxのFullscreenで詳細が全列を占めグラフ高さが2pxになる既存不具合は、baselineでも再現した。S3はFullscreen詳細の`grid-column:auto`一宣言だけを追加。再確認でグラフ682×972/詳細300×972へ復帰し、390pxは上下配置となった。

## 正確性・負荷・制約

実入力はgit-lines77ファイルとvehicle-management115ファイル。独立固定期待値36ケース・21テーブル一覧・追加5判定が一致し、対象/関係/Evidence/Fields/coverage/warningsがbaselineと一致した。親もViews6–9の全canonicalレコードと元点座標、Views1–5の全投影を比較した。S3はCSS一宣言以外がS2と同一のため、解析結果は不変ハッシュの根拠を添えて再結合し、新規再解析とは称していない。原本のHEAD/status/全tracked hashは、最終ブラウザ操作後にも再採取して開始時と照合した。

通常S3の密集fixture81,118対象はON240組/OFF81,118個別。実入力142,244対象は全体表示でON14組、OFFで全対象、再ON14組へ復帰。142,233件の検索入力だけでは全展開しない。親の5View×2実入力58観測と、親/UX合わせた5Viewの自動2×囲い2×粒子3の実操作記録がある。

VM Data Flowの未選択OFF/ONは操作ツール込み2.321秒/3.794秒。検索は2.525秒。初回3Dと検索選択は入力応答待機が約4.2秒/4.8秒でtimeoutしたが、その後のDOMで表示・選択完了を確認し、操作を継続できた。JS heap推定は約1.4GB。これらはGL→VMを続けた検証タブの単発観測で、純粋なアプリ遅延やGPUメモリではない。FPSや改善率は測っていない。通常小規模のzoomは305–318ms、成功orbit861–926ms、pan594–641ms（いずれも操作ツール/観測込み）。

geometry計測では元の点・線・矢印の端点を保持。GL Data FlowのON/OFF/ONは実Points12→35,303→12、カメラと復帰位置hash一致。描画用typed-arrayのbacking bytesは3,840→1,133,152→3,840であり、GPU driverや全heapの値ではない。小さいzoom往復で集約の安定と解除/復帰を確認した。

未確認の全入力×全状態の総当たりや、前回未確認だった実行Trace読込のブラウザ経路を、今回成功したことにはしていない。Trace等の既存アダプターは自動テストの回帰範囲で確認した。

## コマンドと証跡

`pnpm build`、`pnpm typecheck`、`pnpm lint`、`pnpm test`（568PASS/8opt-inSKIP）、`git diff --check`、`pnpm exec wrangler deploy --dry-run`が成功。lint初回はsandboxの依存読取りEPERMで、許可された再実行に成功した。buildの既存500kB超chunk警告は残る。依存/lockfile変更・再インストール・本番公開はない。

ローカル証跡は`.cache/tabs89-polish-3d-aggregation-20260908/`。親の`parent/acceptance.json`、`parent/acceptance.md`、`parent/s3-integration.md`、`parent/performance.md`、`parent/s3-browser-deep-review.md`、正確性の`accuracy/s3-correctness-review.md`、UXの`ux/s3-review.md`、`ux/s3-performance.md`と`ux/logs/s3-*`を参照。原本のHEAD/status/145+345 tracked file hashesは不変だった。コミット/公開の最終状態はタスク報告に記載する。

repository-memoryは独立した知見4件を新規記録し、実際に再利用した既存4件を更新した。agent-knowledge/INDEX.mdを再生成し、validator/index checkが成功した。現在の設計契約は既存の技術文書3本に反映している。

コミット直前のステージ済み差分検査で、新規テスト4本の末尾空行だけを除去した。製品実行コード・設定・既存技術文書はS3と同一で、通常QA artifactへの対応は変わらない。末尾改行だけの差分証明はparent/final-source-binding.json。整形後も568テストが成功し、8件はopt-in skipのまま。
