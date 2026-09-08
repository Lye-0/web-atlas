---
id: rm-20260908-display-owner-traversal-boundary
topic: analyzer-flow
type: constraint
status: active
maturity: candidate
created: 2026-09-08
last_verified: 2026-09-08
source_commit: "f97bafe59bb72d7af596504bbc0de319a84cb625"
related_files:
  - src/analyzer/autoAggregation.ts
  - src/analyzer/autoAggregation.test.ts
  - src/analyzer/semantic/flowAutoAggregation.ts
  - src/analyzer/semantic/flowRelationInteraction.ts
  - src/analyzer/semantic/flowRelationInteraction.test.ts
  - src/components/analyzer/SemanticFlowStage.tsx
  - src/components/analyzer/SemanticFlow3D.tsx
  - docs/technical/semantic-analyzer.md
tags:
  - 3d
  - display-owner
  - traversal
  - provenance
supersedes: null
promoted_to: null
---

# 表示集合の接続を元グラフの到達可能性へ流さない

## Conclusion

表示ownerへの端点置換は描画の集約であり、元グラフの探索用グラフではない。`A→b1`と`b2→C`があり、互いに接続しないb1とb2を表示集合Bへ入れると、画面には`A→B→C`が現れる。しかしAからCへの正規経路は成立しない。

多段探索・経路保護・詳細・Evidenceは元IDと元関係を読む。描画上の向き・role・hoverは表示端点も認識する必要があるが、そのfallbackを解析上の到達可能性へ再利用しない。集約線からは元関係一覧を開き、元関係選択時は実端点を個別表示する。

## Scope

Applicable:

- 共通3Dの自動／手動集約、集約線、ホバー強調、直接関係と多段探索の接続部分。

Do not apply:

- Data Flow解析がcall-site文脈や処理要約を構成する意味モデル自体。その別境界は`rm-20260908-data-flow-context-summaries`を参照する。
- 正式に追加された解析関係を、表示用と決めつけて探索から除外すること。

## Evidence

- `projectAggregationRelations`は方向・kind・confidence別に表示線をまとめ、`originals`に元関係を保持する。`autoAggregation.test.ts`のdisconnected membersケースは画面上の2段と正規到達集合`A,b1`を分ける。
- `projectAggregatedSemanticFlow`は描画用graphを生成する。`SemanticFlowStage`の`explorerRelations`は元graphを入力とし、`SemanticFlow3D`は元graphと`renderGraph`を別引数で保持する。
- `flowRelationInteraction.test.ts`の表示端点ケースは、元provenanceだけを見ると表示集合のrole・kind・hoverが欠ける逆方向の不具合を確認する。修正は表示用相互作用に限定される。
- 最終独立検証で全5つの3D adapterの元関係・Evidence保全を確認した。現行契約は`docs/technical/semantic-analyzer.md`のShared 3D display aggregationにある。
- 記録時のHEADに対する未コミット実装を検証したため、利用時には現在の呼び出し境界を再確認する。

## Verification

1. 検索・詳細・BFSの入力まで呼び出しを追い、display graphやowner IDが混入していないことを確認する。
2. `pnpm exec vitest run src/analyzer/autoAggregation.test.ts src/analyzer/semantic/flowRelationInteraction.test.ts`を実行する。
3. 別メンバーを介する見かけ上の経路、逆方向・異種・異確度・内部関係を用意し、元関係の保存と正規探索結果を別々に検証する。
