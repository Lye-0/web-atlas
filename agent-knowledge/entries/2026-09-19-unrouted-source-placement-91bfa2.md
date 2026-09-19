---
id: rm-20260919-unrouted-source-placement
topic: analyzer-architecture
type: failure
status: active
maturity: candidate
created: 2026-09-19
last_verified: 2026-09-19
source_commit: "383aaf6"
related_files:
  - src/analyzer/semantic/architectureSimpleUnrouted.ts
  - src/analyzer/semantic/architectureSimpleLayout.ts
  - src/analyzer/semantic/architecturePlatformFlows.test.ts
  - docs/technical/tab10-platform-generality-review-20260919.md
tags:
  - simple-overview
  - layout
  - source-first
supersedes: null
promoted_to: null
---

# 操作経路がない原本を、サービス配置後の末尾へ置かない

## Conclusion

サービスを先に一列へ置いてtopを進め、その後に経路なし原本を配置すると、原本がサービス列の末尾に来る。操作不足を修正して一入力で解消しても、真に操作のない入力では再発する。準備経路がない場合は原本を先に置き、確認済みcontainsのサービス群を近隣の列へ詰める。操作がある場合も、経路外の包含サービスだけを局所的に配置する。

## Scope

簡易図の初期配置。経路を持つ原本の分岐・合流を変更する根拠ではない。隣接や連結を所属と認定せず、関係を反転しない。単独コードパッケージを原本として置くことは実行主体への再分類ではない。原本しかない入力では既存の複数列配置も維持する。

## Evidence

- 操作未対応だった入力で原本下端・サービス一列を再現。操作を追加した図とは別に、scriptなしFirebase fixtureでも原本起点を実ブラウザ確認した。
- 包含が異なる群を同じ一律の行高で置く初案は余白が残った。群ごとの高さで列の空きへ詰め、親子の近さと全IDを保持した。
- 一般性テストで循環/孤立/18独立原本の既存コンパクト配置を確認。経路あり回帰入力の2D/3D全座標と関係は基準版に一致。

## Verification

`pnpm exec vitest run src/analyzer/semantic/architecturePlatformFlows.test.ts src/analyzer/semantic/architectureRouteLanes.test.ts`。操作あり・なしを別々に描画し、通常選択で再配置されないことを確認する。
