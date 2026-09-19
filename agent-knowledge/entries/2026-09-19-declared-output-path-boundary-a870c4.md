---
id: rm-20260919-declared-output-path-boundary
topic: analyzer-architecture
type: constraint
status: active
maturity: candidate
created: 2026-09-19
last_verified: 2026-09-20
source_commit: "72377ce"
related_files:
  - src/analyzer/staticNodeScript.ts
  - src/analyzer/semantic/architectureStaticSiteFlows.ts
  - src/analyzer/semantic/architectureStaticSite.test.ts
tags:
  - static-analysis
  - output-path
  - provenance
supersedes: null
promoted_to: null
---

# 出力宣言のパスを、読取可能な入力パスの制約で消さない

## Conclusion

生成scriptの出力宣言は入力スナップショット外を指すことがある。入力読取用localPathで拒否したり、architecturePathで先頭の親参照を落としたりすると、操作が不明に戻るか誤ったルート内成果物になる。出力宣言は範囲外であることを保持して説明し、ファイルの走査/書込とは別に扱う。cwd基準の文字列とimport.meta.urlから解決済みのパスを区別し、cwdを二重に加えない。

## Scope

独自Node scriptの静的入出力宣言。ファイルアクセス範囲の拡大、任意コードの評価、生成済みの保証を許可する規則ではない。

## Evidence

静的サイトの単一HTML出力が解析ルートの親を既定先にし、argvで上書き可能だった。scriptを実行せず、既定の範囲外パスと変更条件、入力/更新先、書込位置を同時に保持した。専用fixtureでサブディレクトリcwd・明示引数・未解決引数・同一入力更新・循環を照合している。

## Verification

`pnpm exec vitest run src/analyzer/semantic/architectureStaticSite.test.ts`。`declaredPath`が読取APIや走査開始点へ渡されていないことを併せて確認する。現行契約はdocs/technical/architecture-map.mdと静的サイト検証記録を参照。
