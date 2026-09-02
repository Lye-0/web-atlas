# Analyzer / Phase 2A

## Purpose

Analyzerは、ブラウザでユーザーが選択したローカルProject Folderを、アップロードせずに解析する機能です。解析結果とView別の操作状態はApp lifecycleのAnalyzer Session Storeに保持し、DictionaryなどのSPA routeへ移動しても再スキャンしません。Reload後は再選択します。

実装の入口は [`src/pages/AnalyzerPage.tsx`](../../src/pages/AnalyzerPage.tsx) です。`showDirectoryPicker()` を優先し、未対応Browserでは `webkitdirectory` のfile inputへフォールバックします。

## Pipeline

```text
Project Folder
  -> fileDiscovery
  -> parsers
  -> detectors / scan
  -> Fact + Evidence + Relation store
  -> App-lifetime Analyzer Session Store
  -> view projectors
  -> deterministic SVG / DOM graph
```

解析対象は構造情報を持つ設定ファイルに限定しています。`.git`、依存・生成物、`.env`、秘密情報用拡張子は除外し、JSON/JSONCの設定値はサイズ上限（1 MiB）も設けています。

Graphは新しい可視化ライブラリへ依存せず、[`src/analyzer/layout.ts`](../../src/analyzer/layout.ts) のView別の決定的なlayoutと、[`src/components/analyzer/AnalyzerGraphStage.tsx`](../../src/components/analyzer/AnalyzerGraphStage.tsx) のSVG/DOM rendererで構成しています。Stack MapはProject / Scope / Stack Usageのcompact grid、Workspaceはcolumn flow、Commandはexecution rankとbranch lane、Dependencyは責務ごとのlaneで配置します。Relation edgeは [`src/analyzer/edgeRouting.ts`](../../src/analyzer/edgeRouting.ts) が現在のlayoutに基づくFact Node・Collapsed Summary Card・Summary heading / control・重要labelだけをhard obstacleとして受け取り、Cluster surfaceとExpanded Summary surfaceは通過可能なまま、clearance付きの決定的なorthogonal routeを計算します。routeのbendは距離・hard obstacle・交差・bend penaltyに加え、Node外周のsoft keep-out、近接距離、連続遮蔽、source / target terminal legのreadability costで選び、複数Nodeの背後を連続走行するより少し長い空きcorridorを適度に優先します。Command / Dependencyのleft-to-right flowでは適切なboundary portとx-monotonicityを優先します。同一sourceのfan-outはedge kindとtarget group（clusterまたはpresentation parent）単位に限定し、現在のtarget Node boundsからtarget group boundsを算出します。専用busはsourceとtarget groupの間のclear corridorを優先し、left-to-rightではtarget groupのx-range内部をshared trunkが縦断しない候補だけを優先評価します。各branchのsibling targetとshared trunkの両方でhard obstacle回避とreadability cost評価を行い、十分なbus corridorがない場合だけgeneric routingへfallbackします。bundle edgeはFact fan-outへ混ぜず、RelationのIDとFact Modelは変更しません。SVG描画時の角だけをclamped quadraticで丸めます。Summaryの展開、選択、検索/Filter、Entry、Detail開閉、カメラは [`src/analyzer/session.ts`](../../src/analyzer/session.ts) のApp-lifetime Session Storeを単一のsource of truthとしてGraph / Detail / Toolbar / Cluster・Lane headerで共有し、Viewごとに保持します。active Analyzer ViewもSessionに保持し、`/analyzer` の入口は最後に作業していたViewへredirectします。再生成されたProjectionにはstable IDから選択・Edge・Summary・Entryを再解決し、存在しない値だけを安全にfallbackします。展開・折りたたみ時はsemantic anchorを同じ画面位置へ保ちます。初回表示でそのViewに保存済みcameraがない場合と明示的なFitだけが現在のlayout boundsに合わせてカメラを収め、route復帰・remount・通常のlayout再生成ではsaved cameraをFitで上書きしません。Detail Panelの開閉などでGraphの表示幅が変わる場合は、選択Node（Edge選択時は端点）が表示領域外へ出るときだけ最小限の補正を行い、表示中ならカメラ位置を維持します。Fitは全体表示、Resetはカメラと表示状態の初期化として役割を分けています。

