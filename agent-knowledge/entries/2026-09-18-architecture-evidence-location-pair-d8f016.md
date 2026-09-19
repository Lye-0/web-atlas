---
id: rm-20260918-architecture-evidence-location-pair
topic: analyzer-architecture
type: failure
status: active
maturity: candidate
created: 2026-09-18
last_verified: 2026-09-18
source_commit: "2fcc8a9"
related_files:
  - src/analyzer/semantic/architectureSimpleEvidence.ts
  - src/analyzer/semantic/architectureSimpleUsage.ts
  - src/analyzer/semantic/architectureSimpleBounds.test.ts
  - src/components/analyzer/ArchitectureSimpleDetail.test.tsx
  - docs/technical/tab10-simple-bounds-provenance-review-20260918.md
tags:
  - evidence
  - source-location
  - display
supersedes: null
promoted_to: null
---

# Architectureの代表パスとEvidence行は独立している

## Conclusion

Architectureのnode.pathは所属ディレクトリや実行入口になり得る。先頭Evidenceは設定やscriptを指す場合があるため、node.pathへevidence.lineを足すと実在しない根拠位置になる。代表根拠のpath/line/endLineは同じEvidenceから取り、所属・定義・設定・設定上の入口は別項目で表示する。

## Scope

Architecture要約と、その内訳・操作の表示に適用。全SemanticNodeのpathをEvidenceへ置換する規則ではない。元Evidenceや解析の所属を変更する根拠にはしない。実行構成のentryPathsが空でも、entryDeclarationに明示宣言が保存されている場合がある。

## Evidence

- source_commitを基準とした修正差分で、ディレクトリ＋別ファイルの行、入口＋package.jsonの行という二種類を再現。
- architectureSimpleBounds.test.tsは所属だけの対象、別設定Evidence、空entryPaths/entryDeclarationを独立fixtureで照合。
- ArchitectureSimpleDetail.test.tsxは表示行・完全パス・コードプレビュー・コピー引数を同じEvidenceへ対応させる。
- ブラウザで代表根拠、完全パス、範囲、コピー成功を確認。詳細はレビュー記録。

## Verification

1. `pnpm exec vitest run src/analyzer/semantic/architectureSimpleBounds.test.ts src/components/analyzer/ArchitectureSimpleDetail.test.tsx`。
2. 位置がおかしい場合はpath、ownerPath、configurationPath、definitionPath、entryDeclaration、Evidence.path/lineを別々に追う。
3. 同名ファイル/複数Evidenceでも完全パスの展開先が一致することを確認する。代表Evidenceを構成全体のソース範囲と断定しない。
