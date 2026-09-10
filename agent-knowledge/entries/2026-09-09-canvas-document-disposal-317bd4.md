---
id: rm-20260909-canvas-document-disposal
topic: analyzer-spatial
type: failure
status: active
maturity: candidate
created: 2026-09-09
last_verified: 2026-09-09
source_commit: "91b471a8997a50832c1330024f79e06274469e2b"
related_files:
  - src/components/analyzer/canvasDisposals.ts
  - src/components/analyzer/canvasDisposals.test.tsx
  - src/components/analyzer/SemanticFlow3D.tsx
  - src/components/analyzer/SemanticGraphCanvas.tsx
  - docs/technical/analyzer-stabilization-metrics.json
tags:
  - r3f
  - orbit-controls
  - lifecycle
  - heap
  - event-listener
supersedes: null
promoted_to: null
---

# Canvas除去後のControls破棄ではdocument listenerが残る

## Conclusion

R3FのScene内にcleanupがあっても、DOM Canvasを持つ親の除去より遅く実行される。利用中のThree OrbitControlsはconnect/disconnectの両方でcanvas.getRootNode()を呼び、既に外されたcanvasから元documentのkeydown listenerを解除できない。生存Canvasや可視label数が一定でも、document→Controls→Sceneが旧graphを保持し続ける。

親DOM側layout cleanupでControlsを先に解除し、Scene側cleanupと同じidempotent disposerを使う。Controlsのchange/end listenerも解除する。ライブラリ更新時には現行実装のconnect/disconnectとR3F teardown順序を再確認する。

## Scope

SemanticFlow3DとSemanticGraphCanvasのように、別React rootの中でDOM/documentにControlsを登録する構成に適用する。Moduleの固定角rendererや一般的なDOMイベント全てに、この遅延を仮定しない。GPU資産のdisposeや別のtimer解除を代替しない。

## Evidence

- `canvasDisposals.test.tsx`は実際のOrbitControlsを使い、Canvasを外す前に元documentからhandlerを解除し、遅い二度目のcleanupで再解除しないことを検証する。
- 同じgit-lines表示への6周で、修正前GC後heap153.4→500.6MB、listeners274→391。修正後はheap143.4–159.0MB、listeners286/299の範囲へ戻り、継続増加しなかった。測定条件と生データ集計は関連JSON/レビュー。
- 記録時HEADに対する未コミット実装で検証した。HEAD単独が修正を含むとは限らない。

## Verification

1. 実Controlsのdocument登録先と、親Canvas/別rootのcleanup順序を確認する。
2. `pnpm exec vitest run src/components/analyzer/canvasDisposals.test.tsx`を実行する。
3. 2D/3Dとタブ往復を繰り返し、遅延teardown後・GC後のheapとevent listener数を測る。DOM Canvas数だけで漏れなしと判定しない。
