# Analyzer / Phase 2A

## Purpose

Analyzerは、ブラウザでユーザーが選択したローカルProject Folderを、アップロードせずに解析する機能です。解析結果は現在のBrowser session内のReact stateだけに保持し、Reload後は再選択します。

実装の入口は [`src/pages/AnalyzerPage.tsx`](../../src/pages/AnalyzerPage.tsx) です。`showDirectoryPicker()` を優先し、未対応Browserでは `webkitdirectory` のfile inputへフォールバックします。

## Pipeline

```text
Project Folder
  -> fileDiscovery
  -> parsers
  -> detectors / scan
  -> Fact + Evidence + Relation store
  -> view projectors
  -> deterministic SVG / DOM graph
```

解析対象は構造情報を持つ設定ファイルに限定しています。`.git`、依存・生成物、`.env`、秘密情報用拡張子は除外し、JSON/JSONCの設定値はサイズ上限（1 MiB）も設けています。

Graphは新しい可視化ライブラリへ依存せず、[`src/analyzer/layout.ts`](../../src/analyzer/layout.ts) のView別の決定的なlayoutと、[`src/components/analyzer/AnalyzerGraphStage.tsx`](../../src/components/analyzer/AnalyzerGraphStage.tsx) のSVG/DOM rendererで構成しています。Workspaceはcolumn flow、Architectureはcompact grid、Commandはexecution rankとbranch lane、Dependencyは責務ごとのlaneで配置します。Summaryの展開状態は [`src/pages/AnalyzerPage.tsx`](../../src/pages/AnalyzerPage.tsx) の単一stateをGraph / Detail / Toolbar / Cluster・Lane headerで共有し、展開・折りたたみ時はsemantic anchorを同じ画面位置へ保ちます。初回表示と明示的なFitだけが現在のlayout boundsに合わせてカメラを収め、Detail Panelの開閉などでGraphの表示幅が変わる場合は、選択Node（Edge選択時は端点）が表示領域外へ出るときだけ最小限の補正を行い、表示中ならカメラ位置を維持します。Fitは全体表示、Resetはカメラと表示状態の初期化として役割を分けています。

## Fact / Evidence model

共通モデルは [`src/analyzer/types.ts`](../../src/analyzer/types.ts) にあります。

- Fact: project、workspace config/pattern/package、package manifest/script、command、external package、technology、runtime、resource、.NET project
- Relation: contains、uses、uses-config、declares、matches、depends-on、resolves-to、executes、starts、runs-in、expands-to
- Evidence: relative file path、context line、exact line/column highlight range、kind、detectorId

Evidence detailは対象行の前後を含む短いcode contextを表示し、`mark` は検出したexact rangeだけに付けます。設定値をsource storeへ保存する前に、`B2_*`、`API`、`AUTH`、`ACCESS`、`SECRET`、`PRIVATE`、`PASSWORD`、`TOKEN`、`CREDENTIAL` 系keyのvalueをoffsetを変えずにmaskします。

View専用のSummary / detail表示は `AnalyzerViewNode.presentation`、`AnalyzerViewModel.presentationGroups`、`AnalyzerViewEdge.presentation` にだけ保持し、表示数は `AnalyzerViewModel.counts` でvisible / total / hiddenを分離します。External Package、低優先度Technology、workspace package、.NET detail、Command branchを初期表示から畳んでも、Fact・Evidence・Relation storeそのものは削除・変更しません。Summaryを展開したまま子Nodeを選んでcollapseした場合は、所有するSummary / groupへ選択をfallbackし、Detailからも同じgroupをcollapseできます。Collapsed SummaryはSUMMARY marker・count・Expand affordanceを持つ破線のSummary Cardとして描画し、Expanded Summaryは子Node全体を囲む破線・透明面のSummary Group Regionと、必要に応じて選択されたSummary anchorとして描画します。Structural Cluster / Command laneはSummaryの展開操作を兼ねず、solidな構造背景として維持します。Summary GroupのboundsはGraphのlayout boundsにも加え、Fit時に見出しや輪郭が切れないようにします。Relationのforward labelと、選択Nodeから見たinverse labelは [`src/analyzer/relations.ts`](../../src/analyzer/relations.ts) で分離します。

## Parsers and detectors

- `package.json`: package name、pnpm packageManager、scripts、direct dependencies
- `pnpm-workspace.yaml` / `.yml`: `packages` patternとpattern-to-package matching
- Wrangler JSON/JSONC/TOML: Worker name/main、D1 binding、明示されたBackblaze B2 key
- `firebase.json` / `.firebaserc`: Firebase、Auth emulator
- `vite.config.*`、`tsconfig*.json`: Vite / TypeScript configuration
- `.csproj`、`.sln`、`.slnx`: project name、`UseWPF`、`ProjectReference`

