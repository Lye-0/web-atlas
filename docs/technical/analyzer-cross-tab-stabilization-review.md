# Analyzer横断安定化・検証記録

2026-09-09。対象は現行作業ツリー（開始HEAD `91b471a8997a50832c1330024f79e06274469e2b`、branch `タブ８以降の実装`、開始差分なし）。Codex単独で実施。既存の2Dエクスプローラー、3D点群、検索・選択・Evidenceの契約を維持した。

## 1. 確定した原因と修正

|項目|実装・実測で確定した原因|修正|
|---|---|---|
|ST-01 残留|関係先として選ぶラベルと通常集約のラベルを別passで配置し、同じIDを2回返した。Reactの重複keyと、IDで1件を管理するDOM位置・hit領域の対応が崩れ、OFF後にも古い集約が残った。実git-linesと4 Flow Viewの共通fixtureで再現|配置をID単位で一度に制限。FlowLabelLayerでも一意性・有限座標を確認。描画を現行owner/region集合に限定。消えた集合への操作を拒否する|
|ST-02 操作負荷|密度判定が各点のオブジェクト・文字列key・所属indexを反復生成。ownerが同じでも表示グラフと表示名Mapを再構築。低zoomでも表示不能なラベル候補をソート。関係ごとの数値整形も多数重複|入力単位の数値index・scratch配列、4件までの密度/結果cache、同一ownerの再利用。表示グラフも4件まで再利用。表示名Mapをページから共有。ラベル候補を早期除外し、関係数の文字列を投影内で再利用|
|ST-02 反復時の保持|R3Fの別React rootのcleanupはCanvasのDOM除去より遅い。OrbitControlsが解除時にgetRootNode()を再取得すると、documentではなく外されたCanvasを参照し、documentのkeydown listenerが残る。GC後heap・listener増加でも再現|親DOM側layout cleanupでOrbitControlsを先に解除。Scene側cleanupとの二重解除を防止。Flow 3Dと同じ構成を使うArchitecture Mapへ適用。Moduleの固定角rendererはこのControlsを使わない|
|ST-03 調査対象|少数の直接相手まで集約に入り、具体名より所属ラベルが優先された。消去後も前の明示focus命令が残る経路があった。Moduleでは元の関係選択が所属全体を開き、解除しても手動閉状態へ戻らなかった|少数の直接相手、明示経路・選択関係の両端を個別表示・ラベル優先へ。選択変更/解除時に古い命令を破棄。Moduleの選択を所属開閉と分離し、rendererで必要な原IDだけ取り出す。初期化直後の3D Escapeも処理|
|ST-04 ラベル密度|長い所属名と通常の多数集約が選択周辺を占有|常時名は識別できる短い所属名＋件数、完全な所属・意味・確度はtooltip/内訳に保持。通常集約ラベルは最大8、選択/関係/hover/focusは別優先枠。Moduleは全代表点のhitを残し、常時captionだけ間隔と件数で制限|
|ST-05 内訳|消えた表示集合のIDを、現存する0件の集合のように扱った。表示集合と所属全体への操作範囲が分かりづらかった|集合消滅後は明示的に所属全体の説明へ移る。存在しない集合は一覧へ戻せる状態にする。「この所属のN対象を個別表示」等で作用先を明示。現在の個別/自動/手動所有を用いて数える|
|ST-06 同一定義|parseDateの原定義と4呼び出し文脈は正当な別IDだった。文脈表示で呼び出し位置を十分に識別できなかった|canonical生成は変更しない。呼び出しのファイル・行・範囲を短い識別表示と詳細へ追加。局所2Dにも完全なcontextの表示情報を渡す|

動画に見えた停止をGPU原因と断定していない。非同期旧計算の競合や一般的な投影原点フォールバックを、今回の実再現原因としては確認していない。

## 2. 適用範囲と各Viewの実操作

