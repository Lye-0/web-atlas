# Analyzer：選択残留・ON専用密度・性能レビュー

2026-09-09。今回の修正はCodex単独で実装・実操作・再検証した。F4の密度・背景表現の変更は自動省略ON限定。Dictionary、全体ヘッダー／フッター、2Dカード配置・線経路の再設計、解析拡張は対象外。本番デプロイ・push・merge・原本でのコマンド実行は行っていない。

## 1. 結果と確定原因

F1〜F4を修正し、共通Flowの4 ViewをON/OFFで再検証した。F5は選択応答、モード往復、ラベル処理の主要負荷で改善を実測した。ただし全指標が改善したわけではなく、巨大入力の長いフレーム間隔は残る。

| 項目 | 確定した原因 | 修正と適用範囲 |
|---|---|---|
| F1 | `SemanticFlowStage`が、保存中の2D `location.centerId/depth`から現在の3D経路を再生成していた。選択解除・置換が履歴の中心を消さないため、古い経路・粒子・保護対象が残った | `ExplorerVisit.activePath`を現在有効な明示経路の所有者とする。2D履歴・カメラは保存し、選択解除／置換時は現在visitのactivePathを無効化。通常のモード復元は無効化済みの経路を復活させず、明示的な戻るは保存visitを復元する。4 Flow共通 |
| F2 | Flowは内訳を開いた集約IDを`selectedIds`へ追加。Moduleは内訳だけの辺を強調していた | 実体選択と内訳を分離し「内訳を表示中」と表示。内訳参照は主選択・経路を変更せず、具体的なメンバー選択で主選択を更新。Moduleの内訳操作ボタンがパンくずと重なる局所配置も修正 |
| F3 | ラベルの強制配置候補が、別の重要点を普通の背景点と同じ扱いにしていた | 選択点・選択辺の両端・明示経路・hoverだけを40pxセルへ登録し、他の重要点周囲17pxを必須の除外領域にする。自分の点の既存clearance、引き出し線、画面外案内を維持。実体座標／辺の端点は不変 |
| F4 | 候補の投影span上限が密度より先に一律で集約を解除し、近接時に広い所属の数万点が戻った。画面外の所属も同様に展開された | ONでは読める小さな既存所属を先に採用し、広い候補の密集した残りを細かい所属からまとめる。Flowの画面外所属は自動展開を保留する。手動展開・現在の経路の保護が常に優先 |
| F5 | モード再訪で静的な所属・位置・準備済み入力を再構築。内訳未表示でも全originalRelationsを生成。ラベル投影が各点で2行列変換と全件一時配列を生成 | immutable graph＋explorerにWeakMapで静的入力を帰属。内訳データを遅延生成し再利用。ラベルは合成行列を1回作り、可視候補だけを確保。既存の4件上限の密度／結果cacheを維持 |

GPUがボトルネックであるか、報告動画と同じフレーム時間であったかは未確定。動画そのものは今回の計測根拠にしていない。点数減少だけを性能改善と扱っていない。

## 2. OFFの維持とONの境界

`projectAutoAggregation`はOFFで密度計算・密集残りの処理・画面外自動展開保留を実行しない。`retainOffscreen`の既定値はfalseで、FlowがON専用として利用する。ONの選択中だけ背景色を既存色の0.68倍にし、補助ラベル枠を控える。OFFは従来の色、サイズ、ラベル優先順位・予算、対象集合へ戻す。カメラを動かさず、自動Fit／再配置もしない。

密集判定は開始65%・維持40%の近接率を使用する。画面外判定は進入64px・復帰−24pxの幅を設ける。判定は既存の操作後サンプリングに従い、座標追従や選択反映を遅延させない。平行移動を除いた密度cacheを再利用しても、可視範囲は移動するため、画面外所属ID集合を結果cacheの条件に含める。透視投影一般へこの前提を拡張しない。

OFF比較ではメイン計測30組すべてで点ID・world座標・色・サイズのhashが一致した。24組はカメラ完全一致、4組は数値丸め差のみ、git-lines近接操作2組は初回フォーカス競合でzoomが異なったため厳密比較から除外した。追加計測は36組すべてでB/D・C/Eの選択とカメラが一致（許容1e-7）。追加OFF18組の点IDとworld座標は全件一致し、正常状態12組は色・サイズも一致した。

意図的なOFFの差は、F1による無効な経路・一時保護・強調の除去、F2の内訳表記、F3のラベル位置である。追加Data Modelの解除／関係0件への置換6組は、旧GitClientの強調が消えるため色・サイズが変わる。これはF1の修正として別記録している。手動3所属を開いた状態ではOFF35,303実体を保持した。

## 3. Viewごとの実操作

「修正済」は修正・再検証済み。「問題なし」は表に示す操作条件での確認。「対象外」は該当機能を持たない。「未計測」は性能数値を採っていないことを示す。

