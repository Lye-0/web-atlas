---
id: rm-20260917-content-coverage-original-ids
topic: analyzer-architecture
type: failure
status: active
maturity: candidate
created: 2026-09-17
last_verified: 2026-09-17
source_commit: "0071cbf"
related_files:
  - src/components/analyzer/architectureContentCoverage.ts
  - src/components/analyzer/architectureContentCoverage.test.tsx
  - src/components/analyzer/ArchitectureDetail.tsx
  - src/analyzer/semantic/architectureProjection.ts
tags:
  - content-coverage
  - presentation-group
  - original-id
supersedes: null
promoted_to: null
---

# 表示集合の範囲を正規ID集合へ表示IDで照合しない

## Conclusion

contentAllowedIdsは正規対象IDの集合。投影のarchitecture-display IDは含まれないため、直接hasすると表示中の未特定要求集合も範囲外になる。現在の残集合のrequestIdsを優先し、明示展開後はrequestGroupsのメンバー対応から判定する。全件内/一部/外を分け、カメラ・内部階層・既存filterの可視性とは混同しない。相手ノードと個別の関係の包含も別判定。

## Scope

Architectureプリセットの詳細説明/明示移動。HTTP検出や要求先判定を変更する根拠ではない。集合のmemberIdsは下位解析対象の場合があり、requestIdsと無条件に交換できない。

## Evidence

0071cbfでvehicleのwebを選ぶと認証3/HTTP54/HTTP28の表示集合が全て範囲外と誤表示。修正後は正当な包含になり、DB側の対象外実行構成には範囲外を保持。1要求取り出し後の27+1と復帰、同名別ID、部分範囲、相手内/関係外の負例も検証。

## Verification

architectureContentCoverage.test.tsxとarchitectureRequestSelection.test.ts、実入力で集合選択/個別取り出し/プリセット往復を確認する。詳細はdocs/technical/tab10-range-layout-review-20260917.md。
