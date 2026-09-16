# タブ10：3プロジェクトの解析・対応付け・説明の検証

2026-09-16。着手HEAD `27eb79b`、ブランチ「小規模修正３」、着手時clean。Codex単独。修正対象は `architecture-map`（タブ10）で、タブ1の `architecture` と区別した。プロジェクト原本・任意設定の実行、原本変更、外部送信、push、デプロイは行っていない。

実装・テストのコミット：`9cb1bca`。

## F1〜F5の原因と修正

| 項目 | 原因の層・確認結果 | 修正 |
| --- | --- | --- |
| F1 HTTP | web-atlasのfetch検出自体は正しかった。Architectureで開始位置だけを照合し、同じ開始位置を持つ外側thenのcallbackをURL式に取り違えていた。別途、ローカルfetchの名前判定も負例で失敗 | 開始/終了の範囲を一致させる。JS/TSのfetchは字句bindingを照合。要求式、確認したcallee、不足理由を別表示。既知importクライアントは正例として保持 |
| F2 投影 | 環境とsource側の所属だけで、内部calls/callback/イベント等を実行構成へコピーしていた。assets配信構成にもブラウザ内の関係を複製していた | 同じアプリ内の関係を除外し、main・環境・対象関係種別を確認。元の内部関係と正当な境界関係は保持。構造上の対応線は残す |
| F3 対象 | Viteはconfig/rootを読めても入力コード・配信先にscript所有packageを使用 | rootにある既存のブラウザ入口を照合し、Git Lines Webviewのコード・開発配信へ対応。操作IDとscript所有者を維持。成果物パスは元から正しかった |
| F4 位置づけ | 別packageとしての検出は正当だが、manifestの用途説明を独立した位置づけとして示していなかった | descriptionの明示用途と、名称・説明の弱い手掛かりによる推定を区別。コピーは削除せず「補助（推定）」を図・検索に表示。根拠は詳細で確認。既存filterは変更しない |
| F5 説明 | 早期returnで不足段階が残らず、入口不在の文言が静的配信を示唆していた | config読込状態、解決パス、入力root、出力、アプリ対応、不足理由を分離。main/assetsから提供内容を説明し、入口不在だけでは決めない |

git-linesのroot `build:webview` は、修正前から `webview/vite.config.ts` と `dist/webview` を解決できていた。別コピーの同名使用では指定configがスナップショットに含まれておらず、同じ原因として扱っていない。設定不足を本体の設定で補わない。

## 3入力と元ソースの照合

vehicle-managementとgit-linesは既存の固定マスク済みstore、web-atlasは着手時の追跡ファイルから比較用スナップショットを保存した。Web Atlas自身の変更後ソースを再読込して比較条件を変えていない。検証キャッシュを入力へ加えていない。動画ファイルは閲覧せず、添付本文の場面説明と元ソースを照合した。

| 入力 | 主な確認 | 2D/3D・詳細・検索 |
| --- | --- | --- |
| vehicle-management | Web/API/Companion、共有コード、ViteとWrangler、dev/prod、schema→migrations→D1、aws4fetchとSELFの正当な要求 | 通常の図上選択でscope/全既存座標/camera一致。production公開の具体的対象・config・未観測状態を詳細で確認。検索から各使用に到達 |
| git-lines | root script、Webview入口のacquireVsCodeApi、config.root=`webview`、outDir=`../dist/webview`、別packageのmanifest用途 | 開発配信の対象と入力コードがWebviewに一致。通常選択のscope/座標/camera一致。補助用途のコピーも検索可能。不足configを完全パスで表示 |
| web-atlas | semantic.worker.tsの2つのfetch、Wrangler assets.directory=`./dist`とmainなし、Vite buildと公開 | parserRuntimeUrl / legacyParserRuntimeUrlを正しく表示。個別要求のEvidenceがfetch式と一致。静的アセット配信の役割を確認。通常クリックとdblclickの分離、内部から外側を選んだ際のscope/cameraを確認 |

scriptをテキストとして読んで、rootのdev→auth/api/web、prod→build:production→deploy:production、Wranglerのlocal/remote migration、Drizzleのschema/outを照合した。クラウドやDBへコマンドを発行していない。git-linesの別コピーではmanifestのdisplayNameが記録・実験を示す手掛かりだが、それだけで未使用・不要と確定していない。