| View ID／名称 | F1 残留 | F2 状態の区別 | F3 端点ラベル | F4 ON密度 | OFF維持 | F5 性能 | 条件・証拠 |
|---|---|---|---|---|---|---|---|
| architecture / Stack Map | 問題なし | 対象外：自動集約なし | 対象外：2Dカード | 対象外：2D専用 | 問題なし | 未計測 | 実体をキーボード選択、拡大・縮小。既存AnalyzerGraphStage |
| workspace / Workspace Flow | 問題なし | 対象外：自動集約なし | 対象外：2Dカード | 対象外：2D専用 | 問題なし | 未計測 | 同上。各Viewを個別に操作 |
| command / Command Flow | 問題なし | 対象外：自動集約なし | 対象外：2Dカード | 対象外：2D専用 | 問題なし | 未計測 | 同上 |
| dependencies / Package Dependency | 問題なし | 対象外：自動集約なし | 対象外：2Dカード | 対象外：2D専用 | 問題なし | 未計測 | 同上 |
| module-dependency / Module Dependency | 問題なし | 修正済 | 対象外：別rendererの空間カード | 問題なし：共通密度部のみ | 問題なし | 未計測 | 検索→主選択→詳細閉じる、ON/OFF、縮小14回、集約内訳→具体的メンバー選択。主選択と経路の不変／更新を確認 |
| runtime-flow / Runtime Flow | 修正済 | 修正済 | 修正済 | 修正済 | 問題なし | 未計測 | git-lines、activate、ON/OFF。旧経路4→0、64状態検証の対象 |
| function-call-flow / Function Call Flow | 修正済 | 修正済 | 修正済 | 問題なし：当該選択では2,079個別を維持 | 問題なし | 未計測 | git-lines、runChecked、ON/OFF。旧経路7→0。読める配置の強制集約はしない |
| data-flow / Data Flow | 修正済 | 修正済 | 修正済 | 修正済 | 問題なし | A〜E計測、残る長いフレームあり | git-lines／vehicle-management／small。旧経路6→0、深さ2近接・手動展開も追加計測 |
| data-model / Data Model | 修正済 | 修正済 | 修正済 | 修正済 | 問題なし | A〜E計測 | GitClient→空白→EdgeGradient（0関係）、旧経路10→0、内訳参照でも主選択を保持 |
| architecture-map / Architecture Map | 問題なし | 対象外：自動集約なし | 対象外：legacyカード | 対象外：自動集約なし | 問題なし | 未計測 | 実体リスト選択と既存2D/3Dを確認。SemanticGraphCanvasはFlowの点ラベルとは別実装 |

共通FlowのON/OFF計8ケース・64状態で、実際のDOMラベル矩形と投影された重要点の重なりは0。選択、詳細閉じ、回転＋zoom、空白解除、通常モード復元、別対象選択、内訳参照を含む。詳細を閉じた後とドラッグ後の主選択／経路を比較した。

4 Flowそれぞれで、1行の検索結果、明示的な「3D上で位置を見る」「2Dで詳しく見る」、親へ／戻る、Evidence、粒子の通常／控えめ／オフ×ON/OFF（24設定状態）、分類囲いON/OFFを再確認。Data Flowで入力をsmallへ交換し、全Viewの旧入力の選択IDが消えることを確認した。既存View間リンク・履歴・遅延解析世代の契約はページ／sessionの自動テストで検証した。全リンクの全組合せを手動操作したという意味ではない。

## 4. 性能比較条件

| 条件 | 比較版 |
|---|---|
| A：導入前 | `f97bafe59bb72d7af596504bbc0de319a84cb625`。導入境界`91b471a8997a50832c1330024f79e06274469e2b`の直前 |
| B：修正前OFF / C：修正前ON | `f573c86e7abcb6457b4f1d334d01e3c1afcacd78` |
| D：修正後OFF / E：修正後ON | 上記HEADに対する本レビューの変更。runtime source fingerprint `897670b52276b2dd737081478f739faa2b7fe9e8aff5bbd0701da4289ef6f459`。計測snapshotと最終ソース149ファイルの一致を検証 |

作業ツリーを巻き戻さず、Web Atlasの比較用snapshotを別ディレクトリに作成した。全版production Vite build、同じWindows端末（Core i7-13700K、OS認識RAM約95.7GiB）・headless Microsoft Edge 152、1440×1000、DPR1。各trialは新しいbrowser/pageから開始し、同一の静的入力をロード。初期描画・フォーカス完了後に計測し、coldロード／shaderコンパイルの速度は本表に含まない。同一trial内では直前操作で温まったcacheを使用する。計測中は別のビルド／テスト／測定を重ねていない。

