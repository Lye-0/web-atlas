---
id: rm-20260908-derived-field-link-ownership
topic: analyzer-model
type: failure
status: active
maturity: candidate
created: 2026-09-08
last_verified: 2026-09-08
source_commit: "536f801a62695feb6d90529babf5401895f3508e"
related_files:
  - src/analyzer/semantic/dataModels.ts
  - src/analyzer/semantic/dataFlow.ts
  - src/analyzer/semantic/types.ts
  - src/analyzer/semantic/tabs89IndependentAccuracy.test.ts
  - src/pages/DataExplorerPage.test.tsx
  - docs/technical/tabs-8-9-data-analysis.md
tags:
  - field-identity
  - cross-view
  - alias
  - inheritance
  - source-model
supersedes: null
promoted_to: null
---

# 派生した項目のコピーを、元の定義所有者へ置き換えない

## Conclusion

型のaliasや継承を展開すると、複数モデルの`fields`に同じ定義Evidenceを持つ項目が現れる。すべてのコピーを単にソース範囲で照合すると、値・項目のData Modelリンクが後から走査したalias/派生モデルに上書きされる。対象IDが存在しても、元の項目定義を正しく指しているとは限らない。

展開した項目は元の`sourceModelId`とfield IDを維持する。プロパティのリンクを作るときは、解決したsymbolの宣言に加え、その項目を本来定義したモデルを照合する。値全体の型注釈へのリンクと、項目の定義へのリンクは別の根拠を持つ。aliasや継承が増えても元のfield対応を変えない。

## Scope

Applicable:

- Data FlowとData Modelの項目リンク、型展開、alias・継承後のフィールドprovenance。
- 同じEvidenceを持つ複数の展開コピーから元定義を選ぶ処理。

Do not apply:

- 継承した全フィールドが派生モデルに存在しないとすること。
- 同名の型・値・項目だけから対応を作ること。
- ORMの共有object spreadを、実在しない型モデルへ帰属させること。

## Evidence

- `dataModels.ts`はalias/継承の項目で元の`sourceModelId`を保ち、展開のEvidenceを追加する。
- `dataFlow.ts`のproperty照合は`field.sourceModelId === model.id`とsymbol宣言範囲を併用する。すべてのfieldコピーを許す旧照合では、独立LINK fixtureの参照先がaliasで上書きされた。
- `tabs89IndependentAccuracy.test.ts`のLINKは、元interface、Extended、Aliasが共存する中で`payload.id`が元の項目へ往復リンクし、単に型名と同じ名前の仮引数へ誤接続しないことを確認する。
- `DataExplorerPage.test.tsx`は明示field IDの表示、元Viewのquery/中心へのBack復元を確認する。Traceやnative file pickerの承認は、この根拠には含まない。

## Verification

1. 元型、alias、継承型を同じfixtureに置き、走査順を変えても項目リンクの定義所有者が変わらないか確認する。
2. `pnpm exec vitest run src/analyzer/semantic/tabs89IndependentAccuracy.test.ts src/pages/DataExplorerPage.test.tsx`を実行する。
3. 値全体の型注釈と各プロパティ宣言を別々に照合し、リンク先ID・field ID・Evidenceと戻りの状態を確認する。
