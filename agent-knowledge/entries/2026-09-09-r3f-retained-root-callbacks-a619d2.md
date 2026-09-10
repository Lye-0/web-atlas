---
id: rm-20260909-r3f-retained-root-callbacks
topic: analyzer-rendering
type: failure
status: active
maturity: candidate
created: 2026-09-09
last_verified: 2026-09-09
source_commit: "62a01861b3f1cd8ec5df8d019d989a8143dc1775"
related_files:
  - src/components/analyzer/useDisposableFrame.ts
  - src/components/analyzer/useDisposableFrame.test.tsx
  - src/components/analyzer/semanticCanvasLifecycle.ts
  - src/components/analyzer/semanticCanvasLifecycle.test.ts
  - src/components/analyzer/SemanticFlow3D.tsx
  - docs/technical/architecture-map-review.md
tags:
  - r3f
  - lifecycle
  - heap
  - closure
supersedes: null
promoted_to: null
---

# R3Fの最後の購読とRootStateからrenderの参照を切る

## Conclusion

R3F 9.7.0のloop moduleは最後のフレームsubscriptionとRootStateを保持する。購読解除・canvas除去・シーン登録0だけでは、親renderが持つ大きな解析データの解放を証明できない。heap snapshotでsubscription→frame callback→Sceneと、RootState→Canvasのpointer wrapper、RootState→xr.connect→configure→onCreated→Canvasのpropsという独立経路を確認した。

フレームはrenderの外で作る参照セル付きproxyを使い、unmount時にセルを空にする。Cは独自の空白hit testingを持つため、Canvasの未使用onPointerMissed wrapperはrender外のno-opへ置換する。XRは元のdisconnectを呼んだ後に転送先を解放する。render内にproxy factoryを置くと共有lexical contextから他のrender値を保持し得る。

## Scope

現在のSemanticFlow3DとR3F実装で確認した保持経路。document listenerの遅い解除とは別問題で、既存canvasDisposalsを置き換えない。GPU資産のdisposeも別途必要。ライブラリ更新時にはretainerとteardown実装を再確認し、一般のWebXR接続を無条件に無効化する規則にはしない。

## Evidence

- 記録時HEADに対する変更を検証。vehicle-managementの2D/3D往復では約545 MiBで安定していたが、空入力交換後にも約544 MiBが残った。
- フレーム・pointer・XRの経路を順に遮断した後は空入力で約30 MiBへ戻り、canvas 0。主選択・空白解除・モード復帰の実操作を再検証。
- proxyの更新/解除とXR終了の冪等性を単体テスト。詳細条件と最終数値は技術レビュー。

## Verification

1. `pnpm exec vitest run src/components/analyzer/useDisposableFrame.test.tsx src/components/analyzer/semanticCanvasLifecycle.test.ts`。
2. 大きい固定入力で3D初期化を待ってから2D/3Dを繰り返し、空入力へ交換する。R3Fの遅延終了を待ちGC後のheapを比較。
3. heapが残る場合はsnapshotの強い参照経路を追う。短い往復でSceneの初期化前に閉じると漏れを見落とす。