|安定View ID / 名称|方式・renderer|自動集約・ラベル|関連生成|適用範囲|
|---|---|---|---|---|
|architecture / Stack Map|2D / AnalyzerGraphStage|新3D集約なし / SVG|scanner/projectors|共通ページの選択・往復回帰|
|workspace / Workspace Flow|2D / AnalyzerGraphStage|同上|workspace facts|同上|
|command / Command Flow|2D / AnalyzerGraphStage|同上|scripts/commands facts|静的定義の選択・往復。原本のコマンドは実行しない|
|dependencies / Package Dependency|2D / AnalyzerGraphStage|同上|dependency facts|技術選択・往復回帰|
|module-dependency / Module Dependency|固定角3D / AnalyzerSpatialGraphStage・SpatialAtlasScene|moduleAutoAggregation / DOM・atlas|module facts|共通密度/内訳、固有のcaptionと手動閉状態|
|runtime-flow / Runtime Flow|2D/3D / SemanticFlowStage・Scene|flowAutoAggregation / FlowLabelLayer|runtime projection|共有集約、選択、label寿命、Controls解除|
|function-call-flow / Function Call Flow|同上|同上|functions/calls|同上、未特定先の手動閉状態|
|data-flow / Data Flow|同上|同上|dataFlow/refinement|起点の再現、2実入力の性能、文脈表示|
|data-model / Data Model|同上|同上|dataModels|共通修正、型の関係・項目・Evidence回帰|
|architecture-map / Architecture Map|平面表示（orbit=false） / SemanticGraphCanvas|独自の既存グループ / atlas|architectureGraph|新集約は対象外。共通のOrbitControls破棄問題は修正対象|

以下の「済」は**修正済み・再検証済み**、「問題なし」は記載条件で問題なし、「外」は記載理由により対象外を表す。全ての入力・機能の網羅を意味しない。

|View|ST-01 残留|ST-02 性能|ST-03 保護|ST-04 密度|ST-05 範囲|ST-06 複数対象|実操作の条件・証拠|
|---|---|---|---|---|---|---|---|
|Stack Map|問題なし|外：新集約なし|問題なし|外：新3D labelなし|外：新内訳なし|外：今回の文脈生成なし|git-lines 7対象、React選択、他View往復|
|Workspace Flow|問題なし|外：同上|問題なし|外|外|外|git-lines 3対象、pnpm workspace選択|
|Command Flow|問題なし|外：同上|問題なし|外|外|外|git-lines 9可視対象、buildの静的定義選択|
|Package Dependency|問題なし|外：同上|問題なし|外|外|外|git-lines 7可視/13対象、React選択|
|Module Dependency|済：ON/OFF/手動状態|問題なし：小入力4条件|済：閉じた所属の元関係|済：短名・hit保持|済：240対象の所属|外：call文脈なし|small 2対象の選択・hover・元imports・Evidence・Escape・手動復帰・全画面。dense 240対象をzoom outで自動1組→展開240→手動240/OFF→解除240、pointer pan|
|Runtime Flow|済|問題なし：小入力4条件、共有保持解消|済|済|済|問題なし：同名検索のID/場所|small 4対象の検索/相手hover/選択/2D現在地保持/解除。dense 7,680対象240組、32対象展開、OFF手動32と解除。git-lines最終版105対象で往復|
|Function Call Flow|済|問題なし：小入力4条件、共有保持解消|済|済|済|問題なし：外部先と原call保持|small 6対象の相手hover/選択/2D保持/解除、未特定先4対象の手動閉。dense 4,320対象241組、480対象の範囲操作。git-lines最終版2,079対象で往復|
|Data Flow|済：実入力でbefore再現→after消滅|済：大/小4条件＋新角度回転＋保持検証|済|済|済|済：正当な文脈を識別|git-lines 35,303対象とvehicle-management 142,244対象。smallで実dot click・相手hover・filter・明示2Dジャンプ。最大入力で選択/経路/2D・3D/Escape、入力切替。最終版でpointer回転・resize・fullscreen・空入力|
|Data Model|済|問題なし：小入力4条件、共有保持解消|済：元extends両端|済|済|問題なし：構造と文脈を混同しない|small 2対象、dense 3,840対象240組/16対象操作。git-lines 119対象132関係でGitCommit 13項目・継承両端・hover・Evidence 2・2D保持|
|Architecture Map|問題なし：新label混入なし|済：共通Controls解除。単独速度は未計測|問題なし|外：別label方式|外：新内訳なし|問題なし：確度「推定」を保持|git-lines 3対象3関係、Shared logic選択、独自自動グループON/OFF、最終版で選択・往復|

実操作記録はローカル `.cache/analyzer-cross-tab-stabilization-20260908/ui-*.json`。`ui-audit-all.json`は途中の失敗も含む履歴であり、全行PASSの一覧ではない。`after15-*`はControls解除修正後、`after16-*`/`final16-*`はスクロールバーを含む最終版。旧Moduleの手動復帰に失敗した記録はafter14の同操作で更新した。

