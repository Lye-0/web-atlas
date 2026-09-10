---
id: rm-20260908-model-definition-expansion
topic: analyzer-model
type: constraint
status: active
maturity: reused
created: 2026-09-08
last_verified: 2026-09-08
source_commit: "f97bafe59bb72d7af596504bbc0de319a84cb625"
related_files:
  - src/analyzer/semantic/dataModels.ts
  - src/analyzer/semantic/dataCompiler.ts
  - src/analyzer/semantic/types.ts
  - src/components/analyzer/SemanticModelStructure.tsx
  - src/analyzer/semantic/tabs89IndependentAccuracy.test.ts
  - src/analyzer/semantic/dataRefinement.test.ts
  - docs/technical/tabs-8-9-data-analysis.md
tags:
  - data-model
  - derived-type
  - expansion
  - union
  - evidence
supersedes: null
promoted_to: null
---

# モデルの定義式を確認できても、最終構造の展開済みとは限らない

## Conclusion

モデル宣言のASTからpropertyを再帰的に拾うと、`Extract<Union, { type: 'detail' }>['detail']`の条件を最終型の項目と誤認する。object unionの各候補に含まれる型参照まで`union-member`にすると、候補の構造と項目の型も混ざる。

Data Modelは宣言の検出確度と、構造の展開状態を独立に持つ。直下の明示項目、literal choices、候補構造、class properties、派生型の定義式を種類に合う形で表示し、型演算を評価できない場合も式・参照元・理由を残す。「ソースで確認」と「未展開」は併存できる。未展開、循環、解析失敗を本当に0項目の構造へ置き換えない。

## Scope

Applicable:

- TypeScriptモデルの抽出・展開、model-kindによる表示adapter、参照関係のkindや確度。
- 型演算、union、再帰・循環、構文エラーを含む入力の能力拡張。

Do not apply:

- すべての型演算を完全評価できるという保証。
- 単純な別名・参照・literalまで一律未展開にして省略する理由。
- ソースの型定義から、実行時検証・値の流れ・ライブDBの構造を自動的に断定すること。

## Evidence

- `dataModels.ts`の`declarationKind` / `fieldsOf`はdirect membersと安全なalias展開を扱い、未対応の演算に理由を付ける。visited/depth管理で循環を止め、構文診断はfailed状態に反映する。
- `union-member`は直接の型候補に限り、候補内のpropertyは`field-type`としてその理由を残す。
- 独立テストDM-03/04/07/08/09と、`dataRefinement.test.ts`のempty/failed/circularケースが、候補・最終field・未展開・0件の区別を確認する。
- 実入力の派生型は定義式と参照元を保持した未展開となり、途中の条件propertyを最終Fieldsへ出していないことをソースと照合した。
- `SemanticModelStructure`のFields/Choices/Properties/定義式の分岐と、`docs/technical/tabs-8-9-data-analysis.md`のModel representation and expansionが現行表示・能力を定める。

## Verification

1. 定義のAST階層を確認し、抽出propertyが最終モデルの直接の項目か、途中の演算・候補・条件かを区別する。
2. `pnpm exec vitest run src/analyzer/semantic/tabs89IndependentAccuracy.test.ts src/analyzer/semantic/dataRefinement.test.ts src/pages/DataExplorerPage.test.tsx`を実行する。
3. 元の定義式と別の期待値を用意し、展開できた構造だけをsource-confirmedな結果として扱う。自分の抽出結果をそのまま正解にしない。
4. UIではliteral choices、class、派生型、未展開、実際の空構造を別々に開いて状態とEvidenceを確認する。

## Reuse Evidence

Data Modelの候補別開閉・狭い詳細パネルを実装する後続作業で、literal候補と構造候補、未展開の定義式を別表示にする判断へ利用した。SemanticModelStructureと独立モデル検証を再確認し、候補ラベルは確認できるliteral discriminantがある場合だけ採用、同名候補も別IDで保持した。開閉の初期状態や省略表示を変えても、最終構造の解析能力が増えたとは表示していない。

記録時のHEADに対する未コミット実装を検証した。現在のコードと入力を再確認してから再利用する。
