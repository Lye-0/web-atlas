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

Graphは新しい可視化ライブラリへ依存せず、[`src/analyzer/layout.ts`](../../src/analyzer/layout.ts) の決定的なcolumn layoutと、[`src/components/analyzer/AnalyzerGraphStage.tsx`](../../src/components/analyzer/AnalyzerGraphStage.tsx) のSVG/DOM rendererで構成しています。これによりBundleを増やさず、Node・Edge選択、pan、wheel zoom、Fit、Reset、semantic zoomを同じモデル上で制御できます。

## Fact / Evidence model

共通モデルは [`src/analyzer/types.ts`](../../src/analyzer/types.ts) にあります。

- Fact: project、workspace config/pattern/package、package manifest/script、command、external package、technology、runtime、resource、.NET project
- Relation: contains、uses、uses-config、declares、matches、depends-on、resolves-to、executes、starts、runs-in、expands-to
- Evidence: relative file path、context line、exact line/column highlight range、kind、detectorId

Evidence detailは対象行の前後を含む短いcode contextを表示し、`mark` は検出したexact rangeだけに付けます。設定値をsource storeへ保存する前に、`B2_*`、`API`、`AUTH`、`ACCESS`、`SECRET`、`PRIVATE`、`PASSWORD`、`TOKEN`、`CREDENTIAL` 系keyのvalueをoffsetを変えずにmaskします。

## Parsers and detectors

- `package.json`: package name、pnpm packageManager、scripts、direct dependencies
- `pnpm-workspace.yaml` / `.yml`: `packages` patternとpattern-to-package matching
- Wrangler JSON/JSONC/TOML: Worker name/main、D1 binding、明示されたBackblaze B2 key
- `firebase.json` / `.firebaserc`: Firebase、Auth emulator
- `vite.config.*`、`tsconfig*.json`: Vite / TypeScript configuration
- `.csproj`、`.sln`、`.slnx`: project name、`UseWPF`、`ProjectReference`

Parserは値とsource rangeを返し、detectorがFact・Evidence・Relationを生成します。Package dependencyは4つのdirect dependency sectionだけを読み、`workspace:*` は検出済みworkspace packageへ解決します。Dictionaryとのtechnology matchingは既存canonical stackの `packageNames` を利用し、未登録のdirect dependencyはExternal Packageとして残します。

## Views

Analyzer shellには次の4つのprojectorがあります。

1. **Architecture Overview** — Project、workspace package、明示的に検出したWorker/D1/B2/Firebase/.NETなどを配置します。実際のEvidenceがないWeb→APIなどの関係は生成しません。
2. **Workspace Flow** — pnpm config、patterns、packageの関係を表示します。dependency graphは混ぜません。
3. **Command Flow** — rootの`dev`（なければrootの最初のscript）をentryとし、`pnpm run`、`--filter`、`pnpm exec`、CLI、`&&` / `||` / `;`、`concurrently`を再帰的に展開します。unknown commandは警告付きで残し、cycleは警告とedgeを残します。
4. **Package Dependency** — workspace package、Dictionaryにmatchしたtechnology、未登録のExternal Packageをdirect dependency edgeで表示します。Externalは表示/折りたたみを切り替えられます。

全ViewでNode search、type filter、Node/Edge選択、detail panel、Evidence previewを利用できます。

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

合成fixtureは [`src/analyzer/analyzer.test.ts`](../../src/analyzer/analyzer.test.ts) にあり、parser range、workspace解決、Dictionary matching、D1/B2/Firebase/.NET detection、command recursion/concurrently/cycle、view scope、maskingを検証します。

実装時の検証結果:

- `pnpm exec vitest run src/analyzer/analyzer.test.ts`: 7 tests passed
- `pnpm test`: 4 test files / 17 tests passed
- `pnpm typecheck`: passed
- `pnpm lint`: passed
- `pnpm build`: passed（Vite production bundle）
- Browser smoke check: local synthetic Filesで空状態、全4 view、Node/Evidence detail、External toggle、mobile widthを確認
- Vehicle Management実フォルダをBrowserのfolder pickerで選択する手動検証: 実施前（この時点では自動fixture検証のみ）

既存Dictionaryのcanonical ID・`packageNames`・Map scopeは変更せず、AnalyzerからDictionary detailへ既存stack routeを再利用しています。Repository memoryの既存Dictionary契約も実装前に再確認済みです。