粒子は通常、分類囲いON、初期filterはall、同一検索・同一手順。回転20〜24イベント、パン、zoom往復、選択、モード往復をスクリプトで再現し、各条件3試行。操作前にcanvasをviewport内へscrollし、実カメラ値を採取した。メイン150操作、追加87操作。下表は**操作列の所要時間中央値 / RAF間隔p95の試行間中央値（ms）**。操作時間はブラウザ自動操作APIの完了時間であり、純粋なevent-to-paint latencyではない。RAFはmain thread callback間隔で、GPU描画時間やFPSではない。

### メイン比較

| 条件／操作 | A | B | C | D | E |
|---|---:|---:|---:|---:|---:|
| git-lines・俯瞰 | 2989 / 50 | 1585 / 17 | 994 / 17 | 1611 / 17 | 1027 / 17 |
| git-lines・再選択 | 173 / 183 | 302 / 50 | 301 / 50 | 78 / 17 | 104 / 33 |
| git-lines・モード切替 | 329 / 117 | 676 / 50 | 613 / 67 | 447 / 33 | 461 / 33 |
| vehicle-management・俯瞰 | 14416 / 283 | 5429 / 133 | 1263 / 17 | 5343 / 117 | 1298 / 17 |
| vehicle-management・選択付近 | 5923 / 183 | 5123 / 83 | 7012 / 250 | 2545 / 67 | 4456 / 250 |
| vehicle-management・再選択 | 573 / 883 | 1103 / 1033 | 1176 / 1100 | 155 / 217 | 344 / 283 |
| vehicle-management・モード切替 | 998 / 767 | 2102 / 367 | 2053 / 267 | 1073 / 234 | 1465 / 317 |
| small・俯瞰 | 899 / 17 | 900 / 17 | 900 / 17 | 900 / 17 | 900 / 17 |

Aの俯瞰は全入力で点ID／world座標／カメラ一致を確認した。Aのvehicle-management選択系は検索ランキングが異なり別canonical IDを選ぶため参考値であり、改善率を計算しない。git-linesのメイン近接操作は前述の初回focus競合があるため表から除外し、次の追加計測を用いる。破棄した初期スクリプトのcanvas外ドラッグ・未解除クリックは最終成績に含めない。

### 同一フォーカスを待った追加比較

| 条件／操作 | A | B | C | D | E |
|---|---:|---:|---:|---:|---:|
| Data Flow・2D深さ2から近傍回転 | 723 / 17 | 701 / 17 | 1004 / 83 | 681 / 17 | 926 / 50 |
| Data Flow・空白解除 | 86 / 33 | 50 / 17 | 51 / 17 | 76 / 17 | 65 / 17 |
| Data Flow・3所属手動展開後の回転 | — | 1551 / 33 | 583 / 17 | 1148 / 17 | 584 / 17 |
| Data Model・近傍回転 | 513 / 17 | 513 / 17 | 513 / 17 | 513 / 17 | 512 / 17 |
| Data Model・空白解除 | 6 / 17 | 7 / 17 | 6 / 17 | 6 / 17 | 6 / 17 |
| Data Model・関係0件へ選択 | 41 / 17 | 42 / 17 | 44 / 17 | 40 / 17 | 40 / 17 |

追加はgit-linesを使用。深さ2の2Dから3Dへ進み800ms以上待機後、zoom3回（5.184）と回転。空白は点／辺／ラベル／操作UIに当たらない投影位置でクリックし、selected=0を検証。B/Cに残った6／10経路がD/Eで0になる。Aは同じ選択・カメラでも直接関係のみ（Flow2本／Model4本）であり、B〜Eの深さ2（6／10本）とは仕事量が異なる参考値。

手動展開は同じ3所属`src`・`src/commands`・`src/git`の安定IDをUIから開き、Fit後に回転する。ONは2,332個別・38集約、OFFは35,303個別で前後一致。集約を開く直前の内訳件数はF1の保護解除で変化するが、手動対象の所属IDと最終表示集合は一致する。Aにこの操作はなく未計測。

### 主要負荷と残る性能差

vehicle-management ONの選択付近ではラベル投影CPUの区間合計中央値が2,215.4→825.8ms、1回あたり32.1→12.3ms（69→67回）になった。操作時間は7,012→4,456ms。一方、集約判定合計は679.9→746.0msで、全処理が短縮したわけではない。モード往復は2,053→1,465msだがRAF p95は267→317ms。俯瞰はC1,263/E1,298msとほぼ同程度で、OFFもB5,429/D5,343msの大きな負荷が残る。

git-lines ONの追加近接回転は1,004→926ms、RAF p95は83→50ms。試行0の個別表示は34,766→1,423、集約37→41、明示経路は6本を保持した。別の初期近接回帰操作ではON32,638個別＋129集約から1,051個別＋96集約（全描画点32,767→1,147）へ変化。世界内の個別表示数は画面内の点数と異なる。vehicle-managementの近接ではなお114,668個別が残る条件があり、任意の件数上限で削っていない。