Fan-out成立時は、generic routerへ各Fact Edgeを再投入せず、現在のtarget group boundsからBus Corridorを先に確定します。確定したbusを共有する`source segment → shared bus segment → target branch → target boundary`を各Edge IDごとに構成し、成功したrouteを先に登録して後段のgeneric routingによる上書きを防ぎます。left-to-rightの専用busはtarget group左端から32px以上離し、source側のx-monotonicityを維持します。候補がない、またはhard obstacle・bounds・x-monotonicityを満たす候補がない場合だけgeneric routingへfallbackします。`AnalyzerEdgeRoutingOptions.onFanoutDiagnostic`を指定すると、開発・テスト時にfan-out検出、候補数、選択bus座標、target bounds、fallback理由を取得できます。これはUIには表示しません。

Fan-outの方向は個別Nodeの中心距離だけで決めず、sourceとtarget groupのright / left / down / up side gapを比較します。明確な水平分離がある場合は、縦長target groupの中心が下にある場合でもright / leftを先に評価します。preferred directionのBusが成立しない場合は他の方向候補も検証し、validなstructural Busがあればgeneric fallbackを行いません。診断には方向別のside gap、候補数、valid候補数、preferred / selected direction、評価順を含めます。

## Fact / Evidence model

共通モデルは [`src/analyzer/types.ts`](../../src/analyzer/types.ts) にあります。

- Fact: project、workspace config/pattern/package、package manifest/script、command、external package、technology、runtime、resource、.NET project
- Relation: contains、uses、uses-config、declares、matches、depends-on、resolves-to、executes、starts、runs-in、expands-to
- Evidence: relative file path、context line、exact line/column highlight range、kind、detectorId

Stack Mapの`stackUsages`はFact Storeを置き換えず、canonical `stackId`・scope ID・Evidence ID・roleを組み合わせたView-levelのUsageです。Stackの検出とEvidence pathからのScope attributionを分離することで、同じCanonical Stackを複数Scopeへ確実に表示し、root toolingをApplicationへ誤帰属させません。

Evidence detailは対象行の前後を含む短いcode contextを表示し、`mark` は検出したexact rangeだけに付けます。GraphのNear compact hintはcontext windowの開始行ではなく、exact rangeの行（複数行なら範囲）を表示します。設定値をsource storeへ保存する前に、`B2_*`、`API`、`AUTH`、`ACCESS`、`SECRET`、`PRIVATE`、`PASSWORD`、`TOKEN`、`CREDENTIAL` 系keyのvalueをoffsetを変えずにmaskします。

View専用のSummary / detail表示は `AnalyzerViewNode.presentation`、`AnalyzerViewModel.presentationGroups`、`AnalyzerViewEdge.presentation` にだけ保持し、表示数は `AnalyzerViewModel.counts` でvisible / total / hiddenを分離します。External Package、低優先度Technology、workspace package、.NET detail、Command branchを初期表示から畳んでも、Fact・Evidence・Relation storeそのものは削除・変更しません。Summaryを展開したまま子Nodeを選んでcollapseした場合は、所有するSummary / groupへ選択をfallbackし、Detailからも同じgroupをcollapseできます。Collapsed SummaryはSUMMARY marker・count・Expand affordanceを持つ破線のSummary Cardとして描画し、Expanded SummaryはSummary自身を内側のNode Cardとして重ねず、name・count・Collapseを統合した見出しと子Node全体を囲む破線・透明面のSummary Group Regionとして描画します。Summary detailは通常Nodeの後ろへまとめて連続配置し、ネストしたSummary Cardは親Region内のcompact rowへ縮退します。Expanded Regionは見出し専用の22pxとmember gap 16pxをlayout / CSSの両方で確保します。さらに、headingのvisualTop、heading height、heading clearance、heading overhangを持つvisual boundsを算出し、直前のNode / Cluster heading / Summary Regionのbottomから外側gap 16pxを確保する共通collision resolverで同一Cluster / Lane内の後続要素を押し下げます。Nested Regionも子headingのvisual boundsを基準に親Regionを拡張するため、親heading・子heading・memberが重なりません。Structural Cluster / Command laneはSummaryの展開操作を兼ねず、solidな構造背景として維持します。External Packagesだけはtop-level Summaryの見出しを外側Clusterの重複titleとして表示しません。Summary Groupのvisual bounds（outline・heading・Collapse control・heading overhangを含む）はGraphのlayout boundsにも加え、Fit時に見出しや輪郭が切れないようにします。Relationのforward labelと、選択Nodeから見たinverse labelは [`src/analyzer/relations.ts`](../../src/analyzer/relations.ts) で分離します。

