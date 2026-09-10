---
id: rm-20260910-architecture-selection-gesture
topic: analyzer-architecture
type: pattern
status: active
maturity: candidate
created: 2026-09-10
last_verified: 2026-09-10
source_commit: "2f0beeaf8f87cdd13c82d006629815784d326b39"
related_files:
  - src/components/analyzer/useArchitectureNodeGesture.ts
  - src/components/analyzer/SemanticFlow2D.tsx
  - src/components/analyzer/SemanticFlow3D.tsx
  - src/components/analyzer/semanticFlowViewport.ts
  - src/components/analyzer/architectureNavigation.test.tsx
  - src/components/analyzer/semanticFlowViewport.test.ts
  - docs/technical/architecture-navigation-review.md
tags:
  - architecture
  - selection
  - double-click
  - resize
  - history
supersedes: null
promoted_to: null
---

# 即時選択後の内部移動は、描画リサイズを越えて同じ入力対象を保つ

## Conclusion

Architectureでは最初のクリックが詳細欄を開き、キャンバス幅と案内行の高さを変える。描画要素のonDoubleClickだけでは、2回目が背景・別ラベル・新しいパネルへ当たる可能性がある。最初の対象IDをワークスペースで保持し、同じ位置の2回目をcaptureで消費する。正規の内部を持つ場合だけopenし、葉や表示集合は最初の選択・内訳を保つ。即時選択を遅延タイマーへ置き換えない。

画面位置も保持する。2Dは選択時の幅変更で再中央寄せせず、3Dはcamera／world座標を変えずview offsetの基準をcamera／visitへ保存する。明示Fitは基準を作り直す。対象の同一性と表示位置の両方を確認する必要がある。

## Scope

タブ10の2Dブロックと3D点の選択→内部移動に適用。3Dのタブ6〜9は既存pointerup選択を維持する。集約内訳、普通のボタン、葉を階層移動へ転用しない。

## Evidence

- architectureNavigation.test.tsxは異なる2回目のDOM対象、二重open、ドラッグ、葉・表示集合、実際の祖先、Backの選択・カメラ復元を検証する。
- semanticFlowViewport.test.tsはリサイズ前後の投影画面座標と不変のカメラ位置を検証する。
- git-lines／vehicle-managementの未選択2D・3Dからの実ダブルクリックを確認。git-linesの詳細欄出現前後で2D中心・3D点の画面座標差は1px未満。上記HEADへの未コミット変更で検証した。

## Verification

1. 上記2テストとSemanticFlow2D.test.tsxを実行する。
2. 詳細欄を閉じた状態から実マウスでダブルクリックし、1回の移動・1件のvisitだけになることを確認する。
3. 選択前後の画面座標とカメラを比較し、Back／明示Fit／狭幅でも保存基準が正しいことを確認する。
