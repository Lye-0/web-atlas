---
id: rm-20261031-data-flow-branch-state
topic: analyzer-data
type: failure
status: active
maturity: candidate
created: 2026-10-31
last_verified: 2026-10-31
source_commit: "3a916a2"
related_files:
  - src/analyzer/semantic/dataFlow.ts
  - src/analyzer/semantic/dataFlowBranches.test.ts
  - docs/technical/tabs-8-9-data-analysis.md
tags:
  - data-flow
  - branches
  - provenance
  - properties
supersedes: null
promoted_to: null
---

# Data Flowの枝分離は変数とプロパティ履歴を同時に行う

## Conclusion

if/三項/短絡式の枝は同じ事前状態から独立に処理し、変数bindingとproperty-write履歴を一緒に復元・合流する。変数だけ復元するとthenの書込みがelseのreadの由来になる。短絡式の右側を一般の子式走査で処理すると、実行されない場合の値を失う。書込みはその枝内では前値を置換し、合流で未更新の枝だけが前値を残す。全枝で上書きされた前値を無条件に追加しない。

## Scope

JS/TSの出現単位のData Flow。conditionalは信頼度の印であり、その枝内の履歴へ常に旧値を足す理由ではない。関数の呼出別コピーと他Viewの既存関係は維持する。任意の述語評価、例外やloopの完全な経路解析、heap aliasの解決を達成したという意味ではない。

## Evidence

dataFlowBranches.test.tsが&&/||/??と各代入形、三項の両側代入、then/else間の誤伝播防止、nested条件、全枝で上書きしたプロパティを確認。semantics/dataRefinement/tabs89IndependentAccuracyの既存精度確認も通過。

## Verification

pnpm exec vitest run src/analyzer/semantic/dataFlowBranches.test.ts src/analyzer/semantic/semantics.test.ts src/analyzer/semantic/dataRefinement.test.ts src/analyzer/semantic/tabs89IndependentAccuracy.test.ts。返却readのorigin集合とconditional/confidenceを確認する。
