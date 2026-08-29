---
id: rm-20260829-dictionary-data-contract
topic: dictionary
type: decision
status: active
maturity: candidate
created: 2026-08-29
last_verified: 2026-08-29
source_commit: "e3526cf"
related_files:
  - src/types/dictionary.ts
  - src/data/categories.ts
  - src/data/stacks.ts
  - src/data/map.ts
  - src/data/validateDictionary.ts
  - src/utils/routes.ts
  - docs/technical/dictionary.md
tags:
  - stable-id
  - data-model
  - routing
  - analyzer
  - map
supersedes: null
promoted_to: null
---

# Dictionaryの正規データ契約

## Conclusion

Phase 1 Dictionaryは、CategoryとStackをそれぞれ一つの正規データソースで管理し、Map・一覧・詳細・検索・routeを同じID参照から生成する。Stackの`categoryId`、`packageNames`、`aliases`、`relatedStackIds`、`relationships[].targetStackId`は、将来のAnalyzerが検出結果からDictionaryへ接続するためのデータ契約として維持する。Mapデータは本文を複製せず、表示階層と参照IDだけを持つ。

## Scope

Applicable:
- Phase 1のDictionary画面、検索、Deep Link、データ検証
- Phase 2以降でpackage名や技術判定からDictionaryへリンクするAnalyzer

Do not apply:
- Analyzerのparserやlocal project accessをPhase 1へ追加する変更
- Mapを3D renderingや別の重複データセットへ置き換える変更

## Evidence

- `src/data/index.ts` の起動時 `assertValidDictionary` とlookup map
- `src/data/validateDictionary.ts` のID・relation・package ownership・Map掲載検証
- `src/data/validateDictionary.test.ts` の43 Category / 48 Stackと不正参照検出テスト
- `src/utils/routes.ts` と `src/utils/routes.test.ts` のstable IDからのURL生成
- `docs/technical/dictionary.md` の現行データ契約と画面構成

## Verification

1. `pnpm test` でデータ検証・検索・routeテストを実行する。
2. Category / StackのIDやrelationを変更した場合は、`validateDictionary`が空のエラー配列を返すことを確認する。
3. Map階層へ項目を追加・移動する場合は、本文データを複製せず、正規データのIDだけを参照していることを確認する。
