---
id: rm-20260908-aggregation-view-history-initialization
topic: analyzer-spatial
type: failure
status: active
maturity: candidate
created: 2026-09-08
last_verified: 2026-09-08
source_commit: "f97bafe59bb72d7af596504bbc0de319a84cb625"
related_files:
  - src/analyzer/session.ts
  - src/analyzer/session.test.ts
  - src/analyzer/autoAggregation.ts
  - src/analyzer/autoAggregation.test.ts
  - src/components/analyzer/SemanticFlow3D.tsx
  - src/components/analyzer/AnalyzerSpatialGraphStage.tsx
  - src/components/analyzer/moduleAggregationControls.test.tsx
  - docs/technical/semantic-analyzer.md
tags:
  - session
  - hysteresis
  - camera
  - initialization
  - 3d
supersedes: null
promoted_to: null
---

# 共有の自動設定とView別の密度履歴を、初期投影で混ぜない

## Conclusion

共通3DのON/OFF設定は全Viewで共有するが、明示開閉と密度のhysteresis履歴は各Viewに属する。密度履歴は現在表示されている集合の一覧と同一ではなく、選択保護・手動表示・明示展開で代表が一時的に消えても保持する。

Viewへ戻る際、Canvas初期化前の仮projectionで計算した結果を保存すると、復元カメラの実投影が届く前に履歴が上書きされる。すると同じ入力・同じカメラへ戻っても境界域の集約判断が変わる。実matrixと正のviewportが揃い、ONで判断可能になってから履歴を更新する。

## Scope

Applicable:

- 3D rendererの初期化、View切替、カメラ復元、共有設定、選択保護と自動開閉のdeadband。

Do not apply:

- プロジェクトをまたいで古いViewの対象IDや明示開閉を復元すること。
- 全設定をブラウザー永続ストレージへ保存すべきという要求。現行はsession内共有である。

## Evidence

- `session.ts`はglobal `autoAggregation`とView別`aggregation`を分ける。`session.test.ts`はON/OFF共有、View別状態、project replacement時のView状態破棄を確認する。
- `projectAutoAggregation`の`activeGroupIds`は密度の判断履歴。`autoAggregation.test.ts`は明示展開または全件保護中でも履歴が残ることを確認する。
- `SemanticFlow3D`の履歴保存effectは実matrix・正のviewport・ONを要求し、`AnalyzerSpatialGraphStage`にも実viewportのguardがある。`moduleAggregationControls.test.tsx`はdeadband内の復元あり／なしを区別する。
- 親の実ブラウザ再現ではView往復で同一カメラの集約数が変わった。guard修正後、resize、OFF、他4View往復、再ONを経ても元のカメラ・選択・検索と同じ密度履歴／表示件数へ復帰した。
- 記録時HEADに対する未コミット実装を最終テストと独立確認で検証した。現行状態契約は`docs/technical/semantic-analyzer.md`のShared 3D display aggregationにある。

## Verification

1. global設定、View別の明示判断、密度履歴の保存先を確認し、描画結果や仮projectionの初回値で履歴を置換していないか調べる。
2. `pnpm exec vitest run src/analyzer/session.test.ts src/analyzer/autoAggregation.test.ts src/components/analyzer/moduleAggregationControls.test.tsx`を実行する。
3. deadband内の実カメラを保存し、ON/OFF・他View往復・resize・選択解除後を同じカメラで比較する。別のFit結果やviewportの差を履歴の不具合と混同しない。
