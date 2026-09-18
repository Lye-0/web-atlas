---
id: rm-20260918-route-bands-not-role-columns
topic: analyzer-architecture
type: failure
status: active
maturity: reused
created: 2026-09-18
last_verified: 2026-09-18
source_commit: "33e40cb"
related_files:
  - src/analyzer/semantic/architectureSimpleLayout.ts
  - src/analyzer/semantic/architectureRouteLanes.test.ts
  - docs/technical/tab10-route-lanes-review-20260918.md
tags:
  - simple-overview
  - layout
  - routes
supersedes: null
promoted_to: null
---

# 原本・操作・到着先の列だけを揃えても経路はまとまらない

## Conclusion

役割別の列を独立に縦並びし、共有対象を最後に配置すると、一原本の枝や操作と到着先が離れる。経路のない全原本へ全幅の行を割り当てると縦の空白も増える。簡易全体では記録された入力/生成/起動/公開/適用の原本集合を先に整理し、共有区間を含む経路帯として配置する。共有実体は複製せず、経路なしと共有/補助/利用先にはコンパクトな別の配置役割を与える。

## Scope

簡易全体の説明順序と配置に適用。解析器の実体分類を配置に合わせて変更したり、詳細な全体へ同じ座標を適用したりする根拠ではない。経路未確認と補助用途を混同しない。配置上の到達集合は所有権や実行済み経路を意味しない。

## Evidence

- 33e40cbの3保存入力との比較。vehicleのAPI production公開は共有区間の後置で離れ、経路なし構成が原本列を延ばしていた。
- architectureRouteLanes.test.tsは一原本三枝の操作/到着先同一行、複数原本合流、18独立対象の保持と複数列化、外部起動対象、任意環境を検証する。
- Chromeの小構成で枝見出しが前の行へ押し上がる二次問題を確認。共通見出しアルゴリズムではなく簡易の行高へ文字高さ分の余白を追加し、前の枝を囲わないことをテスト・画面で再確認した。
- 053d7a5の追跡で、共有する公開操作だけを帯の中間へ置いても、そこへ入る専用ビルドが別用途の枝の向こうに残る問題を確認。共有区間から記録済み入力を有限に逆追跡し、一つの共有区間へ対応する非原本の前段も同じ帯へ入れる。原本は複製せず入口近くへ寄せる。architectureSharedPublication.test.tsでビルド/共通公開/到着先の同一行と元ID保存を再検証。

## Verification

1. `pnpm exec vitest run src/analyzer/semantic/architectureRouteLanes.test.ts`。
2. 小構成と大構成の両方で原本から操作・到着先まで追う。列の整列や保存ID数だけを可読性の根拠にしない。
3. 経路帯外の参照・通常通信・補助が失われず、選択で座標を再生成しないことを確認する。
