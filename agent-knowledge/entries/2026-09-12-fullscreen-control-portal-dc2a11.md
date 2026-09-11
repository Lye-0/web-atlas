---
id: rm-20260912-fullscreen-control-portal
topic: analyzer-interaction
type: failure
status: active
maturity: candidate
created: 2026-09-12
last_verified: 2026-09-12
source_commit: "dc2a1122e5ee27ae7f54758480d7a6efaffb78cb"
related_files:
  - src/components/analyzer/CommandEntryControl.tsx
  - src/components/analyzer/useWorkspaceFullscreen.ts
  - src/components/analyzer/analyzer-graph-controls.css
tags:
  - fullscreen
  - popover
  - positioning
supersedes: null
promoted_to: null
---

# 全画面の浮動操作はworkspace内へportalする

## Conclusion

Analyzerのツールバー内にfixedな選択欄を置き、viewport基準の座標を渡すと、ツールバー側の描画効果が座標の基準になり画面外へずれる。実際の全画面workspace内へportalし、その直下でviewport基準の位置と幅を制限する。bodyへのportalはnative fullscreenの外になるため使わない。

## Scope

Analyzerの全画面内に追加する浮動操作。通常画面の全popoverを移す指示ではない。

## Evidence

開始entryの選択欄を1440pxの2D／3D全画面で開くと横にはみ出した。workspaceへのportal後は1440／390pxの両modeで画面内に収まり、共有entry stateへ反映された。選択肢は通常欄と同じPackageScriptFactを使い、実行処理を持たない。

## Verification

native fullscreenで`document.fullscreenElement.contains(select)`と実寸の左右端を確認する。2D／3D、狭幅、entry変更後のmode維持、通常表示で同じ値、閉じた後のresize listener解除を確認する。
