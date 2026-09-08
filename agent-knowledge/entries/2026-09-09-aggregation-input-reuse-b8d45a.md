---
id: rm-20260909-aggregation-input-reuse
topic: analyzer-spatial
type: pattern
status: active
maturity: candidate
created: 2026-09-09
last_verified: 2026-09-09
source_commit: "91b471a8997a50832c1330024f79e06274469e2b"
related_files:
  - src/analyzer/autoAggregation.ts
  - src/analyzer/autoAggregation.test.ts
  - src/analyzer/semantic/flowAutoAggregation.ts
  - src/pages/FlowAnalyzerPage.tsx
  - docs/technical/analyzer-stabilization-metrics.json
tags:
  - density
  - immutable-input
  - cache
  - performance
  - profiling
supersedes: null
promoted_to: null
---

# 密度計算の準備と表示ownerの更新を分離して計測する

## Conclusion

集約判定だけを速くしても、同じownerで表示グラフ・関係・表示名Mapを作り直すと大規模Flowは重い。数値indexとscratch配列はimmutableな入力へ帰属させ、密度・結果・表示グラフは少数のbounded cacheと同一owner参照を用いて再利用する。query一致や保護対象、手動所属、密度履歴の変化を結果cacheの条件から落とさない。

性能確認はcache再訪のパン/zoomと、未訪問角度の連続回転を分ける。元ID/関係を削減した表示点数だけでは改善を判定しない。

## Scope

autoAggregationとFlow表示投影の最適化に適用。透視投影一般で平行移動を密度に無関係と仮定しない。入力を破壊的変更したまま参照cacheを使う設計にも適用しない。

## Evidence

- 現行density keyはaffineな画面変換の平行移動を除き、微小なmatrix round tripを丸める。4サンプル上限。resultは保護/一致/手動/履歴を含め、表示投影も4件まで。
- 独立密度参照式1,200点×24角度でownerとmetricの等価性を確認。両実入力の全canonical nodes/edges/Evidenceのhash一致を別に確認。
- 最終git-lines ONでパン/zoom集約CPU1,659→0.2ms、未訪問回転1,215.8→169.1ms。後者を測らず前者のcache hitだけを一般化しない。測定区間とinclusive wrapperの意味は関連JSON/レビューに記載。
- 記録時HEADに対する未コミット実装で検証した。

## Verification

1. `autoAggregation.test.ts`と`flowAutoAggregation.test.ts`を実行し、保護・query・manual・入力差替えで再利用条件を確かめる。
2. パンの逆操作だけでなく連続新角度、ON/OFF、大/小入力を同条件で測る。
3. DOMやGPU点数とcanonical対象数を混同せず、到達可能性とEvidenceを別検証する。
