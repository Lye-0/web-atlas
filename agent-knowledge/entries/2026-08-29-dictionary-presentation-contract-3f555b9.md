---
id: rm-20260829-dictionary-presentation-contract
topic: dictionary
type: decision
status: active
maturity: candidate
created: 2026-08-29
last_verified: 2026-08-29
source_commit: feb8316
related_files:
  - src/components/map/StackMap.tsx
  - src/components/categories/CategoryTable.tsx
  - src/components/stacks/StackTable.tsx
  - src/components/categories/CategoryDetail.tsx
  - src/components/stacks/StackDetail.tsx
  - src/components/search/DictionarySearch.tsx
  - src/utils/categoryHierarchy.ts
  - src/data/dictionaryGroups.ts
  - src/utils/stackStatus.ts
  - docs/technical/dictionary.md
tags:
  - dictionary
  - presentation
  - map
  - categories
  - stacks
  - analyzer
  - accessibility
supersedes: null
promoted_to: null
---

# DictionaryのPresentation Contract

## Conclusion

Phase 1.2のDictionary UIは、同じ正規データを画面ごとの役割に合わせて見せる。Mapは説明を読む画面ではなく、5つの視覚グループと親子接続でWeb開発の全体像を俯瞰する。CategoriesはMapと同じ5大グループの親子階層から分類概念と比較へ進む索引、Stacksは共通グループのfilterと名称・Category・概要から個別技術の詳細へ進む索引とする。Mapの通常ノードではsummaryを表示せず、一覧ではstable IDとactive statusを主役にしない。

Analyzer接続用の`categoryId`、`packageNames`、`aliases`、`relatedStackIds`、`relationships`は正規データから削除しない。Stack詳細の「開発者向けメタデータ」に折りたたみ、relationship kindは日本語ラベルでsource / relation / targetとして表示する。利用者向けの文章は正規Dictionaryデータに自然な日本語で直接保持し、表示時の大量文字列置換には依存しない。stable ID、routing、Deep Link、検索対象の正規データ契約は維持する。

## Scope

Applicable:
- Phase 1 DictionaryのMap、Categories、Stacks、詳細、検索の表示設計
- Map・Categories・Stacks filterで共有する5大visual groupの表示設計
- Desktop / Mobileの情報密度、階層表現、visible focus、reduced motion

Do not apply:
- `src/data/categories.ts`、`src/data/stacks.ts`、`src/data/map.ts`のIDやAnalyzer metadataをUI都合で削除・変更すること
- Three.js、React Flow、backend、DB、Auth、Analyzer本体の追加
- Cloudflare Workers Static Assetsの公開契約や既存routeを変更すること

## Evidence

- `src/components/map/StackMap.tsx` の表示専用visual groupとsummary非表示のMap node
- `src/data/dictionaryGroups.ts` のpresentation groupingとroot Category検証
- `src/components/categories/CategoryTable.tsx` と `src/utils/categoryHierarchy.ts` の親子階層一覧
- `src/components/stacks/StackTable.tsx` の大分類filterとactive status条件表示
- `src/components/stacks/StackDetail.tsx` の日本語relationship、公式サイト、折りたたみmetadata
- `src/components/search/DictionarySearch.tsx` の日本語placeholder、結果表示、Ctrl / Cmd + K focus
- `docs/technical/dictionary.md` のPhase 1.1 / 1.2 Presentation Contract
- `pnpm build`、`pnpm lint`、`pnpm typecheck`、`pnpm test` の成功（9 tests）
- `agent-browser`でMap、Categories、Stacks、Category / Stack詳細、404、Search、390px viewport、Browser back / forwardを確認し、横スクロールとARIA violationがないことを確認

## Verification

1. `pnpm build`、`pnpm lint`、`pnpm typecheck`、`pnpm test`を実行する。
2. `/dictionary/map`でsummaryが通常表示されず、全Category / StackがID参照で表示されることを確認する。
3. `/dictionary/categories`と`/dictionary/stacks`で階層、filter、metadata非表示、active status非表示を確認する。
4. `/dictionary/stacks/:stackId`でrelationshipのsource / relation / target、公式サイト、metadata折りたたみを確認する。
5. Search、Deep Link、Not Found、Browser back / forward、390px前後の横幅を再確認する。
