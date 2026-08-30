---
id: rm-20260830-dictionary-map-mirror
topic: dictionary
type: decision
status: active
maturity: candidate
created: 2026-08-30
last_verified: 2026-08-30
source_commit: "59cf79f"
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

DesktopのDictionary Mapは中央幹型2レーンを維持し、右レーンを「中央幹からgroup・Category・Stackへ進むTree」、左レーンをその視覚的mirrorとして「中央幹から左へgroup・Category・Stackが分岐するTree」とする。左レーンはCSSの`border-right`、`padding-right`、`right`側pseudo connector、`flex-direction: row-reverse`で反転し、`transform: scaleX(-1)`やJavaScriptの座標計算には依存しない。

狭幅ではmirrorを解除する。`max-width: 1100px`で中央幹を隠し、marker、border、padding、connectorを通常方向へ戻して、Rootから5大visual groupを追える1列Vertical Treeとして表示する。

## Scope

Applicable:
- `StackMap`のDesktop左右2レーン表示
- group heading、Category / Stack marker、親子connectorの左右方向
- `dictionaryVisualGroups`のpresentation groupingを使うresponsive切替

Do not apply:
- `src/data/categories.ts`、`src/data/stacks.ts`、`src/data/map.ts`のcanonical dataやAnalyzer metadata
- Categories、Stacks、Category Detail、Stack Detail、Searchのレイアウト
- Canvas、SVG座標の動的生成、Graph layout engine、`scaleX`による文字反転

## Evidence

- `src/styles.css`の`@media (min-width: 1101px)`にある左レーンの`row-reverse`、`border-right`、`padding-right`、`right`側connector
- `src/styles.css`の`@media (max-width: 1100px)`にある中央幹非表示、通常方向connector、左側right offset解除
- `src/components/map/StackMap.tsx`のsemanticなRoot / group / Category / Stack構造
- `src/data/dictionaryGroups.ts`の`side` / `order` presentation metadata
- 1600 / 1440 / 1280 / 1200 / 1100 / 1024 / 900 / 820 / 768 / 390pxでのブラウザ確認。全幅でhorizontal overflowなし
- Categories、Stacks、Category Detail、HTML / React Detail、404、Search、Deep Link、Browser back / forwardの回帰確認
- `pnpm build`、`pnpm lint`、`pnpm typecheck`、`pnpm test`（3 files / 9 tests）、`pnpm exec wrangler deploy --dry-run`（4 assets、bindingなし）の成功

## Verification

1. `pnpm build`、`pnpm lint`、`pnpm typecheck`、`pnpm test`を実行する。
2. `/dictionary/map`を1600 / 1440 / 1280 / 1200pxで開き、左Treeが中央幹方向へ反転し、右Treeの方向とconnector contrastが維持されていることを確認する。
3. 1100 / 1024 / 900 / 820 / 768 / 390pxで中央幹が隠れ、通常方向の1列Tree、Root接続、5大group順、horizontal overflowなしを確認する。
4. `/dictionary/categories`、`/dictionary/stacks`、各Detail、Search、404、Deep Link、Browser historyにMap CSSの波及がないことを確認する。
