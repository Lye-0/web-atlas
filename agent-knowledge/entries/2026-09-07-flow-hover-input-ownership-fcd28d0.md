---
id: rm-20260907-flow-hover-input-ownership
topic: analyzer-flow
type: pattern
status: active
maturity: candidate
created: 2026-09-07
last_verified: 2026-09-07
source_commit: "fcd28d0"
related_files:
  - src/components/analyzer/useSemanticFlowHover.ts
  - src/components/analyzer/semanticFlowHoverBindings.ts
  - src/components/analyzer/SemanticFlow3D.tsx
  - src/pages/FlowAnalyzerPage.tsx
  - src/components/analyzer/polishHoverAccuracy.test.tsx
  - src/components/analyzer/useSemanticFlowHover.test.tsx
  - src/pages/FlowExplorerPage.test.tsx
  - docs/technical/semantic-analyzer.md
tags:
  - hover
  - focus
  - stable-id
  - input-ownership
  - lifecycle
  - 3d
supersedes: null
promoted_to: null
---

# Flowの共有ホバーは入力元と表示寿命を区別する

## Conclusion

Views 6–7では点・ラベル・詳細の複数要素が同じ対象IDを指すため、強調対象IDだけでは解除の正当性を判断できない。ポインターとフォーカスを別チャネルに保持し、取得元の識別子と取得時のハンドラーを使って解除する。3Dの遅延leaveや古い詳細行のアンマウントは、新しい入力元の強調を解除してはいけない。同じ対象IDへの移動でも取得元は更新する。

ポインターの取得はボタンを押していない実際のpointermoveで行う。キーボードフォーカスに伴う自動スクロールで別の行が停止中のポインターの下へ入ることがあり、pointerenterを最新入力とみなすとフォーカス対象と強調対象が食い違う。最新の実移動またはフォーカスを優先し、その入力の解除後はもう一方の有効なチャネルへ戻す。

対象が残っていても、View・選択・フィルター・方向・モード・scan・explorer visitが変われば古い入力は失効する。visitの失効を省くと、同じ選択を保持した「親へ」→「戻る」で昔の強調が復活する。DOMからラベルを除去してもblurが届くとは限らないため、3Dラベルの消失は取得元を明示的に解除する。ただしラベルから同じIDのCanvas点へ取得元が移っていた場合、古いラベルの消失で点ホバーを解除しない。

## Scope

Applicable:

- Runtime Flow / Function Call Flowで、Canvas・3Dラベル・2Dカード・詳細行の間に共有する一時的な関係強調。
- 遅延解除、重複する詳細行、ラベルの間引き、選択を維持する履歴移動、キーボードとマウスの引き継ぎを変更する作業。

Do not apply:

- 検索一致、正規の選択、階層位置、解析上の関係や所属の永続化。
- 他タブへの無条件な状態モデルの導入。各画面の既存入力契約を先に確認する。

## Evidence

- `useSemanticFlowHover`の入力元別pointer/focus状態、contextの失効判定、古いハンドラーの拒否。
- `useSemanticFlowHoverBindings`の要素インスタンスごとの`useId`、pointermoveのbuttons判定、チャネル別クリーンアップ。
- `SemanticFlow3D`の取得時ハンドラーを保持する`focusOwner` / `pointerOwner`、ラベル由来を記録する`labelId`、消失とアンマウント時の解除。
- `FlowAnalyzerPage`の`hoverContext`には`navigation.visitId`を含め、検索とカメラは含めていない。
- `polishHoverAccuracy.test.tsx`は、フォーカス／ポインター取得済みの実DOMラベルを除去して残留しないことと、レイアウト由来の進入がフォーカスを奪わないことを独立に確認する。
- `useSemanticFlowHover.test.tsx`は、同じIDへの新しい詳細ホバー、古いcontext、重複行のアンマウント、実移動とフォーカスの引き継ぎを確認する。`FlowExplorerPage.test.tsx`は同じ選択での「親へ」→「戻る」を確認する。
- 実ブラウザでも詳細の自動スクロールによる対象の食い違いを再現し、実移動に限定した取得へ変更後に、フォーカスした対象と関係IDの一致を再確認した。

## Verification

1. 上記の入力元、context、DOM寿命の扱いを現在の実装で再確認する。対象ID一致だけを理由に取得元更新や解除判定を省略しない。
2. `pnpm exec vitest run src/components/analyzer/useSemanticFlowHover.test.tsx src/components/analyzer/polishHoverAccuracy.test.tsx src/components/analyzer/SemanticFlow3D.test.tsx src/pages/FlowExplorerPage.test.tsx`を実行する。
3. 実画面で、ポインターを停止したまま長い詳細リストをキーボード移動し、フォーカス・強調ID・選択・検索・カメラを照合する。続けて実際にマウスを動かし、解除後のフォーカス復帰を確認する。
4. ラベル／行の消失、モード切り替え、同じ選択を保持した履歴移動を確認する。実ブラウザで確認できない消失経路は、Reactの再現テストによる検証と区別して記録する。
