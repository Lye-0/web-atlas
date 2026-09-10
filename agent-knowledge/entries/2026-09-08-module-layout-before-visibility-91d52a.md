---
id: rm-20260908-module-layout-before-visibility
topic: analyzer-spatial
type: failure
status: active
maturity: candidate
created: 2026-09-08
last_verified: 2026-09-10
source_commit: "91b471a8997a50832c1330024f79e06274469e2b"
related_files:
  - src/components/analyzer/AnalyzerSpatialGraphStage.tsx
  - src/components/analyzer/moduleAggregationControls.test.tsx
  - src/analyzer/moduleAutoAggregation.ts
  - src/analyzer/layout.ts
  - src/pages/AnalyzerPage.tsx
  - src/pages/AnalyzerPage.test.tsx
  - docs/technical/analyzer.md
tags:
  - 3d
  - coordinates
  - manual-collapse
  - conservation
supersedes: null
promoted_to: null
---

# Moduleの全座標を確定してから手動表示を投影する

## Conclusion

Module Dependencyで手動のDirectory開閉をそのまま`layoutAnalyzerView`へ渡すと、閉じたDirectoryのModuleがlayoutから消える。その結果、後段の表示集約が正しく分割しても対象scope自体が欠け、OFFでの保全や閉じた範囲の個別選択を証明できない。

全Moduleを含む固定layoutを先に作り、その座標上で手動・自動の表示ownerを割り当てる。検索入力だけでは手動範囲を開かず、選択した元Moduleだけを個別表示へ取り出す。フィルターで対象外になったModuleは、選択保護を理由に復活させない。

## Scope

Applicable:

- ModuleのDirectory開閉、3D集約、固定座標、Fit、件数・検索・選択保護の変更。

Do not apply:

- 意味解析の対象範囲を広げる操作や、別Viewの意味的な階層移動。
- すべての2D layoutへ同じ全展開方式を強制すること。

## Evidence

- `AnalyzerSpatialGraphStage`の`fullModuleLayout`を使うlayoutと、後段の`moduleManualGroups`・owner投影が境界を分ける。技術契約は`docs/technical/analyzer.md`のModule Dependencyにある。
- `moduleAggregationControls.test.tsx`は独立に再現された48件のfixtureを保持する。開24／閉24でOFFのscope48・個別24・手動24、閉じた1件を選択すると個別25・手動23、対象外filterではscope0となる。
- 旧方式では同fixtureのscopeが24に縮んだ。全layout方式へ修正後、独立担当が同ケースを再実行して一致を確認した。
- 記録時のHEADに対する未コミット実装で確立し、最終製品テストおよび独立正確性検証で再確認した。HEADは観測元であり、単独で修正内容を含むとは限らない。

## Verification

2026-09-10の共通UI変更でもこの境界を再確認した。Resetはカメラだけに限定し、検索結果・元Edgeの選択から手動Directoryを永続展開しない経路は保持した。`AnalyzerPage.test.tsx`の閉Directory→元Edge→解除、`moduleAggregationControls.test.tsx`の元ID保全と、実ブラウザの双方向import・選択解除・共有設定切替を再実行した。共通部品の変更を理由にAへ全Module layout方式を適用しない。

2026-09-09の追加検証では、rendererの保護だけでなくページの選択処理も確認した。元のedge選択がDirectoryを自動で開いており、両端の一時保護を解除しても手動閉状態へ戻らなかった。`AnalyzerPage`で選択と明示的な所属開閉を分離し、ページintegration testと実UI（2対象の閉scope→元imports両端→Escape→手動2対象）で復帰を確認した。rendererだけのunit testではこの経路を検出できない。

1. layout入力が手動の可視状態で元Moduleを削除していないことと、全座標・boundsが開閉前後で同一であることを確認する。
2. `pnpm exec vitest run src/components/analyzer/moduleAggregationControls.test.tsx src/analyzer/moduleAutoAggregation.test.ts`を実行する。
3. 開閉・検索・選択・filterを組み合わせ、scope = 個別 + 自動メンバー + 手動メンバーを元IDで重複なく照合する。表示点の個数だけを元対象数として数えない。
