---
id: rm-20260908-semantic-view-field-conservation
topic: analyzer-flow
type: constraint
status: active
maturity: reused
created: 2026-09-08
last_verified: 2026-09-08
source_commit: "f97bafe59bb72d7af596504bbc0de319a84cb625"
related_files:
  - src/analyzer/semantic/analyze.ts
  - src/analyzer/semantic/project.ts
  - src/analyzer/semantic/types.ts
  - src/analyzer/semantic/dataRefinement.test.ts
  - src/components/analyzer/SemanticFlowDetail.tsx
  - src/pages/FlowAnalyzerPage.tsx
  - docs/technical/tabs-8-9-data-analysis.md
tags:
  - shared-ui
  - view-adapter
  - regression
  - fields
  - projection
supersedes: null
promoted_to: null
---

# 共通Viewの保全確認には、詳細が読むFieldsも含める

## Conclusion

Web Atlasの意味グラフでは、同じモデルIDを複数Viewが詳細表示する。nodeのID・基本属性、全edge、Evidenceが一致していても、既存Viewの表示保全は証明できない。Data Model向けに`fields`の型文字列やkey/targetを正しても、共有するRuntime FlowのFields欄まで変化し得る。

Views 6–9は同じエクスプローラー、検索、移動履歴、2D/3D rendererを継承するが、View固有の意味と互換表示は投影で分ける。現行はrefinement直前のモデル項目を`SemanticAnalysis.flowFieldsByNode`へコピーし、Views 6–7だけがそのFieldsを投影する。Views 8–9とcanonicalなモデルには正しい新しい構造を残す。このsnapshotは旧Data Modelを正とするためのものではなく、変更対象外の既存表示を保全する境界である。

## Scope

Applicable:

- 意味解析、モデル項目、View adapter、共通詳細欄を変更し、他の完成済みViewを維持する作業。
- 共通UIへの移行で、同じIDだから内容も同じと判断しそうな回帰確認。

Do not apply:

- 利用者が明示的に既存Viewの内容変更を依頼した場合に、その変更を禁止する根拠。
- Dictionaryの独立したデータ契約、Traceの読込UI、native pickerの検証。

## Evidence

- `analyzeSemanticSources`はモデルrefinementの前にフィールドレコードをコピーする。`projectSemanticView`は6/7だけにそのsnapshotを適用し、canonicalな`fields`を上書きしない。
- `SemanticFlowDetail`の旧Fields欄が読むのは`name / type / optional / key / target`。これらを比較対象へ追加した実入力確認で、基本node/edge/Evidence一致だけでは見つからなかった4モデルの表示差分が再現した。
- `dataRefinement.test.ts`の`preserves Runtime field presentation while Data Model reads refined column structure`は、旧Runtimeの`TEXT NOT NULL`等と、Data Modelのbase type・default出典を同時に確認する。
- 修正後、両実入力の6/7投影は旧Fieldsを含め一致し、8/9の完全投影は修正前後で一致した。現行設計は`docs/technical/tabs-8-9-data-analysis.md`のAdditive contracts and conservationが所有する。

## Verification

1. 変更先と共有Viewのrendererが実際に読むフィールドを列挙し、ID/edgeだけの比較にしない。
2. snapshot取得がrefinement前で、レコードの後続変更から隔離され、6/7だけに適用されることを確認する。
3. `pnpm exec vitest run src/analyzer/semantic/dataRefinement.test.ts src/pages/SemanticAnalyzerPage.test.tsx`を実行する。
4. 比較入力を同一に固定し、6/7の既存表示項目と8/9の正しい構造が同時に保たれるか確認する。UIや入力が変わった後へ過去のPASSを流用しない。

## Reuse Evidence

Data Flow／Data Modelの表示精緻化と全5つの3D集約を追加する後続作業で、変更対象外の6/7 Fieldsを保全基準に含めた。最終実装に対し固定した両実入力でcanonical nodes・edges・Evidence・fieldsと6/7のrefinement前Fieldsを別々に比較し、一致を確認した。表示集約用graphの導入はこのsnapshot境界を変更していない。

記録時のHEADに対する未コミット実装を検証した。現在のコードと入力を再確認してから再利用する。
