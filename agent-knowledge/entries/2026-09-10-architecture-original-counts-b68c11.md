---
id: rm-20260910-architecture-original-counts
topic: analyzer-architecture
type: constraint
status: active
maturity: candidate
created: 2026-09-10
last_verified: 2026-09-10
source_commit: "4f28a339cbeac0adbc24bd3c72d6156dd33efa81"
related_files:
  - src/analyzer/semantic/architectureRelations.ts
  - src/analyzer/semantic/flowAutoAggregation.ts
  - src/components/analyzer/architectureSummary.ts
  - src/components/analyzer/architectureSummary.test.tsx
  - docs/technical/architecture-readability-review.md
tags:
  - architecture
  - provenance
  - evidence
  - counts
supersedes: null
promoted_to: null
---

# Architectureの元関係数は二段階の表示集約をほどいて数える

## Conclusion

Architectureの意味集約を密度集約が包むと、provenance.edgesに入っている値も既存の要約edgeになり得る。SemanticRelationSource型の表面だけで全件を元レコードと仮定しない。元関係数と確認状態は元レコードまでたどり、IDで重複排除する。

ソース箇所はpath/start/end、Evidenceはさらにdescriptionを含む組で数える。同じ範囲が複数の関係や説明を持てるため、元関係数・箇所数・Evidence数は別物であり、実行回数でもない。先頭edgeのconfidenceを集合全体へ流用せず、混在は混在として示す。

## Scope

タブ10の関係要約と詳細表示に適用する。相手数は端点ID、要求集合の対象数は個別request IDで数え、元関係数へ置換しない。他Viewの圧縮経路や実測span数を無条件にこの定義へ変える根拠ではない。

## Evidence

- flowAutoAggregationのprojectAggregatedSemanticFlowは、既存の意味集約edgeを密度集約のprovenanceに保持する。
- architectureSummary.test.tsxは二重集約・重複した元ID・同じ範囲の異なる説明を混在させ、2元関係／2 Evidence／1箇所を確認する。
- 同条件の実コンポーネントを実Edgeでも開き、混在状態と件数定義、個別Evidenceへ到達することを確認した。記録時HEADへの未コミット変更で検証。

## Verification

1. `pnpm exec vitest run src/components/analyzer/architectureSummary.test.tsx`を実行。
2. 意味集約→密度集約の順で得た関係を開き、元ID集合と箇所／Evidenceの別々の定義を照合する。
3. 直接確認と推定を混ぜても、通常の要約が一括でソース確認済みと表示されないことを確認する。