## Parsers and detectors

- `package.json`: package name、pnpm packageManager、scripts、direct dependencies
- `pnpm-workspace.yaml` / `.yml`: `packages` patternとpattern-to-package matching
- Wrangler JSON/JSONC/TOML: Worker name/main、D1 binding、明示されたBackblaze B2 key
- `firebase.json` / `.firebaserc`: Firebase、Auth emulator
- `vite.config.*`、`tsconfig*.json`: Vite / TypeScript configuration
- `.csproj`、`.sln`、`.slnx`: project name、`UseWPF`、`ProjectReference`

Parserは値とsource rangeを返し、detectorがFact・Evidence・Relationを生成します。Package dependencyは4つのdirect dependency sectionだけを読み、`workspace:*` は検出済みworkspace packageへ解決します。Dictionaryとのtechnology matchingは [`src/data/index.ts`](../../src/data/index.ts) のcanonical `packageNames` lookupを利用し、未登録のdirect dependencyはExternal Packageとして残します。Factに確定した`dictionaryStackId`がある場合だけ、Detail PanelのNode titleを既存のstable Stack routeへ内部Link化します。表示labelからURLを組み立てず、bare `firebase`のようにProduct / capabilityの解釈が曖昧な値はリンクしません。`firebase` は設定から検出されるFirebase本体をprimary technologyとし、`firebase.json` のAuthはresourceのcapability/detailとして扱います。Dictionaryのstack定義は変更していません。

## Views

Analyzer shellには次の4つのprojectorがあります。

1. **Stack Map** — 既存の`architecture` route / session IDを互換性のため維持しつつ、表示上の意味をProject → Scope / Area → Stack Usageへ再定義します。Scopeは既存のworkspace package、設定ファイル、.csprojなどのEvidence pathからdeterministicに帰属し、各ScopeにはDictionaryのcanonical Stackだけを配置します。root packageの開発用dependencyはProject Root / Toolingに留め、Web / APIへ推測で帰属させません。同じStackが複数ScopeでEvidenceを持つ場合は、Scopeごとの別Usageとして表示します。Architecture Map（将来のSubsystem / Module関係を扱うView）とは分離し、Stack Mapへ内部実装や細かいpackage dependencyを混ぜません。
2. **Workspace Flow** — pnpm config、patterns、packageの`uses-config`、`declares`、`matches`だけを主線として表示します。`contains`やdependency graphは主グラフへ混ぜず、Detailでは選択方向に応じて`config-for`などのinverse labelを表示します。
3. **Command Flow** — rootの`dev`（なければrootの最初のscript）をentryとし、初期状態はCOMMON laneのUser Command → entry script → concurrentlyとbranch summaryまでに抑えます。`concurrently`より右側のbranchだけをAUTH / API / WEBなどの独立したY laneへ割り当て、各lane内はexecution rankの左から右へ進めます。Branch summaryを展開すると、そのbranchの`pnpm --filter`、package script、CLI、nested commandを表示します。`pnpm run`、`--filter`、`pnpm exec`、CLI、`&&` / `||` / `;`、`concurrently`のEvidenceを保持し、主線は`resolves-to`、`executes`、`starts`、`expands-to`に限定します。execution rankをx座標、COMMON / branch laneを薄い背景bandとして使い、Workspace Package自体はGraph Nodeにせずscript metadata / laneへ寄せます。unknown commandは警告付きで残し、cycleは警告とedgeを残します。
4. **Package Dependency** — workspace package、直接のdependency declarationから解決されたDictionary technology、未登録のExternal Packageをdirect dependency edgeで表示します。packageManager由来だけのpnpmは含めません。Externalは閉じた状態ではExternal Summaryとsourceごとのbundle edgeを表示します。External dependencyのsourceが1つだけなら、Summaryを展開した時点でsource Summaryを挟まずpackage Nodeを直接表示します。sourceが複数なら従来どおりsource Summaryをcompact rowで表示し、個別展開でそのsourceのpackageだけを表示します。Shared ExternalはNodeを重複させません。Global toggleは全source groupを一括展開 / 折りたたみます。展開されたExternalはsource packageごとの縦groupへ配置され、External同士のedgeや横方向のchainに見える配置を作りません。External Packagesのtop-level headingはCluster titleと重ねず、source SummaryのNested Region headingは深度に応じて内側へ配置します。検索・type filter・detail選択時は該当detailと1-hop contextを一時表示します。

