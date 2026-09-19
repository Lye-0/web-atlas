---
id: rm-20260919-build-declaration-invocation
topic: analyzer-architecture
type: constraint
status: active
maturity: candidate
created: 2026-09-19
last_verified: 2026-09-19
source_commit: "383aaf6"
related_files:
  - src/analyzer/buildAdapters.ts
  - src/analyzer/semantic/architectureCommands.ts
  - src/analyzer/semantic/architecturePlatformFlows.ts
  - src/analyzer/semantic/architecturePlatformFlows.test.ts
tags:
  - commands
  - provenance
  - static-analysis
supersedes: null
promoted_to: null
---

# 成果物宣言の検出と、生成操作の対応は別の段階

## Conclusion

buildAdaptersの入出力が存在していても、Command FlowのNode呼出とArchitecture操作が未対応なら簡易図に生成段階が出ない。先に共通コマンド断片・出力宣言・元ファイル/cwdを照合し、足りないadapterを補う。宣言や依存パッケージだけから操作を追加しない。同一script内の複数CLIはscript IDだけでなくコマンド断片へ出力を対応させる。

## Scope

静的なツール操作と成果物の関係。実行済みの判断、未呼出関数・条件分岐・可変設定の評価、任意のNodeファイル間の制御フロー解決へ一般化しない。既存の初期宣言を保持することと、操作の出力を確定することは別。

## Evidence

- Nextの3断片はarchitectureCommandsに存在したが、Architecture操作変換が対応していなかった。
- Nodeから直接呼ばれるesbuildファイルは、生成物宣言だけが既に検出されていた。型付きASTのimport/require、トップレベル呼出、cwdを照合して元IDを保持したまま接続した。
- architecturePlatformFlows.test.tsに、未呼出・動的・可変設定、cwd、別断片の別出力、複数成果物の配布の正負例を追加。

## Verification

`pnpm exec vitest run src/analyzer/semantic/architecturePlatformFlows.test.ts src/analyzer/buildAdapters.test.ts`。原本のscriptを実行せず、Command Flowの元ID/根拠と新しい対応を照合する。
