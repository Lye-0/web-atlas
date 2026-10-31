---
id: rm-20261031-picker-request-lifetime
topic: analyzer-session
type: failure
status: active
maturity: candidate
created: 2026-10-31
last_verified: 2026-10-31
source_commit: "dc5ed18"
related_files:
  - src/components/analyzer/AnalyzerProjectPicker.tsx
  - src/components/analyzer/AnalyzerProjectPicker.test.tsx
  - src/analyzer/sessionProvider.tsx
tags:
  - async
  - project-replacement
  - picker
  - race
supersedes: null
promoted_to: null
---

# プロジェクト交換の保護はWorkerだけでなくPickerの要求寿命にも必要

## Conclusion

AnalyzerSessionProviderはルート切り替えを越えて生存する。旧Pickerのscanが遅れて完了すると、アンマウント済みコンポーネントのcallbackからでもProviderのreplaceProjectは有効で、新しい入力とView状態を置き換え得る。Pickerの要求世代をunmountで無効化し、列挙後・scan完了後・error/finallyのすべてで世代を照合する。ボタンのdisabledだけでは別mountの要求を保護できない。

## Scope

フォルダー選択と入力アップロードの非同期結果。Workerのキャンセルは新storeへの交換後の別の寿命管理であり、Picker要求ガードの代替ではない。通常のView移動で既存の解析キャッシュを一律破棄する規則ではない。

## Evidence

AnalyzerProjectPicker.test.tsxで別mountのBを先に完了させ、その後Aを完了してもBだけを反映することを確認。同じmountの旧失敗が新要求のbusy/errorを変えないこと、native pickerがunmount後に返った場合に列挙を始めないことも確認。

## Verification

pnpm exec vitest run src/components/analyzer/AnalyzerProjectPicker.test.tsx src/analyzer/semantic/client.test.ts。要求途中のunmount、成功順逆転、失敗、キャンセルを個別に確認する。
