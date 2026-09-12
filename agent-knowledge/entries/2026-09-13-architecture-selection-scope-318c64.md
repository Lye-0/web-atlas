---
id: rm-20260913-architecture-selection-scope
topic: analyzer-architecture
type: constraint
status: active
maturity: candidate
created: 2026-09-13
last_verified: 2026-09-13
source_commit: "28bcfa195bd47323ab400111d1addfe232a3fbf3"
related_files:
  - src/analyzer/semantic/architectureProjection.ts
  - src/analyzer/semantic/flowPresentation.ts
  - src/analyzer/semantic/flow3DInput.ts
  - src/analyzer/semantic/architectureStableScope.test.ts
  - docs/technical/tab10-click-stable-scope-review-20260913.md
tags:
  - selection
  - projection
  - cache
  - layout
supersedes: null
promoted_to: null
---

# 外側の選択を基本投影と配置の入力へ戻さない

## Conclusion

Architectureの現在地が不変でも、投影のconnections/shownへselected IDの全近傍を加えると図が広がり、2Dの段階layoutが変わる。さらに毎選択で同じ内容の新graphを返すだけでも、graph identity所有の3D静的入力cacheが無効になる。基本投影は現在地・filter・環境・周辺表示・明示展開で共有し、通常の選択/強調と分離する。

未特定要求の選択保護は既存の代表対象集合内だけで行う。表示集合から選択対象を取り出す場合も、基本2D座標を再計算せず既存位置を維持する。表示外になった選択は元モデルから詳細/明示openへ接続し、図へ自動追加しない。

## Scope

タブ10の内部詳細＋外側概要に適用。明示的な階層移動・環境/フィルター変更・周辺設定・展開・Fitは正当な更新。他タブの選択中心の関係図へ無条件に適用しない。

## Evidence

- architectureStableScope.test.ts: 2D/3D、周辺ON/OFFのID集合・関係・座標・静的入力再利用、request保護、元modelの不変性。
- 同一Chess modelの旧HEAD比較: Suite内部でchess選択後、表示対象3→10、元集合3→34、2ブロック移動。修正後3対象/2線、移動0。
- 同じ100回選択の準備処理中央値76.38ms→0.154ms。GPU/ブラウザイベント応答ではない。未commit変更で検証。

## Verification

1. architectureStableScope /architectureFocus /SemanticAnalyzerPageテストを実行する。
2. 外側を順に選択し、scopeだけでなくrepresented ID集合、基本edge集合、配置、graph identity由来の再計算を比較する。
3. 表示設定で対象を隠した後も、選択情報と明示移動が元の実体IDへ接続していることを確認する。
