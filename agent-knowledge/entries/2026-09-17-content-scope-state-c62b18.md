---
id: rm-20260917-content-scope-state
topic: analyzer-architecture
type: constraint
status: active
maturity: candidate
created: 2026-09-17
last_verified: 2026-09-17
source_commit: "b028452"
related_files:
  - src/analyzer/semantic/architectureContentState.ts
  - src/analyzer/semantic/architectureContent.test.ts
  - src/pages/FlowAnalyzerPage.tsx
  - src/pages/SemanticAnalyzerPage.test.tsx
  - docs/technical/architecture-map.md
tags:
  - content-selection
  - scope
  - camera
  - session
supersedes: null
promoted_to: null
---

# 表示内容の状態は実scopeと分離し、訪問履歴のカメラも同期する

## Conclusion

Architectureの表示内容変更は階層移動ではない。内容×実scopeの保存領域に検索/選択/展開/モード別カメラを格納し、内容切替では現在のscopeと訪問IDを保つ。rootのview状態だけでなく、explorerの現在訪問および他訪問に保存したcamera/selectionも同じ内容のscope別状態へ同期する。rootだけ切り替えると、戻る・親へ・モード変更で別内容のカメラや選択が再適用される。

実scopeを開くexplorerは全体モデルを維持し、描画モデルだけを部分グラフにする。範囲外の実scopeが空でもrootへ自動移動しない。全体への明示移動は切替完了後に実行し、旧内容の非同期callbackを現在の状態へ適用しない。

## Scope

タブ10の任意の表示内容と既存semantic explorer/sessionの接続。全体表示の既存モデル、他タブのscopeやカメラ処理を変更する根拠ではない。

## Evidence

source_commitを基点とする今回の変更で検証。vehicleの全体→DB→全体で位置/カメラ/ID一致、DB再訪で検索/選択/カメラ復元、実LegacyHost内部で空のDB内容でもscope保持。範囲外APIへの明示移動で実scopeと選択が一致。

## Verification

`pnpm test src/analyzer/semantic/architectureContent.test.ts src/pages/SemanticAnalyzerPage.test.tsx`。入力交換、内容往復、実scope移動、2D/3Dの選択共有、モード別カメラ復元を再確認する。`docs/technical/tab10-content-selector-review-20260917.md`に入力範囲・測定条件・未検証範囲を記載。
