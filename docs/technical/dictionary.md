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

- Mapは `stackMap` の階層を再帰描画し、Category / Stack のIDから正規データを解決する。親子関係はDOMのborderとconnectorで表現し、Three.jsやReact Three Fiberは実装依存に含めない。
- Categoriesは `categories` を一覧表示し、選択したCategoryの `stacksForCategory`、下位Category、差分説明、関連Categoryを表示する。
- Stacksは `stacks` を一覧表示し、Category lookup、features、use cases、relationships、related stacks、公式URL、Analyzer用識別子を表示する。

## Search

`searchDictionary` はCategoryの名称・alias・概要と、Stackの名称・alias・package名・概要を正規化して検索する。名称、alias、package名、概要の順に高いスコアを付け、上位8件を返す。`DictionarySearch` は矢印キー、Enter、Escapeを扱い、選択時はReact Routerで対応URLへ遷移する。

## UI・アクセシビリティ方針

黒基調の静かなReference UIとし、色だけに意味を依存させない。semantic HTML、visible focus、keyboard操作、適切なlink / heading階層、モバイルでの一覧のカード化、`prefers-reduced-motion` を維持する。Mapはモバイルで極端に縮小せず、縦方向へ流れるレスポンシブ構造にする。

## Verification anchors

- `src/data/validateDictionary.test.ts`: 43 Category / 48 Stack、参照整合性、重複検出
- `src/utils/search.test.ts`: 名称・alias・package名検索と検索順位
- `src/utils/routes.test.ts`: stable ID lookupとURL生成
- `package.json`: `build`、`lint`、`typecheck`、`test` の品質ゲート
