# Dictionary 現行設計

## 目的と境界

Web Atlas Phase 1 は、Web 開発の分類と具体的な技術をたどる静的な Dictionary Web アプリである。画面は Stack Map、Categories、Stacks の3領域で構成する。

Phase 1 の責務は Dictionary の表示・検索・相互リンク・データ検証までであり、Project Analyzer、local file access、backend、database、authentication、3D Map は対象外とする。

## 現在の構成

- `src/data/categories.ts` が Category の正規データを保持する。
- `src/data/stacks.ts` が Stack の正規データを保持する。
- `src/data/map.ts` は Category / Stack の本文を複製せず、Map の表示階層と参照IDだけを保持する。
- `src/data/index.ts` が起動時にデータ検証を実行し、ID lookup mapとCategory別のStack取得を公開する。
- `src/pages/` はルート単位の画面、`src/components/` はレイアウト・検索・Map・詳細表示のUIを担当する。

## 公開構成

Vite の build 出力 `dist` を Cloudflare Workers Static Assets から配信する。ルートの
`wrangler.jsonc` は `assets.directory` を `./dist` に固定し、`not_found_handling` を
`single-page-application` に設定することで、BrowserRouter の deep link を `index.html` に
fallback させる。backend Worker、binding、DB、Auth、APIは持たない静的構成である。

- `pnpm dev`: Vite の開発サーバー
- `pnpm preview:cloudflare`: build後に `wrangler dev` でWorkers配信をローカル確認
- `pnpm deploy`: build後に `wrangler deploy` でCloudflareへ公開

GitHubからの自動公開（Workers Builds）のProduction / Preview設定は
[`docs/technical/deployment.md`](deployment.md) に分離して記録する。

## データモデルと不変条件

`CategoryEntry` と `StackEntry` は安定した `id` を持ち、表示名の変更とは独立して URL と将来の Analyzer から参照できる。Stack は少なくとも次の接続用メタデータを持つ。

- `categoryId`
- `packageNames`
- `aliases`
- `relatedStackIds`
- `relationships[].targetStackId`

`validateDictionary` は Category / Stack ID の重複、URLで使えないID、存在しない Category / Stack 参照、package名の複数所有、Mapへの未掲載を検出する。正規データは起動時に `assertValidDictionary` を通過しなければならない。

## Routing と画面遷移

`BrowserRouter` を使い、次の URL を公開する。

```text
/                         -> /dictionary/map
/dictionary               -> /dictionary/map
/dictionary/map
/dictionary/categories
/dictionary/categories/:categoryId
/dictionary/stacks
/dictionary/stacks/:stackId
```

Category・Stackの一覧、Mapノード、詳細ページ内の関連リンクは同じ route helper (`src/utils/routes.ts`) から URLを生成する。未知のIDは空画面にせず、`NotFoundPage` で一覧への導線を示す。

## A/B/C の生成

- Mapは `stackMap` の階層を再帰描画し、`dictionaryVisualGroups` で大分類を整理する。Category / Stack のIDから正規データを解決し、親子関係はDOMのborderとconnectorで表現する。Three.jsやReact Three Fiberは実装依存に含めない。
- CategoriesはMapと同じ `dictionaryVisualGroups` で索引を整理し、選択したCategoryの `stacksForCategory`、下位Category、差分説明、関連Categoryを表示する。
- Stacksは `stacks` を一覧表示し、Category lookup、features、use cases、relationships、related stacks、公式URL、Analyzer用識別子を表示する。Stacks filterも同じ大分類を利用する。

## Phase 1.2 Presentation Contract

Phase 1.2では、Map・Categories・Stacks filterが同じ5つの表示グループを共有する。これは正規のCategory taxonomyや `parentCategoryId` を置き換えるものではなく、画面上のナビゲーションを揃えるためのpresentation groupingである。

- `src/data/dictionaryGroups.ts` が「言語と実行基盤」「UIとアプリケーション」「データとストレージ」「品質と検証」「開発と配信」と、各グループに属するroot Category IDを一元管理する。
- `validateDictionaryVisualGroups` は、存在しないCategory、rootでないCategory、重複登録、未登録のroot Categoryを起動時に検出する。
- 利用者向けのsummary・description・role・use case・relationship文は `src/data/categories.ts` と `src/data/stacks.ts` の正規データに直接保持する。表示時に大量の文字列置換を行う補助層は使用しない。
- MapはWeb開発全体の俯瞰、Categoriesは分類概念の理解、Stacksは個別技術の理解を担当する。Mapの通常ノードではsummaryを繰り返さず、Stacks一覧ではactive statusとstable IDを主役にしない。
- `categoryId`、`packageNames`、`aliases`、`relatedStackIds`、`relationships` などAnalyzer接続用metadataは正規データに残し、Stack詳細の開発者向けメタデータで確認できる。

## Search

`searchDictionary` はCategoryの名称・alias・概要と、Stackの名称・alias・package名・概要を正規化して検索する。名称、alias、package名、概要の順に高いスコアを付け、上位8件を返す。`DictionarySearch` は矢印キー、Enter、Escapeを扱い、選択時はReact Routerで対応URLへ遷移する。

