---
id: rm-20260909-orbit-resize-target
topic: analyzer-spatial
type: failure
status: active
maturity: candidate
created: 2026-09-09
last_verified: 2026-09-09
source_commit: "fd6b211987697b2fb692f2941485ef68b2fe6678"
related_files:
  - src/components/analyzer/SemanticFlow3D.tsx
  - src/components/analyzer/SemanticFlow3DCamera.test.tsx
  - docs/technical/semantic-analyzer.md
tags:
  - camera
  - orbit-controls
  - resize
  - selection
  - lifecycle
supersedes: null
promoted_to: null
---

# 選択パネルのリサイズでOrbitControlsの注視点を失わない

## Conclusion

カメラ位置を明示的に変えていなくても、OrbitControlsを再生成すると既定targetの原点へ向き直る。Flowの選択／解除は詳細欄の開閉でcanvas幅を変え、size→publishProjection→saveの参照変更を通じてcontrolsのeffectを再実行していた。初期カメラ復元は一度だけなのでtargetは復元されなかった。

controlsのlifetimeはcamera/canvasへ固定し、イベントからはref経由で最新saveを呼ぶ。これによりviewport変更後の正しい投影保存と、現在の注視点維持を両立する。resizeのたび保存カメラへ巻き戻す対処では、未保存の手動操作を失う。

## Scope

Runtime／Function Call／Data Flow／Data ModelのSemanticFlow3D。一般のFit・検索ナビゲーション・明示focus・ユーザー操作を無効にする規則ではない。別rendererはcontrolsのlifetimeを調べてから適用する。

## Evidence

- source_commitの修正前ブラウザでは、Data Flowの詳細閉じ／空白解除でquaternion成分が最大約0.445変化。4 Flow×ON/OFFで再現。
- 変更後は同じ選択、詳細閉じ、Escape／空白解除で位置・quaternion・zoomの差0。非原点のtargetを持つ実OrbitControlsの自動テストでも、選択とviewportを3回変更後に同じinstance・target・位置・向き・zoomを維持し、最新viewportで保存することを確認。
- 通常のFlow状態テストはCanvasをmockしSceneを実行しないため、このlifetime不具合を検出できなかった。新しいテストはSceneと実controlsを実行し、GPU描画だけを省く。

## Verification

1. `pnpm exec vitest run src/components/analyzer/SemanticFlow3DCamera.test.tsx`。
2. 原点以外へ明示focus後、詳細の閉じ／再選択／Escape／空白クリックをON/OFFで比較。camera位置・quaternion・target・zoomを測る。
3. resize後の回転・パン・キーボード保存と、明示Fit／focusが動くことも確認し、依存を外した結果古いcallbackを使っていないか検証する。
