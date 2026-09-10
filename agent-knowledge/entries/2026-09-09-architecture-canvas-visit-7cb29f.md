---
id: rm-20260909-architecture-canvas-visit
topic: analyzer-spatial
type: failure
status: active
maturity: candidate
created: 2026-09-09
last_verified: 2026-09-09
source_commit: "907f640c46c9e5000d76bd7e43e688958c6092b9"
related_files:
  - src/components/analyzer/SemanticFlowStage.tsx
  - src/components/analyzer/SemanticFlow3D.tsx
  - docs/technical/architecture-focus-review.md
tags:
  - r3f
  - lifecycle
  - architecture
  - navigation
supersedes: null
promoted_to: null
---

# Architectureの3D内部移動ではCanvasと訪問Sceneの寿命を分ける

## Conclusion

タブ10で訪問履歴ごとにDOM Canvasを再生成すると、R3Fの非同期初期化が除去済みDOMへevents.connectし、null.addEventListener例外になることがある。3D内のスコープ移動はCanvasを維持し、訪問IDをkeyにしたSceneだけを再生成する。ラベル・接続・投影・カメラ保存の遅いcallbackは訪問IDで弾く。

## Scope

Architectureの3Dから3Dへの明示移動と戻る操作に適用する。2Dへ戻る場合のControls/document cleanupやframe/XR解除を代替しない。他タブのkeyを一律変更する根拠でもない。

## Evidence

- 記録時HEADに対する変更で、実Edgeの外側を開く→戻るにnull.addEventListenerを2回再現。スタックはR3F events.connectとCanvas onCreatedを指した。
- Canvas寿命分離後、実入力2件の機能操作でpageerror 0。8回のスコープ移動で同じCanvas ElementHandleを維持し、カメラ復元を確認。
- 8回のモード往復を4バッチ実施。GC後listeners 315、DOM nodes 2337は各バッチ一定。検証範囲で継続増加なし。単体テストのCanvas mockだけでは非同期初期化順を再現できない。

## Verification

1. 実ブラウザで3D内部→外側選択→明示的に開く→戻るを反復し、pageerrorとCanvas DOM同一性を確認。
2. 古いScene callbackが新しい訪問のラベルやカメラを上書きしないことを確認。
3. 2D/3D往復、空入力、他タブへの移動後もGC後heapとlistener数を測り、単に例外が消えただけで漏れなしと判定しない。
