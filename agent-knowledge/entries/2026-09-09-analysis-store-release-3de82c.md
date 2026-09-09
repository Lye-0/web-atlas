---
id: rm-20260909-analysis-store-release
topic: analyzer-session
type: failure
status: active
maturity: candidate
created: 2026-09-09
last_verified: 2026-09-09
source_commit: "62a01861b3f1cd8ec5df8d019d989a8143dc1775"
related_files:
  - src/analyzer/semantic/client.ts
  - src/analyzer/semantic/client.test.ts
  - src/analyzer/sessionProvider.tsx
  - src/pages/SemanticAnalyzerPage.test.tsx
  - docs/technical/architecture-map-review.md
tags:
  - worker
  - cache
  - project-replacement
  - heap
supersedes: null
promoted_to: null
---

# 解析キャッシュの寿命をproject交換で明示的に終える

## Conclusion

同じproject store内のタブ移動では解析Promiseを再利用するが、新しいstoreへ交換した時は旧ジョブを中止・削除し、旧Traceキャッシュも削除する。WeakMapだけに寿命を委ねず、Worker終了時はonmessage/onerrorと進捗listenerを外す。terminateだけではhandler closureと完了Promiseの保持関係が残り得る。

## Scope

ブラウザー内の解析Workerとproject session。通常のview移動ごとに解析を破棄する規則ではない。R3Fの別経路からstoreが生存する場合、この処理だけで解放したとは判定しない。

## Evidence

- 記録時HEADに対する変更を検証。2Dだけで大きい実入力から空入力へ交換した時のGC後heapが約540 MiBから約28 MiBへ戻った。
- client testは同じstoreの結果再利用、完了/失敗のhandler解除、中止後の再解析を確認。Page testは交換時に旧storeのcancelが呼ばれることを確認。
- 3D初期化後には別の保持経路が残ることも確認し、R3Fの専用対策と分離した。

## Verification

1. `pnpm exec vitest run src/analyzer/semantic/client.test.ts src/pages/SemanticAnalyzerPage.test.tsx`。
2. 同じstoreでタブ移動してWorkerが重複しないこと、別storeへの交換で旧結果と進捗が復活しないことを確認。
3. 2Dのみと3D初期化後を分け、空入力交換後・GC後のheapを比較する。
