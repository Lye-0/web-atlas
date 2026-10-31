---
id: rm-20261031-module-alias-config-scope
topic: analyzer-modules
type: failure
status: active
maturity: candidate
created: 2026-10-31
last_verified: 2026-10-31
source_commit: "68a88a6"
related_files:
  - src/analyzer/moduleResolver.ts
  - src/analyzer/moduleResolver.test.ts
  - src/analyzer/scan.ts
  - src/analyzer/semantic/dataCompiler.ts
  - docs/technical/analyzer.md
tags:
  - alias
  - config-scope
  - module-resolution
supersedes: null
promoted_to: null
---

# aliasの設定適用範囲と参照先基準を分ける

## Conclusion

tsconfigの候補範囲はconfigDirectory、pathsの参照基準はbaseUrlから得るbasePathで分ける。baseUrlがsrcの場合でも同じ設定範囲のtestsからaliasを使える。逆にbaseUrlが../sharedを指していてもsharedの別入力へその設定を適用しない。Module Factのsupplied importをData Compilerが再利用するため、初段の誤分類をWorker側のrelative fallbackで修復できるとは限らない。

## Scope

読込済みの明示的なtsconfig pathsの解決。任意のextends/references/includeや実行時aliasの完全評価を追加する規則ではない。名前だけで別workspaceへaliasを適用しない。

## Evidence

moduleResolver.test.tsがsrc外のtests、nested lib設定、共有baseUrlの負例を確認。Edgeの合成入力を実Workerで解析し、tests/check.tsからsrc/counter.tsへのModuleDependencyFactを確認。全体1556テスト成功。

## Verification

pnpm exec vitest run src/analyzer/moduleResolver.test.ts src/analyzer/moduleImportUsage.test.ts src/analyzer/semantic/dataCompiler.test.ts。configDirectoryとbasePathが異なる正例・負例を両方確認する。
