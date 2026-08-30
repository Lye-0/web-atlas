---
id: rm-20260830-dictionary-map-mirror
topic: dictionary
type: decision
status: active
maturity: reused
created: 2026-08-30
last_verified: 2026-08-30
source_commit: "f55ba84"
related_files:
  - src/components/map/StackMap.tsx
  - src/styles.css
  - src/data/dictionaryGroups.ts
  - docs/technical/dictionary.md
tags:
  - dictionary
  - presentation
  - map
  - mirror
  - responsive
  - accessibility
supersedes: null
promoted_to: null
---

# Dictionary Mapの左右mirror契約

## Conclusion

DesktopのDictionary Mapは中央幹型2レーンを維持し、右レーンを「中央幹からgroup・Category・Stackへ進むTree」、左レーンをその視覚的mirrorとして「中央幹から左へgroup・Category・Stackが分岐するTree」とする。左レーンはCSSの`padding-right`、`right`側pseudo connector、`flex-direction: row-reverse`で反転し、`transform: scaleX(-1)`やJavaScriptの座標計算には依存しない。5大visual groupはmarkerlessなheadingとして中央幹へ接続し、Mapにはgroup descriptionを表示しない。Tree connectorは親`ul`の連続borderではなく、各`li`の縦線とbranch線を分けて描画し、非末尾は兄弟間を縦に接続し、`li:last-child`は自身のbranch位置で縦線を止める。Categoryは四角marker、Stackは円形markerを維持し、前者をやや強く後者をやや控えめに表示する。

Mapのセクション見出しは`構造`、Tree Rootは`Web開発`の1回だけとする。Root descriptionは表示しない。狭幅ではmirrorを解除する。`max-width: 1100px`で中央幹を隠し、`map-mobile-group-list`の`ul > li`を`dictionaryVisualGroups.order`順に描画して、Rootから5大visual groupを追える1列Vertical Treeとして表示する。Rootの縦線とgroup branchは静的CSSで接続し、Group単位の縦線も最後のGroup見出しで止め、配下のCategory / Stackまで不要に延長しない。

## Scope

Applicable:
- `StackMap`のDesktop左右2レーン表示
- section heading / Tree Root、markerless group heading、Category / Stack marker、親子connectorの左右方向
- `dictionaryVisualGroups`のpresentation groupingを使うresponsive切替とmobile `ul > li`構造

Do not apply:
- `src/data/categories.ts`、`src/data/stacks.ts`、`src/data/map.ts`のcanonical dataやAnalyzer metadata
- Categories、Stacks、Category Detail、Stack Detail、Searchのレイアウト
- Canvas、SVG座標の動的生成、Graph layout engine、`scaleX`による文字反転

## Evidence

- `src/styles.css`の`@media (min-width: 1101px)`にある左レーンの`row-reverse`、`padding-right`、`right`側connector
- `src/styles.css`のTree `li` connectorにある非末尾の縦線、末尾の`:last-child`停止、branch線の分離
- `src/styles.css`の`@media (max-width: 1100px)`にある中央幹非表示、Group単位の通常方向connector、最終Groupでの停止、Root接続、左側right offset解除
- `src/components/map/StackMap.tsx`のsemanticなRoot / group / Category / Stack構造と、presentation `order`順のmobile group list
- `src/data/dictionaryGroups.ts`の`side` / `order` presentation metadata
- 1600 / 1440 / 1280 / 1100 / 1024 / 900 / 768 / 390pxでのブラウザ確認。1600 / 1440 / 1280pxは2レーン、1100px以下は1列、全幅でhorizontal overflowなし。1440 / 1100 / 390pxではconnectorを目視確認
- Categories、Stacks、Category Detail、HTML / React Detail、404、Search候補からReactへのDeep Link、Browser back / forwardを今回再確認
- `pnpm install --frozen-lockfile`、`pnpm build`、`pnpm lint`、`pnpm typecheck`、`pnpm test`（3 files / 9 tests）、`pnpm exec wrangler deploy --dry-run`（4 assets、bindingなし）の成功

## Verification

1. `pnpm build`、`pnpm lint`、`pnpm typecheck`、`pnpm test`を実行する。
2. `/dictionary/map`を1600 / 1440 / 1280pxで開き、左Treeが中央幹方向へ反転し、右Treeの方向、markerless group heading、connector contrast、非末尾/末尾branch形状が維持されていることを確認する。
3. 1100 / 1024 / 900 / 820 / 768 / 390pxで中央幹が隠れ、通常方向の1列Tree、Root接続、5大group順、最後のGroupでの幹停止、horizontal overflowなしを確認する。
4. `/dictionary/categories`、`/dictionary/stacks`、各Detail、Search、404、Deep Link、Browser historyにMap CSSの波及がないことを確認する。