Parserは値とsource rangeを返し、detectorがFact・Evidence・Relationを生成します。Package dependencyは4つのdirect dependency sectionだけを読み、`workspace:*` は検出済みworkspace packageへ解決します。Dictionaryとのtechnology matchingは既存canonical stackの `packageNames` を利用し、未登録のdirect dependencyはExternal Packageとして残します。`firebase` は設定から検出されるFirebase本体をprimary technologyとし、`firebase.json` のAuthはresourceのcapability/detailとして扱います。Dictionaryのstack定義は変更していません。

## Views

Analyzer shellには次の4つのprojectorがあります。

1. **Architecture Overview** — Project、Application、Shared Workspace summary、明示的に検出したWorker/D1/B2/Firebaseなどの主要構造を10〜15 Node程度に収めます。Projectから低優先度Technologyへ直接fan-outせず、TypeScript / Vitest / pnpmなどの開発補助Technology、.NET / WPF detail、共有workspace packageはSummary Node配下へ初期collapseし、選択・Expandで元のFactを表示します。主要Framework / Runtime / Resourceは直接表示し、実際のEvidenceがないWeb→APIなどの関係は生成しません。高degreeなProject選択ではprimary / secondary / deepのedge emphasisを使います。
2. **Workspace Flow** — pnpm config、patterns、packageの`uses-config`、`declares`、`matches`だけを主線として表示します。`contains`やdependency graphは主グラフへ混ぜず、Detailでは選択方向に応じて`config-for`などのinverse labelを表示します。
3. **Command Flow** — rootの`dev`（なければrootの最初のscript）をentryとし、初期状態はCOMMON laneのUser Command → entry script → concurrentlyとbranch summaryまでに抑えます。`concurrently`より右側のbranchだけをAUTH / API / WEBなどの独立したY laneへ割り当て、各lane内はexecution rankの左から右へ進めます。Branch summaryを展開すると、そのbranchの`pnpm --filter`、package script、CLI、nested commandを表示します。`pnpm run`、`--filter`、`pnpm exec`、CLI、`&&` / `||` / `;`、`concurrently`のEvidenceを保持し、主線は`resolves-to`、`executes`、`starts`、`expands-to`に限定します。execution rankをx座標、COMMON / branch laneを薄い背景bandとして使い、Workspace Package自体はGraph Nodeにせずscript metadata / laneへ寄せます。unknown commandは警告付きで残し、cycleは警告とedgeを残します。
4. **Package Dependency** — workspace package、直接のdependency declarationから解決されたDictionary technology、未登録のExternal Packageをdirect dependency edgeで表示します。packageManager由来だけのpnpmは含めません。Externalは閉じた状態ではExternal Summaryとsourceごとのbundle edgeを表示し、External Summaryを展開するとsource Summary Cardを表示します。source Summaryを個別に展開すると、そのsourceのpackageだけを表示し、Shared ExternalはNodeを重複させません。Global toggleは全source groupを一括展開 / 折りたたみします。展開されたExternalはsource packageごとの縦groupへ配置され、External同士のedgeや横方向のchainに見える配置を作りません。検索・type filter・detail選択時は該当detailと1-hop contextを一時表示します。

全ViewでNode search、type filter、Node/Edge選択、detail panel、Evidence previewを利用できます。Architectureで高degree Nodeを選ぶと、1-hopをprimary、2-hopをsecondary、3-hop以降をdeepとしてemphasisします。

## Semantic zoom / 2.5D presentation

Graphの拡大率は [`src/analyzer/zoom.ts`](../../src/analyzer/zoom.ts) で3段階に量子化しています。`scale < 0.55` はFar、`0.55 <= scale <= 0.95` はMedium、`scale > 0.95` はNearです。Nearでも全Nodeを詳細化せず、Evidence付きNodeはcompact hintまでに留め、3〜5行のcompact previewはSelected時だけ遅延展開します。SelectedのEvidence previewはFar / Mediumでも保持します。Hoverはborder / surface / shadowのvisual feedbackだけを与え、Nodeの高さやlayoutを変更しません。これにより、全Nodeを同時に詳細化せず、既存のView layoutとRelationモデルを変更しないまま操作対象の周辺だけを詳しく表示します。

- Far: Node typeとlabelを中心に表示します。
- Medium: subtitleとEvidence件数を表示します。
- Near: 通常のEvidence付きNodeには`filePath:line`のcompact evidence hintを表示します。hintを表示する場合は重複するEvidence件数を省き、Architectureのcompact Nodeでもtitle・subtitle・hintが固定高さ内で欠けないようにします。3〜5行のcompact previewはSelected Nodeだけに表示し、HoverではNodeのsurface / border / shadowのみを強調します。通常のNodeはsource / metadataを抑制表示し、Evidenceが1件だけの場合は反復的な`Evidence 1`を表示しません。exact highlight rangeはdetail panelと同じEvidenceCodeBlockで描画します。
- Detail panel: 未選択時は閉じ、選択時だけ開きます。選択中は全Evidenceとsource contextを表示し、Focus Selected、関係先への移動、Closeを提供します。Closeは選択Node / Edgeを保持したままPanelだけを閉じ、背景クリックまたはEscで選択・detailを解除します。

