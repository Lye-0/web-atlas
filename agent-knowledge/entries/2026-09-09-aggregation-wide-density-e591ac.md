---
id: rm-20260909-aggregation-wide-density
topic: analyzer-spatial
type: failure
status: active
maturity: candidate
created: 2026-09-09
last_verified: 2026-09-09
source_commit: "f573c86e7abcb6457b4f1d334d01e3c1afcacd78"
related_files:
  - src/analyzer/autoAggregation.ts
  - src/analyzer/autoAggregation.test.ts
  - src/analyzer/semantic/flowAutoAggregation.test.ts
  - src/components/analyzer/SemanticFlow3D.tsx
  - docs/technical/semantic-analyzer.md
  - docs/technical/analyzer-selection-density-review.md
tags:
  - density
  - hierarchy
  - projected-span
  - offscreen
  - manual-protection
supersedes: rm-20260908-aggregation-fragmented-density
promoted_to: null
---

# 広い所属のspan超過は、密集した全メンバーを戻す理由にならない

## Conclusion

細かなscopeの密度だけでは画面全体の混雑を見逃すため、意味を保つfile／directory等の階層候補が必要。ただし粗い所属の投影span上限を無条件の解除条件にすると、近接しただけで画面外も含め数万点へ戻る。

ONでは先にコンパクトで読める既存の子候補を採用し、広くても密集している未所有の残りを細かい所属から集約する。Flowの画面外所属は自動展開を保留する。手動展開・現在の経路保護と意味の分離が優先であり、背景件数の上限ではない。OFFの個別対象・既存の強弱・ラベル予算には適用しない。

## Scope

Flowの点群と共通autoAggregationの密度／owner判断。runtime文脈、role、confidence、code／validation／storageの意味境界と元座標を維持する。OFF、明示的な全件展開、2Dカード配置、任意の点数上限へ適用しない。Moduleの別rendererは共通密度判断を使うがFlowの画面外保留は既定で無効。

## Evidence

- source_commitを起点とする修正前は、git-linesの深さ2近接回転でON34,766個別＋37集約。修正後は同じ選択・カメラで1,423個別＋41集約、経路6本を保持。3所属手動展開後は前後2,332個別、OFFは35,303個別で一致。
- `autoAggregation.test.ts`は広い密集候補、画面外→画面内へのパン、境界±10px、ON/OFF、手動保護を検証する。`flowAutoAggregation.test.ts`は元対象の重複・欠落と明示経路保護を検証する。
- 初期のspan解除のみの判断とその数値はsuperseded memoryに歴史的証拠として保存。現在の原則を古いzoom別点数へ合わせない。

## Verification

1. 候補ごとの件数／密度と全体の近接率を確認し、意味階層を維持する。
2. `pnpm exec vitest run src/analyzer/autoAggregation.test.ts src/analyzer/semantic/flowAutoAggregation.test.ts`。
3. 同一入力・カメラで遠近・画面外パン・ON/OFF・手動展開を比較。world座標、ID集合、元Evidence、内訳の非重複と全件保全を確認する。