## 3. 性能比較

値の一覧・各セル3回のmin/max・CPU内訳・canonicalハッシュ・heap記録は [測定集計JSON](analyzer-stabilization-metrics.json) に保存した。

- Windows、IAB Chromium 152、viewport **1440×1000、DPR 1**、Vite production相当ビルド。囲いON・パーティクル通常、同じ保存入力・query・選択・手動範囲・camera操作で比較。最終CSSではnative scrollbar幅が細くなるため、同じviewportでも利用可能な横幅は数px広い。
- beforeは開始HEADの隔離コピー（5220）。大規模afterは最終`after16`（5223）。小規模afterは性能処理が同じ`after13`（後続はModule選択状態、Canvas破棄、CSS）。全5 Viewを個別に操作・計測した。
- 各セル1ウォームアップ＋3測定。下表は**各測定のp95を3回で中央値**にした値。rAF callback間隔はメインスレッドの更新間隔であり、GPU描画時間/FPSではない。
- 「区間時間」はStartからStopまでで、ブラウザ操作ツールの通信待ちを含む。純粋なclick latencyや、体感速度の改善率として扱わない。CPU wrapperはinclusiveで、入れ子の値を足し合わせない。
- パン/zoomはArrowRight/Left/ZoomIn/Outを3周。git-linesはNumber.isFinite（logParser.ts:9）を選択し、Reset→選択へ移動→ZoomOut 6回、zoom 1.0046939300411526。回転は各回Shift+Right/Upを6周し、未訪問角度へ継続する。cache再訪だけの結果で判断しない。
- vehicle-managementは検索・選択なしの全景、142,244対象/151,076関係。ONは14組、OFFは142,244対象全て個別扱い。代表点だけを数えて性能PASSにしていない。

|入力・操作|before OFF|before ON|after OFF|after ON|
|---|---:|---:|---:|---:|
|git-lines パン/zoom：rAF p95 ms|83.2|399.9|16.8|16.8|
|同：区間中央値 ms|2,516.7|4,159.8|2,366.4|2,350.1|
|git-lines 新角度回転：rAF p95 ms|50.1|316.6|16.8|83.3|
|同：区間中央値 ms|1,216.7|4,117.4|766.1|1,616.9|
|vehicle-management 全景：rAF p95 ms|600.0|1,300.0|250.0|50.0|
|同：区間中央値 ms|10,491.1|13,255.3|5,392.1|2,466.7|

afterのp95範囲はgit-lines ONパン16.8–33.3ms、ON回転66.7–83.4ms、vehicle-management ON50ms、OFF233.3–266.8ms。全体として改善したが、大規模OFFを滑らかな固定FPSとはしていない。

ON集約CPU合計の中央値は、git-linesパン/zoomで1,659→0.2ms（18呼出し、再利用あり）、未訪問角度回転で1,215.8→169.1ms（12呼出し、密度再計算あり）。vehicle-management全景では9,904.1→2.2ms（18呼出し、再利用あり）。表示グラフ・表示名の再生成減少とラベル候補の早期除外も効いている。

|小入力のView（対象数）|before OFF/ON p95 ms|after OFF/ON p95 ms|after OFF/ON区間中央値 ms|
|---|---:|---:|---:|
|Module Dependency（2）|16.9 / 16.8|16.8 / 16.8|2,450.3 / 2,467.2|
|Runtime Flow（4）|16.8 / 16.8|16.8 / 16.8|2,484.3 / 2,567.5|
|Function Call Flow（6）|16.8 / 16.8|16.8 / 16.8|2,484.1 / 2,485.2|
|Data Flow（44）|16.8 / 16.8|16.8 / 16.8|2,500.1 / 2,429.4|
|Data Model（2）|16.8 / 16.8|16.8 / 16.8|2,449.9 / 2,448.8|

小入力はON/OFFとも全件個別、処理時間差はツール待ちの変動も含む。明瞭な悪化は観測していない。旧Module OFFの1測定8.1秒や中間版vehicle-management OFFの10.1秒などの外れ値は生データに残し、都合のよい値への置換はしていない。最終版とは別集計である。

### 反復とリソース

IABの最初の10周（ON/OFF、2D/3D、Runtime→Data Flow）で、同じ状態のDOM463・label8・Canvas1は一定だったがheap推定値が増えた。その時点では合格にせず、独立headless EdgeでGC後の保持を計測し直した。