Current Viewsは次の4つです。

```text
1. Stack Map
2. Workspace Flow
3. Command Flow
4. Package Dependency
```

Future Viewsとして、次を予約しています。今回の実装対象はStack Mapだけで、`Architecture Map`を含む下記Viewはまだ実装しません。

```text
5. Module Dependency
6. Runtime Flow
7. Function Call Flow
8. Data Flow
9. Data Model
10. Architecture Map
```

Stack MapはEvidence-backedな主要StackのScope帰属を示し、Architecture Mapは将来、Repository AccessやLayout EngineなどのSubsystem / Module構造を示すViewです。Package Dependencyは低レベルの直接dependency宣言を示すため、両者を同じNode一覧や関係線として扱いません。

全ViewでNode search、type filter、Node/Edge選択、detail panel、Evidence previewを利用できます。Stack Mapで高degree Nodeを選ぶと、1-hopをprimary、2-hopをsecondary、3-hop以降をdeepとしてemphasisします。

## Analyzer session / Dictionary link

[`src/analyzer/session.ts`](../../src/analyzer/session.ts) と [`src/analyzer/sessionProvider.tsx`](../../src/analyzer/sessionProvider.tsx) のContext + reducerがAnalyzerのproject storeと、directory pickerで選択したfolder handleをApp lifetimeで保持します。Sessionにはactive viewと、Stack Map（内部ID: architecture）、Workspace、Command、DependencyそれぞれのSummary展開、選択、検索/Filter、Entry、Detail開閉、camera transformをstable ID / serializable valueとして保持します。route移動やBrowser Back / ForwardではProviderを再生成せず、Projection後に現在のNode / Edge / Summaryへ再解決して再利用します。明示的にView routeを開いた場合はURLとSessionのactive viewを同期し、`/analyzer` やHeaderのAnalyzer導線からはSessionのactive viewへ戻ります。Folderを明示的に選び直した場合だけproject store、folder handle、active view、全View状態を新しいSessionへ置き換えます。Sessionはreloadやtab closeを越えて永続化しません。

Dictionaryへの導線は、Fact / Resourceが保持する検証済みの`dictionaryStackId`を [`src/analyzer/projectors.ts`](../../src/analyzer/projectors.ts) でcanonical Stackへ解決し、Detail Panelのtitle自体をReact Routerの内部Linkとして描画します。Project、workspace/package、command、Summary、未登録・曖昧なNodeはplain titleのままです。Link移動でもAnalyzer Session Storeのscan result、selection、Detail、View別cameraは失われず、Browser Back / ForwardとDictionary各routeからのAnalyzer復帰で同じ作業状態を再利用します。

## Semantic zoom / 2.5D presentation

Graphの拡大率は [`src/analyzer/zoom.ts`](../../src/analyzer/zoom.ts) で3段階に量子化しています。`scale < 0.55` はFar、`0.55 <= scale <= 0.95` はMedium、`scale > 0.95` はNearです。Nearでも全Nodeを詳細化せず、Evidence付きNodeはcompact hintまでに留め、3〜5行のcompact previewはSelected時だけ遅延展開します。SelectedのEvidence previewはFar / Mediumでも保持します。Hoverはborder / surface / shadowのvisual feedbackだけを与え、Nodeの高さやlayoutを変更しません。これにより、全Nodeを同時に詳細化せず、既存のView layoutとRelationモデルを変更しないまま操作対象の周辺だけを詳しく表示します。

