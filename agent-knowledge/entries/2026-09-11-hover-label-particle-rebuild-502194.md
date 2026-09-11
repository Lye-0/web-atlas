---
id: rm-20260911-hover-label-particle-rebuild
topic: analyzer-rendering
type: failure
status: active
maturity: candidate
created: 2026-09-11
last_verified: 2026-09-11
source_commit: "502194f8d67b8101f8ab9c6f3051bcad5139a116"
related_files:
  - src/components/analyzer/AnalyzerGraph3DStage.tsx
  - src/components/analyzer/SpatialFlowParticles.tsx
  - docs/technical/analyzer-particle-unification.md
tags:
  - hover
  - label
  - particles
  - animation
supersedes: null
promoted_to: null
---

# ホバーの再配置ループは粒子の停止として現れる

## Conclusion

ホバーでラベル優先順を変えて自分のhit領域を動かすと、静止ポインターの下でenter／leaveが往復する。新しい3D stageでは、この更新が曲線配列と粒子materialの再生成へ伝わり、粒子が止まる症状になった。点の投影位置が変わらないホバーラベルは前の表示位置を予約し、他ラベルの配置より先に占有する。

## Scope

投影したHTMLラベルとGPU粒子を併用するAnalyzerGraph3DStage。カメラ・表示範囲が変わった時まで画面座標を固定する根拠にはしない。Cの共有hover入力所有権とは別の、ラベル配置由来の往復である。

## Evidence

git-linesのModuleでopenGraph.tsを検索選択し、粒子メニューを控えめにしてポインターを動かさないと再現。距離uniformは0のまま、OFFでも350msで22フレーム進んだ。ポインターを画面外へ動かすと再開した。修正後の同操作では控えめの距離が増加し、OFFで0フレームとなる。計測はreports/unified-3d-20260911/particles-debug.json、再現スクリプトは.cache/particle-resume-check.mjs。

## Verification

1. 現行コードのラベル配置と粒子配列の更新境界を確認する。
2. 密な点群でメニューを閉じる、ラベルへ入る操作を行い、ポインターを固定して観察する。
3. 通常／控えめの距離uniform増加と、OFF時のフレーム停止を測る。フレームが進むだけで粒子が動いていると判定しない。