|保持確認（git-lines、同じ操作6周）|解除修正前 after14|解除修正後 after15|
|---|---:|---:|
|GC後JS heapの開始→最終|153.4→500.6 MB|159.0→150.2 MB|
|GC後JS heap範囲|153.4–500.6 MB|143.4–159.0 MB|
|CDP event listener数の開始→最終|274→391|273→299（途中286へ戻る）|
|CDP DOM node数の開始→最終|1,221→1,851|1,216→1,247（途中1,205へ戻る）|
|生存Canvas（DOM）|1|1|

明示GCのある別ブラウザ検証をIABの性能比較とは混ぜていない。R3Fの遅延teardownを待った後に`Runtime.getHeapUsage`、`Memory.getDOMCounters`を読んだ。修正後は継続増加を確認していない。GPUメモリや全renderer内部object数は未計測であり、無制限の長期利用の漏れゼロを保証するものではない。

## 4. 代表操作のbefore/after

- **残留**：beforeはNumber.isFinite選択→Fit→OFFで35,303個別・自動0にもかかわらず古い集約が残り、反復で重複IDが1→2→5と増えた。afterでは同手順で自動label0、重複ID0。ON時は選択と少数相手4対象を個別に保持。
- **所属操作**：parsersの表示集合1,467対象に対し、所属全体は1,471対象（個別保護4）。展開後は個別1,471＋自動33,832。集合消滅を説明し、旧集合の0件表示を現存集合のように残さない。手動で閉じてOFFにすると個別33,836＋手動1,467。自動表示に戻すとOFFの35,303個別へ戻る。所属展開はカメラを動かさない。
- **Module**：閉じた2 Moduleの元importsを選ぶと両端だけ個別になり、Directoryは閉状態のまま。Escapeで手動2対象へ戻る。従来のページ側の所属自動展開がこの復帰を壊していた。
- **選択と関係**：smallのData Flowで点をクリックして元IDを選択、相手hoverでその関係を強調。Data ModelでGitCommitDetail→GitCommitを選ぶと両端をSource/Targetとして表示し、継承のEvidenceと元構造へ到達。2Dの現在地・cameraは通常往復で保持。
- **画面寿命**：最大入力→small、実入力→空入力、各View往復を確認。空入力では選択なし・label0・Canvas0。親のControls解除で切替のたびに古い3D graphをdocumentから保持する経路も切断した。

画像はローカル検証フォルダの`before-final-off-residue.png`、`after15-fullscreen.png`、`after16-scrollbar-drag.png`等。入力ソース一式は報告書へ埋め込まない。

## 5. ST-06：parseDateの判定

`src/git/parsers/logParser.ts`の原定義はL7のparameter `value`（範囲235–248）、L9のreturn（301–351）。呼び出しは以下の4箇所で、別文脈として正当だった。

|呼び出し|実引数|元callの範囲|
|---|---|---|
|L25|padded[4]|1104–1124|
|L28|padded[7]|1225–1245|
|L59|metadata[4] ?? ''|2498–2526|
|L62|metadata[7] ?? ''|2637–2665|

原parameterのIDは`data:src/git/parsers/logParser.ts:235-248:parameter`。各文脈parameterには`:context:data:…:<call-range>:operation`が付き、その文脈の実引数からの`passes-to`を1件ずつ持つ。戻り口は`context-return:data:…:<call-range>:operation`で、各context-operation→context-return→同じcallのcall-resultの`returns`に分かれる。原定義のreturnも別に保持される。

同名だから結合すると別呼び出しの値が混ざるため、生成側は変更しなかった。表示は「呼び出し L25(1104–1124)」等で識別し、完全な位置をtooltip/詳細/内訳に示す。実ブラウザでも内訳にL25/L28/L59/L62の戻り口が並ぶことを確認。根拠は`parseDate-context-review.json`と文脈分離・表示のテスト。

## 6. 正確性・変更ファイル

固定したgit-lines（77読込files）とvehicle-management（115読込files）をWeb Atlas側で静的解析し、5 semantic Viewの**nodes/edgesの全JSONハッシュ**が開始版と完全一致した。全fields・provenance・Evidence・方向を含む。ID一意性も検証。数値index化した密度計算は独立参照式で1,200点×24角度を比較し、owner/密集率を一致、数値metricsを許容精度内で確認した。

