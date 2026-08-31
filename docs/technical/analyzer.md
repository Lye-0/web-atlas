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

Graphは新しい可視化ライブラリへ依存せず、[`src/analyzer/layout.ts`](../../src/analyzer/layout.ts) のView別の決定的なlayoutと、[`src/components/analyzer/AnalyzerGraphStage.tsx`](../../src/components/analyzer/AnalyzerGraphStage.tsx) のSVG/DOM rendererで構成しています。Workspaceは既存のcolumn flowを維持し、Architectureはcompact grid、Commandはexecution rank、Dependencyは責務ごとのlaneで配置します。これによりBundleを増やさず、Node・Edge選択、pan、wheel zoom、Fit、Reset、semantic zoomを同じモデル上で制御できます。

## Fact / Evidence model

共通モデルは [`src/analyzer/types.ts`](../../src/analyzer/types.ts) にあります。

- Fact: project、workspace config/pattern/package、package manifest/script、command、external package、technology、runtime、resource、.NET project
- Relation: contains、uses、uses-config、declares、matches、depends-on、resolves-to、executes、starts、runs-in、expands-to
- Evidence: relative file path、context line、exact line/column highlight range、kind、detectorId

Evidence detailは対象行の前後を含む短いcode contextを表示し、`mark` は検出したexact rangeだけに付けます。設定値をsource storeへ保存する前に、`B2_*`、`API`、`AUTH`、`ACCESS`、`SECRET`、`PRIVATE`、`PASSWORD`、`TOKEN`、`CREDENTIAL` 系keyのvalueをoffsetを変えずにmaskします。

View専用のSummary / detail表示は `AnalyzerViewNode.presentation` と `AnalyzerViewEdge.presentation` にだけ保持します。External Package、低優先度Technology、.NET detailを初期表示から畳んでも、Fact・Evidence・Relation storeそのものは削除・変更しません。

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

1. **Architecture Overview** — Project、workspace package、明示的に検出したWorker/D1/B2/Firebaseなどの主要構造を配置します。.NET / WPF detailと低優先度TechnologyはSummary Node配下へ初期collapseし、選択・Expandで元のFactを表示します。実際のEvidenceがないWeb→APIなどの関係は生成しません。
2. **Workspace Flow** — pnpm config、patterns、packageの関係を表示します。dependency graphは混ぜません。
3. **Command Flow** — rootの`dev`（なければrootの最初のscript）をentryとし、`pnpm run`、`--filter`、`pnpm exec`、CLI、`&&` / `||` / `;`、`concurrently`を再帰的に展開します。Node typeではなくexecution rankをx座標に使い、同時実行branchはbranch pathでy方向に分離します。unknown commandは警告付きで残し、cycleは警告とedgeを残します。
4. **Package Dependency** — workspace package、直接のdependency declarationから解決されたDictionary technology、未登録のExternal Packageをdirect dependency edgeで表示します。packageManager由来だけのpnpmは含めません。ExternalはSummary Nodeへ初期collapseし、表示/折りたたみを切り替えられます。検索・type filter・detail選択時は該当detailを一時表示します。

全ViewでNode search、type filter、Node/Edge選択、detail panel、Evidence previewを利用できます。

## Semantic zoom / 2.5D presentation

Graphの拡大率は [`src/analyzer/zoom.ts`](../../src/analyzer/zoom.ts) で3段階に量子化しています。`scale < 0.55` はFar、`0.55 <= scale <= 0.95` はMedium、`scale > 0.95` はNearです。Nearでは現在のviewport内にあるEvidence付きNodeだけを遅延展開し、非選択NodeでもZoomだけでcompact previewへ入ります。選択中のEvidence付きNodeはviewport外・FarでもNearとして扱います。これにより、全Nodeを同時に詳細化せず、既存のView layoutとRelationモデルを変更しないまま操作対象の周辺だけを詳しく表示します。

- Far: Node typeとlabelを中心に表示します。
- Medium: subtitleとEvidence件数を表示します。
- Near: selected/viewport内のNodeに、最初のEvidenceだけを使った3〜5行のcompact previewを表示します。exact highlight rangeはdetail panelと同じEvidenceCodeBlockで描画します。
- Detail panel: 常に従来どおり全Evidenceとsource contextを表示し、Node内previewとは情報量を分けます。

2.5Dの視覚階層は、z0のFine / Large grid、z1のcluster plane、z2のdefault edge、z3のnormal Node、z4のconnected / selected edgeとselected Node、z5のEvidence / interaction layerです。ClusterはNodeより暗く弱いsurface・上端のinner highlight・右下方向のsoft shadow、Nodeは控えめなelevationとsurface contrastで表現します。Edgeは通常Nodeの背面に見えるbase SVG、選択・接続Edgeは前面のforeground SVGへ分離し、Node textの上へ強い発光を重ねません。Neonや強いglassmorphismは使わず、Graph本体には新しい可視化ライブラリを追加していません。

Project未選択時の装飾orbitだけは、React Three Fiber / Three.jsをlazy importした別chunkで描画します。軌道線と`SphereGeometry`を同じ3D sceneに置き、lighting・perspective・depth testで球体として表示します。device pixel ratioは最大1.5に制限し、`prefers-reduced-motion`時はdemand renderingの静止scene、WebGLを利用できない場合やsceneの読込に失敗した場合は静止したCSS軌道線へfallbackします。この装飾が利用できなくてもFolder選択と説明内容には影響しません。

Canvas内のwheelはpassiveではないnative listenerで必ずpreventDefaultし、`overscroll-behavior: contain`も併用しています。wheel zoomを実行してもページ側へscroll chainingしないようにし、panやNode/Edge選択の既存操作を維持します。キャンバス背景のdrag開始ではselectionを抑制し、文字選択を起こさないようにしています。`prefers-reduced-motion`時は既存のreduced-motion設定に従い、transitionを抑制します。

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

合成fixtureは [`src/analyzer/analyzer.test.ts`](../../src/analyzer/analyzer.test.ts) にあり、parser range、workspace解決、Dictionary matching、D1/B2/Firebase/.NET detection、command recursion/concurrently/cycle、view scope、masking、Semantic Zoom、Architecture collapse、execution layout、External collapseの元Fact保持を検証します。

実装時の検証結果:

- `pnpm exec vitest run src/analyzer/analyzer.test.ts`: 12 tests passed
- `pnpm test`: 4 test files / 22 tests passed
- `pnpm typecheck`: passed
- `pnpm lint`: passed
- `pnpm build`: passed（Vite production bundle）
- `pnpm exec wrangler deploy --dry-run`: passed（No bindings found、dry-runで終了）
- Browser smoke / responsive viewport check: 前回Phase 2Aで実施済み。今回差分の実ブラウザ視覚確認は未実施
- Manual QA対象width: 1600 / 1440 / 1280 / 1100 / 1024 / 768 / 390px。今回のvehicle-management実フォルダ選択と各Viewの視覚確認は未実施
- `vehicle-management` はread-only QA対象であり、今回も変更していません

既存Dictionaryのcanonical ID・`packageNames`・Map scopeは変更せず、AnalyzerからDictionary detailへ既存stack routeを再利用しています。Repository memoryの既存Dictionary契約も実装前に再確認済みです。