Viteのパス基準は公式資料で確認：[configはcwd基準](https://vite.dev/config/)、[rootはcwd基準](https://vite.dev/config/shared-options)、[outDirはroot基準](https://vite.dev/config/build-options)。既知クライアントの正例は [aws4fetch公式API](https://github.com/mhart/aws4fetch) と実入力のimport/生成元も照合した。

## 元ID・関係・Evidence・件数

次はブラウザ用の縮小入力ではなく、同じ固定入力全体のNode上での解析結果。補助コード非表示・全環境・project rootで比較。

| 入力 | semantic HTTP要求 | Architectureノード | Architecture関係 | ルート表示ノード/線 | 内部元関係数 |
| --- | ---: | ---: | ---: | ---: | ---: |
| vehicle-management | 298 → 297 | 375 → 374 | 15,313 → 11,668 | 59/108 → 59/98 | 8,269 → 8,269 |
| git-lines | 0 → 0 | 78 → 78 | 18,215 → 18,216 | 54/36 → 54/37 | 13,708 → 13,708 |
| web-atlas | 20 → 20 | 39 → 39 | 50,484 → 16,842 | 13/36 → 13/22 | 9,478 → 9,478 |

- **vehicle-management**：直接呼ぶ `worker.fetch` はローカル実装への呼出であり、独立HTTP要求先の生成を1件取り消した。元の呼出操作を消す変更ではない。削除されたArchitecture関係3,645件のうち3,643件は実行構成への複製で、元関係IDは残る。残る2件は誤分類した要求先への関係。SELFの115要求とaws4fetchの4要求はimport根拠を照合して保持。
- **git-lines**：`Git Lines · コード`を、実際の入力である`Git Lines Webview · コード`へ置き換えた。変更はコード定義1件とその入力/対応線。操作ID・開発配信ID・成果物IDは維持。配信→Webviewを1本追加。拡張本体↔Webviewの正当な境界関係は維持。
- **web-atlas**：HTTP20要求の元call siteとIDを維持。worker内の2要求はcallbackから正しい引数式へ表示を修正。削除した複製33,642件の元関係IDは全て残る。内訳はcode-reference 2,598、registers-event 1,418、handles 914、calls 17,624、callback 11,048、HTTP 40。
- 共通ノードのEvidence hash変更0。新しい位置づけ・不足理由は説明属性であり、正常な対象を統合したり、既存Evidenceを書き換えたりしていない。

代表的な追跡関係:

| 元の記述 | 修正前の問題 | 修正後・根拠 |
| --- | --- | --- |
| 同じアプリ内のイベント登録、元registers-event ID | 実行構成→論理アプリ/内部構成へコピー | 元ID・端点・Evidenceを内部要約で保持。独立fixtureで元semantic edgeと完全一致をassert |
| ブラウザからのfetch、元call site | static assets設定からもHTTPとして複製 | ブラウザ側の元HTTPは残し、配信サーバーによる要求というコピーを生成しない |
| Webview rootの入力 | script所有者のコード→Vite | 設定rootとブラウザ入口を照合し、Webviewコード→Viteへ再対応 |
| main/env/D1 bindingの対応 | 正当なruntime/resource適用 | 明示environmentとbinding、remote指定を維持。既存正例テストを再実行 |

入力hash：vehicle-management `e11daf1582d7a85ca04444b046e1dddb5ad085a3f91bc6be4bae070523ae8758`、git-lines `93dacb00abbe6c2bddbde119984af47cd91de6c0477826edc1c5f0686ee067e4`、web-atlas `54a0290a6a2909f76232f14a935541d6c68d4a184178099d1e69122ffe526247`。

## 一般性・負例

`crossProjectCorrectness.test.ts`で次を独立した小入力として確認。5ケースを修正前に失敗させ、生成ロジックから期待値を作らず、明示された呼出・設定から期待値を記述した。

- fetch→then→thenでHTTPは1 call site。別の動的要求・近接要求は別IDと正しいEvidenceを持つ。
- ローカルfetch関数、同名parameter、無関係なobject.fetch、shadowingされたclientはHTTPとしない。
- fetch alias、既存axios/apiFetch、aws4fetchのconstインスタンス、cloudflare:test SELFは正例を保持。
- アプリ内登録が内部要約へ残り、config境界へ複製されない。static assets構成にもブラウザ処理を複製しない。
- Webviewディレクトリを`panel`/`renamed-ui`へ変えても意味が同じ。
- 引用符付きconfig、同名package/script/outDirを別の場所に置いても混同しない。
- 未入力config、動的root、任意コードのexportを実行せず、異なる不足理由を表示する。
- `artifacts`下の通常アプリを名前で隠さない。別名フォルダーのdescriptionから補助用途を説明。入力順を反転してもID集合が同じ。
- 未特定の要求先へ要求元の位置づけを割り当てない。

既存テストで、workspace解決、remote binding、環境別DB ID、動的outDir、成果物パス不一致、正当なmessage境界、集約元ID、選択・カメラ・履歴を確認した。

## 実ブラウザの入力範囲と操作

Chrome Playwright MCP、Web Atlas自身のローカルVite/Worker/productionコンポーネントを使用。修正前コードは着手HEADをキャッシュへarchiveして表示し、作業ツリーを巻き戻していない。

**制約：git-linesの全入力では、修正前からWorker結果のpostMessageで`Data cannot be cloned, out of memory`を再現した。** 最終実装でも、他の重い検証終了後に全入力で再試行し再現した。この全入力をGUI確認済みとはしない。全入力解析・件数・性能比較はNode上で実施し、ブラウザは3入力とも明示的に範囲を揃えた別スナップショットを使用した。

| 入力 | 固定semantic sources全体 | ブラウザ確認用 |
| --- | ---: | ---: |
| vehicle-management | 225 | 194 |
| git-lines | 1,891 | 1,814 |
| web-atlas | 388 | 244 |

ブラウザ用は10万文字以上のファイルとtest/spec/fixtureソースを除く。これは検証専用の入力選択で、製品の除外規則へ導入していない。入力/除外一覧はローカル `.cache/cross-project/*.browser-scope.json`。対象のWebview入口・設定・manifest、workerのfetch、主要scriptは含まれる。成果物コピーのmanifestも残り、全てを本体に置き換えていない。

確認した操作:

- 3入力それぞれで2D/3D、図上の単クリックによるscope/既存座標/camera維持、詳細/検索の対象・根拠の整合。
- web-atlasでdblclickによる内部移動、内部から外側を選択した際のscope/camera維持。
- HTTP集合2件から個別要求1件を一時表示し、集合内1＋個別1と表示。元式とEvidence範囲を確認。
- 全画面、モード往復、390px、reduced motion。390pxでページ幅/scroll幅390/390、詳細363/363。
- Runtime Flow/Function Call Flow/Data Flow/Command Flowへの往復。2Dへ戻った後canvas=0。
- 検索結果の選択は既存の`jumpMode`による明示移動であり、図上の通常クリックと分けて検証した。
- 3Dの速い切替で破棄済みDOMへのイベント接続エラーを1件観測。null接続を無視するガードと有効接続/破棄のテストを追加。修正後6往復＋通常3D表示/2D復帰と他タブ往復を実操作し、当該ページのconsole error=0。

代表画像（ローカル検証生成物、git対象外）:

- git-lines [修正前2D](../../.cache/cross-project/before-git-lines-scoped-2d.png) / [修正後2D](../../.cache/cross-project/after-git-lines-scoped-2d.png) / [修正後3D](../../.cache/cross-project/after-git-lines-scoped-3d.png)
- web-atlas [修正前2D](../../.cache/cross-project/before-web-atlas-scoped-2d.png) / [修正後2D](../../.cache/cross-project/after-web-atlas-scoped-2d.png)
- vehicle-management [修正前2D](../../.cache/cross-project/before-vehicle-management-scoped-2d.png) / [修正後2D](../../.cache/cross-project/after-vehicle-management-scoped-2d.png)
- [狭幅の確認](../../.cache/cross-project/after-narrow.png)

後の画像には選択・内部表示を含む。画角だけの前後比較で解析の正確性や高速化を証明していない。

## 性能・テスト

3入力は同じsources hashで測定。全入力のNode上の解析、初回投影＋2D配置、通常選択100回の投影＋座標取得を記録。再分類はscan境界で行い、選択や回転では再解析しない。

| 指標 | vehicle-management 前→最終 | git-lines 前→最終 | web-atlas 前→最終 |
| --- | ---: | ---: | ---: |
| 解析 | 26.19→32.53秒 | 54.18→80.33秒 | 66.90→84.47秒 |
| 初回投影＋配置 | 61.96→54.65ms | 63.49→83.17ms | 163.24→68.32ms |
| 選択100回 | 0.719→0.768ms | 0.537→0.508ms | 0.211→0.251ms |

最終計測は全体suite・ブラウザ確認とも併走した単回測定。直前の同じ入力での修正後解析は25.31/56.42/65.61秒であり、負荷による振れが大きい。遅い数値を隠さず、解析高速化・劣化の確定値とは扱わない。web-atlasの投影対象減少は誤った複製の是正によるもので、全ての処理を最適化した意味ではない。選択の数値はDOM描画やGPU/FPSを含まない。

最終 `pnpm test` は **124 files / 1,332 tests成功、7 files / 12 testsスキップ**。重い計測等のopt-inを成功数へ含めていない。固定3入力の最終opt-in比較は別途成功。`pnpm build`、`pnpm typecheck`、`pnpm lint`、`git diff --check`も成功。buildには既存tree-sitterのeval/fs/path外部化とchunkサイズ警告、jsdomでの3Dテストには既存の未認識tag警告がある。

初回全体テストの1件は、旧fixtureが要求Evidenceの開始位置だけを設定し、終了位置が実際のfetch式と一致していなかった。実ソースに即した終了位置を設定し、検索・集合の期待値は維持した。

## 残る範囲

- **未解決**：git-lines全入力のブラウザWorker結果転送のメモリ制約。GUIは明示した別範囲で確認した。全入力のブラウザ成功や長時間安定を主張しない。
- **未対応**：任意のHTTPクライアント・可変aliasのデータフロー、任意shell、動的設定export、全Vite設定構文/全CLIオプション。設定は実行しない。
- **未特定**：動的URL、入力にないconfig、複数のアプリ境界があるroot、静的に解決できない出力。確認できた使用は残す。
- **未観測**：CLIの実行場所・起動/公開/DB適用の成功、実通信・クラウド稼働。
- **未検証**：全入力GUIの全操作組合せ、長時間heap/GPU/FPS、200%拡大、モバイル実機。原本の最新状態と固定snapshotの全ファイル差分までは比較していない。
- **対象外**：線の回り込み・粒子量・自動省略方式・配置方式の全面変更。