- Far: Node typeとlabelを中心に表示します。
- Medium: subtitleとEvidence件数を表示します。
- Near: 通常のEvidence付きNodeには`filePath:line`のcompact evidence hintを表示します。hintを表示する場合は重複するEvidence件数を省き、Stack Mapのcompact Nodeでもtitle・subtitle・hintが固定高さ内で欠けないようにします。3〜5行のcompact previewはSelected Nodeだけに表示し、HoverではNodeのsurface / border / shadowのみを強調します。通常のNodeはsource / metadataを抑制表示し、Evidenceが1件だけの場合は反復的な`Evidence 1`を表示しません。exact highlight rangeはdetail panelと同じEvidenceCodeBlockで描画します。
- Detail panel: 未選択時は閉じ、選択時だけ開きます。選択中は全Evidenceとsource contextを表示し、Focus Selected、関係先への移動、Closeを提供します。Closeは選択Node / Edgeを保持したままPanelだけを閉じ、背景クリックまたはEscで選択・detailを解除します。

2.5Dの視覚階層は、z0のFine / Large grid、z1のCluster Plane、z1上のSummary Group Region、z2のdefault・focused edge、z3のnormal Fact Node、z5のSelected NodeとEvidence / interaction layerです。Summary GroupはClusterより前、Edgeより後ろに置き、transparent surface・dashed outline・headingで所属範囲を示します。見出しは`◇ name · count — Collapse`の形でRegion自身に統合し、内側にSummary Node Cardを置きません。Regionはheading height + member gap + member bounds + bottom paddingをboundsへ含めます。Layoutではこのlogical boundsとは別にheadingのvisualTopを持ち、上側のheading overhangと通常gapを含めたvisual boundsで前方Blockとのcollisionを判定します。Nested Regionの親headingと子headingも同じvisual boundsで縦方向に分離します。ネスト深度が増えるほどoutline・surface・shadowを弱めます。Cluster tintは弱め、bottom/right shadow・top highlight・inner shadingで奥の板として表現します。Normal Nodeにはtight contact shadow、Selected Nodeにはsmall liftと少し広いshadowを使います。EdgeはNodeより背面に置き、source / targetのboundary portからorthogonalに配線します。hard obstacleはFact Node・Collapsed Summary・heading / control・重要labelに限定し、Cluster / Expanded Summaryのsurfaceは通過させます。同一sourceのfan-outはtarget groupごとにshared trunkを作り、target groupの外側に専用bus corridorを確保して、sibling Nodeとtrunkを含む全hard obstacleを避け、left-to-rightではsource側へx逆走しないようにします。通常Edgeはopacity 0.5程度に抑え、Nodeの直接関連Edgeは同じroute geometryをforegroundへ移して#22D3EE基準のcyan stroke・2.6px程度の太さ・控えめなglowで表示します。Selected Edgeは同じroute geometryをforeground layerの最後に再描画し、関連Edgeより明るく太いcyan strokeと強めのouter glowで識別します。矢印先端はEdgeの表示状態に対応する明示的な色を持つ9px markerとして描画し、Selected / Related / Bundle / Deepの色を線とそろえます。NodeまたはEdge選択中は非関連Edgeを0.46程度へ減衰させますが、Node選択時のconnected edgeが最も強く、focus emphasisは非関連Edgeへ適用する優先順位を保ちます。流れるアニメーションは追加しません。選択・hoverは同じroute geometryを使い、NodeのEvidence PreviewやSummary展開でlayout boundsが変わった場合は現在のNode boundsで専用busを再計算します。Relation EdgeのIDは維持します。Neonや強いglassmorphismは使わず、Graph本体には新しい可視化ライブラリを追加していません。

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

