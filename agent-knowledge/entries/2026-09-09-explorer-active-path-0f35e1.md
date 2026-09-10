---
id: rm-20260909-explorer-active-path
topic: semantic-explorer
type: failure
status: active
maturity: candidate
created: 2026-09-09
last_verified: 2026-09-09
source_commit: "f573c86e7abcb6457b4f1d334d01e3c1afcacd78"
related_files:
  - src/analyzer/semantic/semanticExplorerState.ts
  - src/analyzer/semantic/semanticExplorerState.test.ts
  - src/components/analyzer/useSemanticExplorerNavigation.ts
  - src/components/analyzer/SemanticFlowStage.tsx
  - src/pages/FlowExplorerPage.test.tsx
  - docs/technical/semantic-analyzer.md
  - docs/technical/analyzer-selection-density-review.md
tags:
  - selection
  - history
  - active-path
  - mode-restore
supersedes: null
promoted_to: null
---

# 2D履歴の中心を現在の3D経路の所有者にしない

## Conclusion

保存2DのcenterId／depthから3DのexplicitPathを生成すると、選択を解除しても古い中心が残り、線・粒子・ラベル・集約保護を再生成する。履歴を消す修正では戻る操作を壊す。

現在のvisitが有効な`activePath`を持ち、選択解除／置換ではその経路だけを無効化する。保存twoDや過去visitは保持。通常モード切替は現在のactivePathを継承し、古いtwoDから復活させない。明示的な履歴復元は保存visitの経路を復元する。詳細を閉じるだけ、同じ対象の再選択、カメラ操作では経路を維持する。directionは有効経路から継承し、現在の明示filterがあれば優先する。

## Scope

Runtime／Function Call／Data Flow／Data Modelの共通explorer。通常の背景線や手動所属全体を消す規則ではない。別rendererや、全体の2Dカード配置を再設計する根拠にも使わない。

## Evidence

- source_commitを起点とする修正前後を実ブラウザで比較。2D深さ2→3D→空白クリックで旧経路がData Flow6、Data Model10、Runtime4、Function Call7本から0へ。ON/OFF両方で再検証。
- Data Modelで参照0の対象への置換後も0本。内訳を開くだけでは主選択・経路を維持。8ケース64状態で現在の選択・描画経路・重要点保護を確認。
- 純粋状態テストは辺への置換、カメラ、明示Backも対象。ページテストは通常2D/3D往復・ON/OFFで無効化済み経路が戻らないことを確認する。

## Verification

1. `pnpm exec vitest run src/analyzer/semantic/semanticExplorerState.test.ts src/pages/FlowExplorerPage.test.tsx src/components/analyzer/SemanticFlowStage.test.tsx`。
2. 2D深さ2→3D→空白／別ノード／辺→通常モード復元を行い、保存twoDと現在visit.activePathを別々に照合する。
3. 明示Back、詳細閉じる、カメラ操作、入力交換を確認し、履歴の保存と現在描画の無効化を混同していないことを確認する。