2.5Dの視覚階層は、z0のFine / Large grid、z1のCluster Plane、z1上のSummary Group Region、z2のdefault・focused edge、z3のnormal Fact Node、z5のSelected NodeとEvidence / interaction layerです。Summary GroupはClusterより前、Edgeより後ろに置き、transparent surface・dashed outline・headingで所属範囲を示します。Cluster tintは弱め、bottom/right shadow・top highlight・inner shadingで奥の板として表現します。Normal Nodeにはtight contact shadow、Selected Nodeにはsmall liftと少し広いshadowを使います。EdgeはNodeより背面に置き、選択EdgeもNodeの前へ出しすぎません。Neonや強いglassmorphismは使わず、Graph本体には新しい可視化ライブラリを追加していません。

Project未選択時の装飾orbitだけは、React Three Fiber / Three.jsをlazy importした別chunkで描画します。軌道線と`SphereGeometry`を同じ3D sceneに置き、lighting・perspective・depth testで球体として表示します。device pixel ratioは最大1.5に制限し、`prefers-reduced-motion`時はdemand renderingの静止scene、WebGLを利用できない場合やsceneの読込に失敗した場合は静止したCSS軌道線へfallbackします。この装飾が利用できなくてもFolder選択と説明内容には影響しません。

Canvas内のwheelはpassiveではないnative listenerで必ずpreventDefaultし、`overscroll-behavior: contain`も併用しています。wheel zoomを実行してもページ側へscroll chainingしないようにし、panやNode/Edge選択の既存操作を維持します。キャンバス背景のdrag開始ではselectionを抑制し、文字選択を起こさないようにしています。Node typeはmarker形状とaccentで差別化し、Summaryはdashed / soft surface、bundle edgeは破線と集約labelで区別します。常時表示の操作ヒントは置かず、`?` Helpから操作方法を開けます。`prefers-reduced-motion`時は既存のreduced-motion設定に従い、transitionを抑制します。

Analyzer routeではHeader / Footerも`Analyzer` / `Local Evidence Graph`へ切り替え、Dictionary用の`Phase 1 · Technical Dictionary`表記を表示しません。

## Privacy and unsupported scope

解析はlocal browser session内で完結し、network upload、Cloudflare Worker/D1 call、AI inferenceは実装していません。選択フォルダ以外のfilesystemも読みません。

Phase 2Aでは次を対象外とします。

- JavaScript/TypeScript ASTによるfunction/data-flow解析
- lockfileからのtransitive dependency解決
- package installやbuildの実行
- source code全体の一般検索
- 未確認のsemantic relationの推測
- production/remote dataの取得

BrowserのFile System Access APIがない場合はdirectory file inputを使います。Browserのpermission、symlink、巨大binaryなどの挙動はBrowserごとの差があります。

## Validation

合成fixtureは [`src/analyzer/analyzer.test.ts`](../../src/analyzer/analyzer.test.ts) にあり、parser range、workspace解決、Dictionary matching、D1/B2/Firebase/.NET detection、command recursion/concurrently/cycle、forward / inverse relation label、COMMON / branch summary / lane、view scope、visible / total count、masking、Semantic Zoom、Summary Card / Summary GroupのPresentation metadata・count・共通bounds、Architecture初期projection / high-degree depth emphasis、execution layout、External collapse / source別expand / global expandの元Fact保持、External source grouping / shared node / no-chain、collapsed search、Fit paddingを検証します。

実装時の検証結果:

- `pnpm test`: 4 test files / 31 tests passed（Analyzer単体21 testsを含む）
- `pnpm typecheck`: passed
- `pnpm lint`: passed
- `pnpm build`: passed（Vite production bundle。Three.js lazy chunkのサイズ警告あり）
- `pnpm exec wrangler deploy --dry-run`: passed（No bindings found、dry-runで終了）
- Analyzer fixture projection: Architectureは12 visible / 15 total / 19 edges、1000×600 viewportのFit scaleは約60.9%。Commandは5 visible / 10 total、collapsed時はCOMMON + 2 branchの3 laneを確認。DependencyはExternal Summary → source Summary → package detailの段階展開を確認
- Browser smoke: `http://127.0.0.1:5173/analyzer/architecture` の未選択状態で、Analyzer Header / Footer、Folder picker、Detail panel非表示、console error / warningなしを前回確認。今回の再確認では`agent-browser` CLIが環境に存在せず、Summary同期・group collapse・Detail camera補正を含むGraphデータ入りの操作確認は未実施
- Responsive viewport check: 1600 / 1440 / 1280 / 1100 / 1024 / 768 / 390pxは今回未実施
- `vehicle-management`の実フォルダ選択、各View、全幅の視覚確認はread-only Manual QAとして今回未実施
- `vehicle-management` はread-only QA対象であり、今回も変更していません

既存Dictionaryのcanonical ID・`packageNames`・Map scopeは変更せず、AnalyzerからDictionary detailへ既存stack routeを再利用しています。Repository memoryの既存Dictionary契約も実装前に再確認済みです。
