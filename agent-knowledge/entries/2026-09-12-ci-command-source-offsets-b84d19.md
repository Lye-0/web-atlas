---
id: rm-20260912-ci-command-source-offsets
topic: analyzer-command-evidence
type: failure
status: active
maturity: candidate
created: 2026-09-12
last_verified: 2026-09-12
source_commit: "34551afe34e478546f34a7e557dfa080f71a667f"
related_files:
  - src/analyzer/providerAdapters.ts
  - src/analyzer/yamlCommandOffsets.ts
  - src/analyzer/commandParser.ts
  - src/analyzer/semantic/completion.test.ts
tags:
  - analyzer
  - ci
  - source-range
supersedes: null
promoted_to: null
---

# CIコマンドを合成すると元範囲の座標系が変わる

## Conclusion

GitLab script配列を ` && ` で連結した文字列に、YAML配列全体の開始位置を加える方法ではEvidenceがずれる。元コードにリストの `- ` が混入し、Java起動の末尾が欠落する反例を確認した。各scalarのdecoded文字境界を原文へ対応させ、合成separatorも含むcommandSourceOffsetsをCommand parserへ渡す。解析したCLIや起動先が正しくても元範囲は別に検証する必要がある。

## Scope

Applicable:
- CI scalar/listを合成し、Command・Runtime・Evidenceへ渡す処理。

Do not apply:
- 原文と同じ文字列の単純な位置計算へ無条件に対応表を追加しない。
- 全YAML escape、動的shell展開、実行時生成コマンドの完全対応を意味しない。

## Evidence

- providerAdaptersのGitLab job生成 → yamlCommandOffsets → PackageScriptFact.commandSourceOffsets → commandSourceRange。
- completion.test.tsのYAML sequenceと引用scalarは、各fragmentを元sourceからsliceして一致を検証する。
- 初期HEADからの未commit実装で確認。全体1267 tests成功、completion30 tests成功。

## Verification

1. CIの合成規則とseparator長が変更されていないか確認する。
2. `pnpm test src/analyzer/semantic/completion.test.ts` で元source sliceの回帰を実行する。
3. 新しいescape/block形式を追加する場合はdecoded値の一致だけでなく、各fragmentの原文境界も検証する。
