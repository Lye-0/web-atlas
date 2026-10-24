---
id: rm-20261024-component-module-extension
topic: analyzer-model
type: failure
status: active
maturity: candidate
created: 2026-10-24
last_verified: 2026-10-24
source_commit: "7e61342"
related_files:
  - src/analyzer/semantic/dataCompiler.ts
  - src/analyzer/sourceSyntax.ts
  - src/analyzer/semantic/dataCompiler.test.ts
  - src/analyzer/semantic/dataCompilerActual.test.ts
tags:
  - typescript
  - component-import
  - evidence
supersedes: null
promoted_to: null
---

# コンポーネント参照には元パスと解析用の拡張子メタデータを両方渡す

## Conclusion

createDataCompilerはAstro/Vue/Svelte/HTMLのスクリプトを抽出してTSとして解析する。SourceFileのScriptKindとallowNonTsExtensionsを指定しても、resolveModuleNamesの返却がresolvedFileNameだけだと、TypeScriptがimport先の実拡張子から分類を再推論してunknown extensionで停止する。コンポーネント参照には抽出形式に対応するextension: ts.Extension.Tsを明示する。元ファイル名を.tsに変えたり対象を除外したりせず、ID・Evidenceのパスと位置を維持する。

## Scope

読み込み済みのコンポーネントスクリプトの、閉じたインメモリコンパイラへの対応。通常のJS/TS拡張子は既存の推論を使う。テンプレート全体の解析、Astro等の実コンパイル、任意の設定評価、解析範囲外のモジュール読取は追加しない。

## Evidence

TypeScript 5.9.3で、.astro参照を含む入力と同型fixtureにおいてextensionFromPathが例外を投げた。Vue/Svelte/HTMLでも再現した。メタデータ追加後、7つの専用テストで参照先の実パス、定義位置、通常TSとの混在、循環、外部/欠損先を照合。実際のAstroプロジェクト144ファイルのスキャンと全semantic投影生成も完了した。

## Verification

`pnpm exec vitest run src/analyzer/semantic/dataCompiler.test.ts`。実入力を確認するときはWEB_ATLAS_ASTRO_REVIEW_ROOTを読み取り専用の対象rootへ設定してdataCompilerActual.test.tsを実行する。対象側のサーバー・ビルド・テストは実行しない。
