---
id: rm-20260909-flow-label-unique-placement
topic: analyzer-flow
type: failure
status: active
maturity: candidate
created: 2026-09-09
last_verified: 2026-09-09
source_commit: "91b471a8997a50832c1330024f79e06274469e2b"
related_files:
  - src/components/analyzer/semanticFlowLabels.ts
  - src/components/analyzer/semanticFlowLabels.test.ts
  - src/components/analyzer/SemanticFlow3D.tsx
  - docs/technical/analyzer-cross-tab-stabilization-review.md
tags:
  - label
  - stable-id
  - react-key
  - aggregation
  - lifecycle
supersedes: null
promoted_to: null
---

# 複数の優先passをまたいでlabel IDを一度だけ配置する

## Conclusion

集約点が選択対象の相手でもあると、関係labelのpassと通常集約のpassの両方で配置され得る。元graphのIDが一意でも、最終label配列の重複keyがReactとID別DOM位置Mapの対応を壊し、OFF後の不要な表示を残す。

配置入口でIDを一度に制限し、DOM layer側も重複・無効座標を防ぐ。描画対象は現在のowner/regionと照合する。OFFだから全labelを消すのではなく、有効な手動集約や現選択は残す。

## Scope

複数優先passで選定し、React contentとDOM位置更新を分離しているFlow 3D labelに適用する。元解析の同名ノード統合、2Dの線配置変更、全ラベル再生成の理由にはしない。

## Evidence

- 4 Flow Viewの共通fixtureでrelated aggregateが期待1/実2となり、実git-linesのNumber.isFinite選択→Fit→OFFでも重複と残留を再現した。
- `semanticFlowLabels.test.ts`は重複を起こす関連集約を含む配置とlayer更新を検証する。
- 最終実操作ではOFFの自動label0・重複ID0。手動parsers1,467対象はOFFでも有効な代表として残った。
- 記録時HEADに対する未コミット修正を検証。現コードを再確認して再利用する。

## Verification

1. `pnpm exec vitest run src/components/analyzer/semanticFlowLabels.test.ts src/components/analyzer/SemanticFlow3D.test.tsx`。
2. 関係相手が集約になる選択でFit、ON/OFF、再選択を反復し、元graphだけでなく最終DOMのlabel ID一意性を数える。
3. OFF中の自動と手動のowner、hit、captionを分けて確認する。
