---
id: rm-20260909-architecture-semantic-boundary
topic: analyzer-architecture
type: decision
status: active
maturity: candidate
created: 2026-09-09
last_verified: 2026-09-09
source_commit: "62a01861b3f1cd8ec5df8d019d989a8143dc1775"
related_files:
  - src/analyzer/semantic/architecture.ts
  - src/analyzer/semantic/architectureProjection.ts
  - src/analyzer/semantic/architecture.test.ts
  - src/pages/FlowAnalyzerPage.tsx
  - docs/technical/architecture-map.md
  - docs/technical/architecture-map-review.md
tags:
  - architecture
  - semantic-aggregation
  - projection
  - evidence
supersedes: null
promoted_to: null
---

# Architectureの意味階層と表示密度を別々に扱う

## Conclusion

タブ10はCの操作基盤を使うが、2Dは各構成階層の関係を選択前から表示する構成図。3Dも同じArchitecture要素を点にし、元の全関数・全値へ戻さない。自動省略OFFはArchitecture要素を全表示する指定であり、意味集約を解除する指定ではない。

実行単位の境界はmanifest・具体的な入口・設定から確定する。内部責務は子要素、ライブラリは共有コード、配備先は環境付きの属性として分ける。構成関係の集約は端点・種類・confidence・環境ごとに元edge/Evidenceの集合を保存し、隣り合う要約関係から推移的な実行経路を生成しない。

## Scope

タブ10の構成モデルとC共通操作への接続に適用。Aの全面更新はこの作業の対象外であり、A/Bを同じrendererへ変える根拠ではない。実装・検証はユーザー指定により単独実行したが、恒久的なサブエージェント禁止規則ではない。

## Evidence

- 記録時HEADに対する変更を検証。T01–15と補足22テストで誤ったアプリ境界・DB生成・動的接続・集約の負例を確認。
- Git LinesでExtension Host/Webview、vehicle-managementでWeb/Worker/WPF/共有コード、Web Atlasで静的Webを独立期待値に照合。
- 40要素fixtureでON/OFF後のArchitecture ID・位置・カメラを保持し、内訳閲覧と明示選択を分離。受け入れ表は技術レビューに記載。

## Verification

1. `pnpm exec vitest run src/analyzer/semantic/architecture.test.ts src/pages/SemanticAnalyzerPage.test.tsx`。
2. 2D root→内部→3D→OFFを操作し、元memberの大量再表示やIDの付け替えがないことを確認。
3. 環境・関係種別・confidence別の集約とprovenanceを照合し、集約件数を全ファイル数と混同しない。
