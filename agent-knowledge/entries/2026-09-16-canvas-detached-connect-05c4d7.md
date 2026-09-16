---
id: rm-20260916-canvas-detached-connect
topic: analyzer-rendering
type: failure
status: active
maturity: candidate
created: 2026-09-16
last_verified: 2026-09-16
source_commit: "9cb1bca"
related_files:
  - src/components/analyzer/semanticCanvasLifecycle.ts
  - src/components/analyzer/semanticCanvasLifecycle.test.ts
  - src/components/analyzer/SemanticFlow3D.tsx
tags:
  - r3f
  - lifecycle
  - canvas
supersedes: null
promoted_to: null
---

# Canvasの非同期初期化は破棄済みDOMへの接続を試み得る

## Conclusion

3Dの階層・モードを素早く変更すると、R3Fの非同期configure完了時点でCanvasのdivRefがnullになり、events.connect内のaddEventListenerで例外になる場合がある。現在のR3Fは利用側onCreatedを呼ぶ前に接続するため、onCreatedだけのガードでは間に合わない。

SemanticFlow3Dのevents factoryでnull接続を無視し、有効な接続とdisconnectは元managerへ委譲する。通常のイベント計算や描画方式を置き換えない。

## Scope

SemanticFlow3Dと現在のR3F Canvasの遅延初期化。別のCanvasやライブラリ更新へ広げる場合は接続順を再確認する。保持されたRootStateのheap問題、GPUリソース破棄、大入力Worker転送の制限とは別であり、この修正でそれらの解決を主張しない。

## Evidence

- web-atlasの内部表示から3D/戻る操作中にCannot read properties of null (reading addEventListener)を観測。
- ローカルR3F実装でevents.connect(divRef.current)→利用側onCreatedの順を確認。
- semanticCanvasLifecycle.test.tsでnull接続を無視し、有効接続とdisconnectが維持されることを確認。
- 修正後6往復と通常3D初期化、他タブ往復で当該ページのconsole error=0。docs/technical/tab10-cross-project-correctness-review-20260916.mdに条件を記録。

## Verification

1. semanticCanvasLifecycle.test.tsとSemanticFlow3DCamera.test.tsxを実行。
2. 3Dの初期化途中の離脱と、描画完了後の離脱を別々に確認。
3. 有効なイベント接続・通常選択・カメラ・Canvas破棄の契約を確認。短時間の往復だけで長期リーク不在としない。
