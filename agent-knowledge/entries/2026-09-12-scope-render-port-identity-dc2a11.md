---
id: rm-20260912-scope-render-port-identity
topic: analyzer-rendering
type: constraint
status: active
maturity: candidate
created: 2026-09-12
last_verified: 2026-09-12
source_commit: "dc2a1122e5ee27ae7f54758480d7a6efaffb78cb"
related_files:
  - src/analyzer/graph3DRegions.ts
  - src/components/analyzer/AnalyzerGraph3DStage.tsx
  - src/components/analyzer/graph3DLabels.test.ts
  - docs/technical/analyzer-tabs-1-5-3d.md
tags:
  - scope
  - endpoint
  - identity
  - 3d
supersedes: null
promoted_to: null
---

# Scopeの中心を関係の接続先へ流用しない

## Conclusion

Stack MapのScope中心は、技術1件の場合にはその技術点と一致する。実際のtargetがScopeでも、中心へ線をつなぐと技術への依存のように見える。Scope IDに対応した描画専用portを境界に設け、点・矢印・粒子・選択hit領域で同じ位置を使う。解析Factや実体数へportを加算しない。

## Scope

Stack MapのScope包含関係。ファイル点の位置や、ModuleのDirectory選択時の関係線・粒子を変更する根拠ではない。

## Evidence

git-linesの単一技術Scopeと複数技術Scopeで中心の流用を確認。専用portへ変更後、元モデル・点座標・関係・Evidenceのhashは一致した。入れ子の検証用モデルでは親子portが近接したため、上・手前の辺の左右を親子で交互に使用した。囲いOFF・回転・touch・Enterで元Scope IDの選択を確認した。

## Verification

`graph3DLabels.test.ts`のScope fixtureで元グラフ非変更と技術点からの距離を確認する。実画面でも単一／複数／入れ子のportとラベルを検証し、囲いOFF時に名前と選択を失わないことを確認する。ラベルの衝突回避でportを動かさない。