OFFの俯瞰はgit-lines B1,585/D1,611ms（約1.6%差、p95同じ）で、改善を主張しない。追加空白解除はB50/D76ms、C51/E65msへ増えている。この操作は修正後に古い経路・保護を実際に無効化して表示を更新するため、B/Cと同じ仕事ではない。残る26ms／14msの差を純粋なCPU原因へ断定はしない。通常選択・モード往復・手動OFF回転は前記のとおり改善している。

関数ラッパーはinclusiveなCPU時間であり、呼び出し間で重複するので合算しない。Reactの計測値は関数実行の時間で、GPU drawやcommit全体ではない。各条件のRAF中央値、p95、long task件数、CPU時間・呼出回数、点／集約／ラベル／経路数・粒子設定は[数値データ](analyzer-selection-density-metrics.json)に収録した。

7回のON/OFF・View／2D／3D往復では、明示GC後heapは初回147.2MiB→再訪198.7MiB→最終199.6MiB。初再訪で保存状態と入力cacheが増え、以降は概ね横ばい。DOM469、ラベル8、canvas1は全回同じ、イベント購読276→301で以降一定。GPUメモリー・長時間運用のリークがないという保証ではない。

## 5. 正確性・原本・実行結果

git-linesは77入力ファイル、vehicle-managementは115入力ファイルをWeb Atlas側へ静的に読み込んだ。原本のソース／設定をimport・eval・requireしていない。small／dense／empty fixtureも含め、5入力×5 semantic ViewでA/B/Dの全canonical nodes・relations（属性、向き、種類、確度、Evidenceを含む）のSHA-256が一致した。重複IDと存在しない端点も検査した。変更後の解析部分は最終版まで不変である。

git-linesのcanonical数はRuntime105/98、Function Call2,079/3,335、Data Flow35,303/37,801、Data Model119/132、Architecture Map3/3（対象/関係）。集約の表示件数をcanonical数として比較していない。

原本の追跡ファイル内容・HEAD・statusは前後一致。git-lines `7a89625acba9cf64b1f0648fed64381330218184`の145ファイル、vehicle-management `8211ee8145425ef85b7cf1156a55cd0adf0db088`の345ファイルを照合した。原本でinstall/build/dev/test/migration/seedを実行せず、外部API／DBへ接続していない。

| コマンド | 結果 |
|---|---|
| `pnpm install --frozen-lockfile` | 成功。新規依存・lockfile変更なし |
| `pnpm typecheck` | 成功 |
| `pnpm lint` | 成功。sandboxのEPERM後、許可された権限で再実行 |
| `pnpm test` | 603成功、既存opt-in8 skipped、70ファイル（66成功／4 skipped） |
| `pnpm build` | 成功。sandboxのesbuild親ディレクトリ参照拒否後、許可された権限で再実行 |
| `pnpm exec wrangler deploy --dry-run` | 成功。35 assets、worker 0.34KiB。本番送信なし |
| `git diff --check` | 成功 |

buildの既存警告：browser向けfs/path externalization、tree-sitterのeval、500kB超chunk。今回の実操作でpageerrorは0。CPU/GPUの完全分離、他ブラウザ・端末、全ての入力／カメラの組合せ、数時間の連続運用は未検証である。

## 6. 最終差分と再検証入口

- 状態：`semanticExplorerState.ts`、`useSemanticExplorerNavigation.ts`、`SemanticExplorerNavigation.tsx`、`SemanticFlowStage.tsx`、`FlowAnalyzerPage.tsx`。純粋状態テスト・Stageテスト・ページテストを追加。
- 内訳：`SemanticFlow3D.tsx`、`AnalyzerSpatialGraphStage.tsx`、`auto-aggregation.css`。既存の内訳・主選択テストを強化。
- 密度：`autoAggregation.ts`。画面外境界／パンcache／hysteresis／OFF／手動保護とFlow非重複のテストを追加。
- 性能／ラベル：`flow3DInput.ts`、`semanticFlowLabels.ts`と端点保護テスト。
- 仕様：[semantic-analyzer.md](semantic-analyzer.md)、[analyzer.md](analyzer.md)。repository-memoryには有効経路と履歴の分離、広い所属の密度判断の修正、静的入力cacheの検証知識だけを保存。

ローカル証拠は`.cache/analyzer-selection-on-density-20260909/`。`benchmark-v2.mjs`、`supplement.mjs`、`regression.mjs`、`flow-controls.mjs`、`other-views.mjs`、`module-inspection.mjs`、`heap-review.mjs`が操作入口。比較版の`ReviewBootstrap`は計測専用snapshotへ挿入しており製品へ含めていない。入力snapshotとraw状態はGitへ追加せず、公開用には数値・hashのみのmetrics JSONを保存する。