## Phase 1.3 Presentation Contract

MapのDesktop表示は5列均等配置を使わず、`Web開発`を起点に中央の縦幹と左右2レーンで5大visual groupを表示する。左レーンは「UIとアプリケーション」「品質と検証」、右レーンは「言語と実行基盤」「データとストレージ」「開発と配信」とし、各groupは`dictionaryVisualGroups`の`side` / `order`を使って配置する。Mapのコネクタは通常のdividerより明確にし、Category / Stackの内部Treeは既存のmarkerと字下げを維持する。

Mapは`max-width: 1100px`以下で左右レーンを圧縮せず、1列の縦Treeへ切り替える。Rootから5大groupへの縦接続は狭幅でも残し、長いCategory / Stack名を文字サイズの縮小で解決せず、通常の単語境界で折り返す。Mapの通常ノードではsummaryを表示しない。

Stacksの「すべて」は同じ5大visual groupごとに区切って表示し、個別filter選択時はgroup見出しを重複させない。Stack名の近くにCategoryリンクを置き、`active` statusは隠し、例外statusだけを共通日本語ラベルで表示する。内部Dictionaryリンクの矢印は`→`、公式サイトなど外部リンクは`↗`とする。Categoriesの階層とDetailのDocument構造は維持する。

## Phase 1.3.1 Presentation Contract

Phase 1.3.1では、中央幹型のDesktop Mapを維持したまま、左レーンを右レーンの視覚的mirrorとして扱う。右レーンは「中央幹 → group → Category → Stack」、左レーンは「Stack ← Category ← group ← 中央幹」の方向で、左右のgroup heading、marker、Tree connectorがそれぞれ中央幹側を向く。5大visual groupのheadingはMap専用のmarkerlessな構造見出しとし、group descriptionはMap上に表示しない。

左レーンのTreeは、`min-width: 1101px`で`padding-right`、`right`側のpseudo connector、`row-reverse`のmarker配置を使って明示的に反転する。各Tree `li` の縦線とbranch線は別のpseudo elementで描画し、`li:last-child`では縦線を自身のbranch位置で止める。`transform: scaleX(-1)`、Canvas、SVG座標のJavaScript計算は使わない。group branchはmarkerlessなheading行へ接続し、中央幹を装飾線ではなく5大groupの親構造線として見せる。

Mapのセクション見出しは`構造`とし、`Web開発`はTree Rootに1回だけ表示する。Root descriptionはMapに表示せず、Categoryは四角marker、Stackは円形markerを維持しつつ、Categoryをやや強く、Stackをやや控えめに表示する。Mapの階層indentはgroup、Category、child branchごとに確保し、長い名称は通常の単語境界で折り返す。

`max-width: 1100px`では中央幹を隠し、左レーンの反転を解除して、Rootから5大groupへ続く通常方向の1列Vertical Treeへ戻す。狭幅では`map-mobile-group-list`の`ul > li`としてgroupを`dictionaryVisualGroups`のpresentation metadata（`order`）順に描画し、Rootの縦線と各groupのbranchを静的CSSで接続する。canonical taxonomyやCategory / Stack ID、Analyzer metadataは変更しない。

## UI・アクセシビリティ方針

黒基調の静かなReference UIとし、色だけに意味を依存させない。semantic HTML、visible focus、keyboard操作、適切なlink / heading階層、モバイルでの一覧のカード化、`prefers-reduced-motion` を維持する。Mapはモバイルで極端に縮小せず、縦方向へ流れるレスポンシブ構造にする。

## Phase 1.1 Presentation Contract

Phase 1.1 は正規Dictionaryデータを変更せず、3画面の役割と情報の見せ方を整理する。画面ごとの責務は次のとおりとする。

- **Map**: Web開発技術の全体像を見る画面。表示は大分類、Category、Stack、親子関係を中心とし、通常状態でsummaryを繰り返さない。
- **Categories**: 分類概念を理解する画面。親子階層を字下げと接続線で示し、分類の詳細ページで役割・比較・代表Stackを読む。
- **Stacks**: 個別技術を理解する画面。一覧は名称・Category・概要に絞り、Category filterで探し、詳細ページで責務・特徴・利用場面・関係・公式サイトを読む。

Stable ID、`categoryId`、package名、alias、関連ID、relationship metadataは正規データに残す。一覧やMapでは利用者向け情報を優先し、Stack詳細の「開発者向けメタデータ」に折りたたんで表示する。relationshipのkindは利用者向けには日本語の関係ラベルへ変換する。既存のBrowserRouter、Deep Link、Not Found、検索、Browser historyの契約は維持する。

## Verification anchors

- `src/data/validateDictionary.test.ts`: 43 Category / 48 Stack、参照整合性、重複検出、5大visual groupのroot割り当て検証
- `src/utils/search.test.ts`: 名称・alias・package名検索と検索順位
- `src/utils/routes.test.ts`: stable ID lookupとURL生成
- `package.json`: `build`、`lint`、`typecheck`、`test` の品質ゲート
