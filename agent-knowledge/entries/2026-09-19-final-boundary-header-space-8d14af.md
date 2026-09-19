---
id: rm-20260919-final-boundary-header-space
topic: analyzer-architecture
type: failure
status: active
maturity: candidate
created: 2026-09-19
last_verified: 2026-09-19
source_commit: "c475a68"
related_files:
  - src/analyzer/semantic/architectureSimpleShelfBounds.ts
  - src/analyzer/semantic/architectureHeadings.ts
  - src/analyzer/semantic/architectureShelfPolish.test.ts
  - src/components/analyzer/SemanticFlow2D.tsx
tags:
  - simple-overview
  - bounds
  - layout
supersedes: null
promoted_to: null
---

# 領域再計算後でも見出し余白が別の構成を囲い込む

## Conclusion

semanticFlowRegionsが最終座標を使っていても、architectureBoundaryHeadingsが隣接する共有コードを避けて上へ移動すると、描画時のborderTopが大きく上がる。囲いの重なりを古いキャッシュと決めつけず、最終borderTopとカード外形まで比較する。共有コードの近傍配置を保持し、独立した棚の見出し余白を先に確保してから、必要な隣接領域だけをずらす。

## Scope

簡易全体の独立構成・補助構成の棚。元所属の変更や、通常の全体表示にある正当な親子包含を解消する根拠にはしない。操作ごとの再配置には使用しない。

## Evidence

- c475a68の保存入力と実ブラウザで、起動領域の下端に下側の見出し余白が重なることを再現。共有コードは利用元より140上にあり、ノード中心だけの衝突確認では検出できなかった。
- 初案で棚と共有コードをまとめてずらすだけでは、共有コードを棚の囲いに取り込む意味上の問題が残った。見出し用空間を先に確保し、実入力では共有コード自体は動かさず棚だけ52、後続補助領域だけ24移動して解消。
- architectureShelfPolish.test.tsは別名fixture、棚と共有の近傍、再適用の不変、通常親子への非適用、3保存入力の最終囲いと共有コードの外形、既存主経路と元関係の不変を確認する。

## Verification

`pnpm exec vitest run src/analyzer/semantic/architectureShelfPolish.test.ts`。保存入力の比較はSHELF_REVIEW=1と検証記録のキャッシュが必要。同条件の実ブラウザ比較で、囲いの境界とその外の共有コードを確認する。
