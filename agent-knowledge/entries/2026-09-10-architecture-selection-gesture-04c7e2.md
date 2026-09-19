---
id: rm-20260910-architecture-selection-gesture
topic: analyzer-architecture
type: pattern
status: active
maturity: candidate
created: 2026-09-10
last_verified: 2026-09-13
source_commit: "28bcfa195bd47323ab400111d1addfe232a3fbf3"
related_files:
  - src/components/analyzer/useArchitectureNodeGesture.ts
  - src/components/analyzer/SemanticFlow2D.tsx
  - src/components/analyzer/SemanticFlow3D.tsx
  - src/components/analyzer/semanticFlowViewport.ts
  - src/components/analyzer/architectureNavigation.test.tsx
  - src/components/analyzer/semanticFlowViewport.test.ts
  - docs/technical/tab10-click-stable-scope-review-20260913.md
  - src/components/analyzer/semanticFlowLabels.ts
  - src/components/analyzer/architectureLabelPointer.test.ts
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

タブ10の内部移動はnative click.detail=2と両クリックの同じ元対象IDを必要とする。ワークスペースcaptureで最初の対象へ2回目を転用しない。通常選択でscopeや基本投影を変えず、点・cameraは安定させる。3Dラベルは1回目の選択でパネル幅・ラベル寸法が変わるため、点の安定性だけではラベルへのdblclickを保証できない。

ポインターで押した同じDOMラベルの矩形を、操作中だけmanual popoverのtop layerで維持する。別ラベルのleave/blurは現在の保持IDを解除しない。leave/cancel、外側の操作、scroll/wheel/key、resize、visit変更、unmountでは解除する。タブ6〜9はこの保持を呼ばず従来操作を維持する。古いAPI環境では明示ボタンを維持する。

## Scope

タブ10の2Dブロック・3D点/ラベルの即時選択と内部移動。他タブ固有の単クリック階層移動に適用しない。ラベルをすべて常時固定したり、移動した別要素を最初のIDとして扱う一般規則ではない。

## Failed Approach

以前の同位置capture方式は、詳細パネルや別対象の2回目クリックを最初のIDへ転用していた。位置だけで同じ実体への操作とは判断できない。また、ラベル配置の選択後移動を放置すると、正しい対象ID照合を導入しても未選択からのdblclickが成立しない。

## Evidence

- architectureNavigation.test.tsx: 同じIDのnative double、再単クリック、異対象同位置、取消、二重open、葉/表示集合、実祖先とBack。
- architectureLabelPointer.test.ts: selectedにより候補矩形が変わっても同じDOMクリック領域を保持、ID付き解除、navigation/unmount解除。
- 2026-09-13、Chessで2D/3D点の実クリック・実double、独立sampleで未選択3Dラベルの実doubleを再現/修正。追加1visit・移動後popover残留0。
- 初期HEADからの未commit変更で検証。詳細はdocs/technical/tab10-click-stable-scope-review-20260913.md。

## Verification

1. 上記2テスト、SemanticFlow2D・SemanticFlow3DCamera・semanticFlowLabelsの回帰を実行する。
2. 詳細なしの未選択対象へ実doubleし、scopeとvisitが1回だけ変わることを確認する。
3. Canvas点とDOMラベルを別々に測り、単クリック後の既存点/camera/クリック領域、古い別対象のイベント、top layerの解除を確認する。