合成fixtureは [`src/analyzer/analyzer.test.ts`](../../src/analyzer/analyzer.test.ts) にあり、parser range、workspace解決、Dictionary matching、D1/B2/Firebase/.NET detection、command recursion/concurrently/cycle、forward / inverse relation label、COMMON / branch summary / lane、view scope、visible / total count、masking、Semantic Zoom、exact Evidence range hint、Summary Card / Summary GroupのPresentation metadata・count・共通bounds・展開Summaryの内側Node非表示、heading専用領域とmember gap、heading visual bounds / overhang、直前Blockとのcollision、Nested Regionの親子間隔、Stack Map初期projection / high-degree depth emphasis / Summary detailの連続配置、execution layout、single-source Externalのflat presentation、multi-source External / Shared Externalのgrouping、collapsed search、Summary headingを含むFit boundsを検証します。 [`src/analyzer/edgeRouting.test.ts`](../../src/analyzer/edgeRouting.test.ts) はhard / soft obstacle分類、Fact Node・Collapsed Summary・headingの迂回、orthogonal routeのboundary port、collinear / short-zigzag簡略化、角丸描画、交差 penalty、Node外周のsoft keep-out、連続遮蔽の非線形penalty、alternative corridor、source / target terminal leg、shared trunkのreadability cost、sibling targetを含む同一source fan-out、target group boundsを使った構造的な専用busとbranch、individual Edgeの独立reroute防止、target group外側のbus clearance、target group内部candidateの回避、branchのsibling obstacle、dynamic bounds、corridor unavailable時のgeneric fallback、選択Presentationによるgeometry不変、x-monotonicity、個別Edge ID保持を検証します。 [`src/analyzer/edgePresentation.test.ts`](../../src/analyzer/edgePresentation.test.ts) は選択Edgeをforeground内の最後に配置する優先順位とNode選択時のconnected edge順序を検証します。 [`src/data/stackLookup.test.ts`](../../src/data/stackLookup.test.ts) はpackage / alias / ambiguous lookup、[`src/components/analyzer/AnalyzerDetailPanel.test.tsx`](../../src/components/analyzer/AnalyzerDetailPanel.test.tsx) はstable IDによるtitle Linkとplain title、[`src/analyzer/session.test.ts`](../../src/analyzer/session.test.ts) はactive view、View別Session / camera / folder handle保持、Projection後のstable ID再解決、新規Project時のresetを検証します。Cameraのsaved/initial-fit判定は [`src/analyzer/analyzer.test.ts`](../../src/analyzer/analyzer.test.ts) で検証します。
Fan-out diagnosticsは`AnalyzerEdgeRoutingOptions.onFanoutDiagnostic`を使って、方向候補別のside gap・Bus成立数、候補単位のObstacle reject理由、Bus成立時の選択方向 / 座標、corridor不足・候補無効時のgeneric fallback理由を検証します。

実装時の検証結果:

- `pnpm test`: 9 test files / 81 tests passed（Stack MapのProject → Scope / Stack Usage投影・scope帰属・root tooling分離、Analyzerの既存回帰24 tests、Edge Routingの30 tests、Readability-aware RoutingとStructural Fan-out Route Composition、Geometry-aware Fan-out Direction Selectionの回帰を含む）
- `pnpm typecheck`: passed
- `pnpm lint`: passed
- `pnpm build`: passed（Vite production bundle。Three.js lazy chunkのサイズ警告あり）
- `pnpm exec wrangler deploy --dry-run`: passed（No bindings found、dry-runで終了）
- Analyzer fixture projection: Stack MapはProject → Scope / Area → Stack Usageの階層、scopeごとのcanonical Stack Usage、root toolingの分離、1000×600 viewportのFitを確認。Commandは5 visible / 10 total、collapsed時はCOMMON + 2 branchの3 laneを確認。Dependencyはsingle-source時にExternal Summary → package detailを確認し、multi-source時はExternal Summary → source Summary → package detail、Shared Externalの単一Node表示を確認
- Browser smoke: `http://127.0.0.1:5173/analyzer/architecture` の未選択状態で、Analyzer Header / Footer、Folder picker、Detail panel非表示、console error / warningなしを前回確認。今回の再確認では`agent-browser` CLIが環境に存在せず、Summary同期・group collapse・Detail camera補正を含むGraphデータ入りの操作確認は未実施
- Responsive viewport check: 1600 / 1440 / 1280 / 1100 / 1024 / 768 / 390pxは今回未実施
- `vehicle-management`の実フォルダ選択、各View、全幅の視覚確認はread-only Manual QAとして今回未実施
- `vehicle-management` はread-only QA対象であり、今回も変更していません

既存Dictionaryのcanonical ID・`packageNames`・Map scopeは変更せず、AnalyzerからDictionary detailへ既存stack routeを再利用しています。Repository memoryの既存Dictionary契約も実装前に再確認済みです。
