---
id: rm-20260910-particle-renderer-contract
topic: analyzer-rendering
type: failure
status: active
maturity: reused
created: 2026-09-10
last_verified: 2026-09-11
source_commit: "bf7c4392d67d1b727967d8d43623b46db9a34e7e"
related_files:
  - src/analyzer/flowParticleStyle.ts
  - src/analyzer/spatialFlow.ts
  - src/components/analyzer/SvgFlowParticles.tsx
  - src/components/analyzer/SpatialFlowParticles.tsx
  - src/components/analyzer/AnalyzerSpatialGraphStage.tsx
  - src/components/analyzer/AnalyzerGraph3DStage.tsx
  - src/components/analyzer/AnalyzerGraph3DStage.test.tsx
  - docs/technical/analyzer-particle-unification.md
tags:
  - particles
  - presentation
  - shared-state
  - animation
supersedes: null
promoted_to: null
---

# 設定共有と粒子の描画仕様を別々に検証する

## Conclusion

共通の通常／控えめ／オフを保存できても、粒子の表現統一を証明できない。以前はAの割合ベースdash、Cの2D丸粒、GPUの発光粒が併存し、同じGPU部品を使うB/Cにも間隔と速度の差が残った。ユーザーは6〜10の3Dを全粒子の基準に指定した。

現在はflowParticleStyleの発光・尾・サイズ、spatialFlowの距離間隔・速度・位相を両描画adapterで共有する。線の長さで移動速度を変えず、通常／控えめで時計を再初期化しない。Bのreduced変更effectはanimation lifecycleと分けないと、速度を同じ定数にしても最初のフレームで時計が止まる。

全Viewを開くだけでは関係種別の適用漏れを検出できない。初回確認ではStack Mapの粒子存在チェックを除外し、Workspaceはuses-configを選択したため、両Viewのcontains除外を見落とした。ユーザーの画像指摘を受け、通常設定でも粒子0個を実画面で再現した。containsも選択された前景線として共通粒子の対象にする。

## Scope

- 粒子の形状、密度、速度、ズーム対応、控えめ設定の変更と回帰確認。
- View固有の線経路、関係の意味、表示範囲を一律に変える根拠にはしない。

## Evidence

- 4描画系統を比較し、割合ベース／固定間隔／上限付き配分、モード別減速、ズーム補正の差を確認した。
- Shared GPU spacingは常に50。SVGも同じ曲線長50単位ごとの配分と65単位/秒を使う。
- Bの速度比較integration testは、reduced変更でloopを停止・再起動するeffectを検出した。lifecycleとreduced更新を分離して解消した。
- 未コミット実装の全15表示をEdgeで確認。詳細と確認範囲は技術ドキュメントに記録した。
- 2026-09-11、追加したタブ1〜5の3Dで同じcontains除外が再発。Project選択のStack MapがGPU粒子経路0本となる実測から確認した。関係線の直接選択だけを検証すると除外の例外に入って見逃すため、元Node／Scope選択で粒子へ渡る入力をcomponent testで検証する。修正後は2入力×5タブで通常／控えめの移動とOFF・非表示からの再開、2D往復後の移動を実WebGLで確認した。

## Verification

1. 設定値だけでなく、各adapterへの引数と時計・形状・間隔・サイズの生成元を照合する。
2. `pnpm exec vitest run src/analyzer/spatialFlow.test.ts src/analyzer/spatialInteraction.test.ts src/components/analyzer/SemanticFlow2D.test.tsx src/components/analyzer/AnalyzerSpatialGraphStage.test.tsx`を実行する。
3. 全4系統の実表示で発光・尾・間隔・速度、通常／控えめ／OFF、ズームを確認する。WebGLの粒子をSVG要素数で評価しない。
4. タブ1のProject→領域とタブ2のProject→Root Packageを必ず選択し、containsにも粒子が存在して移動すること、控えめの間隔、OFFでの消去を確認する。修正後のgit-linesの4本×3モードは実ブラウザで成功した。