主要変更は以下。差分の全ファイルはローカルGitで確認できる。

- `src/analyzer/autoAggregation.ts`、`semantic/flowAutoAggregation.ts`：入力index、密度/owner/表示グラフ再利用、短名。
- `semanticFlowLabels.ts`、`SemanticFlow3D.tsx`、`AnalyzerSpatialGraphStage.tsx`：一意label、有効owner、具体相手の保護、優先枠。
- `AutoAggregationPanel.tsx`、`auto-aggregation.css`：存在しない集合の扱い、所属全体の件数と操作、Module caption。
- `semanticFlowDisplay.ts`、`SemanticFlow2D.tsx`、`SemanticFlowDetail.tsx`、`SemanticExplorerBlocks.tsx`、`SemanticExplorerNavigation.tsx`、`FlowAnalyzerPage.tsx`：文脈位置、表示情報共有、不要な再計算回避。
- `SemanticFlowStage.tsx`、`AnalyzerPage.tsx`：古い命令の解除、選択と手動所属開閉の分離。
- `canvasDisposals.ts`、`SemanticGraphCanvas.tsx`：CanvasのDOM除去前にControlsを破棄。実Controlsを使う回帰テストを追加。
- 上記に対応するunit/integration tests。`src/styles.css`は後続依頼のscrollbar調整。

## 7. 後続依頼：スクロールバー

白いnative trackを暗い画面になじませるため、dark color-schemeと薄いグリーングレーのthumb/透明trackを共通化。標準CSSのthinを使用し、非対応環境にはWebKit fallbackを用意。forced-colorsではOSの色と幅へ戻す。スクロール領域や操作を独自実装へ置き換えていない。

実ブラウザの集約内訳でthumbドラッグによりscrollTop 0→611となること、詳細パネルと検索の横スクロールが残ることを確認。画面全体のレイアウトや2D関係線の設計変更は行っていない。

## 8. コマンドと原本保全

|実行|結果|
|---|---|
|pnpm install --frozen-lockfile|成功、lockfile変更なし|
|pnpm build|成功。scrollbar最終CSS後も再実行。既存の500KB chunk警告あり|
|pnpm lint|成功|
|pnpm typecheck|成功|
|pnpm test|590 passed、8 skipped（外部入力等の条件付き検証）|
|固定実入力canonical比較＋密度等価性|別検証2件成功。通常suiteのskipと区別|
|git diff --check|成功|
|pnpm exec wrangler deploy --dry-run|成功、35 assets、no bindings、dry-run終了|

Wranglerは既存設定のまま、[公式のdry-run仕様](https://developers.cloudflare.com/workers/wrangler/commands/workers/)に沿って実行。本番デプロイ・push・mergeは行っていない。Web Atlasのesbuildがsandboxの親directory参照で起動できなかったコマンドは、許可された実行環境で再実行した。

原本2 repositoryのHEAD/status/全tracked file SHA（145＋345 files）は開始時と最終時で一致。原本でinstall/build/test等を実行せず、設定ファイルも文字列としてのみ静的解析した。測定用コード・入力コピーはWeb Atlas側の`.cache`に分離し、製品bundleには含めない。

## 9. 未再現・未計測・残る制約

- 指定名の動画は指定候補場所になく、レビュー記述と実入力による再現で進めた。動画そのものとの完全な視覚一致は未確認。
- GPU FPS/描画時間/メモリ、全GPU object数は未計測。event listener数は独立headless Edgeの保持確認のみ。IABのrAF比較とは分ける。
- 最大入力OFFは全対象を保持するため、最終版でもラベル更新時の停止が残る（p95約233–267ms）。入力直後の初回3D準備では操作ツールの短いdeadlineを超えることがあり、準備後に再操作・測定した。初回遅延ゼロとはしていない。
- 全View×全入力×全操作の組合せは網羅していない。View別の実施条件は表のとおり。実行Traceの新規読込、OS全種類、DPR変更、Safari/Firefoxの実機scrollbar、単独Architecture Mapの速度比較は未検証。
- 計測中のviewportが異なる中間試行、測定Start失敗、古い修正前提の結果は最終性能表に混ぜていない。原本ファイル・解析対象・Evidenceを削って改善したものではない。

確認した再現ケースには未解決のlabel残留・件数不整合・同じ状態への継続的なControls保持は残っていない。上記の測定限界と大規模OFFの負荷は引き続き制約として扱う。
