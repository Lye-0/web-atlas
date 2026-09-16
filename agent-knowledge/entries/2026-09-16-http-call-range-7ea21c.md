---
id: rm-20260916-http-call-range
topic: analyzer-evidence
type: failure
status: active
maturity: candidate
created: 2026-09-16
last_verified: 2026-09-16
source_commit: "9cb1bca"
related_files:
  - src/analyzer/semantic/architecture.ts
  - src/analyzer/semantic/architectureSyntax.ts
  - src/analyzer/semantic/httpFetchBinding.ts
  - src/analyzer/semantic/crossProjectCorrectness.test.ts
tags:
  - http
  - source-range
  - callback
  - binding
supersedes: null
promoted_to: null
---

# 呼出チェーンは開始位置だけで要求のASTを対応付けない

## Conclusion

fetch(...).then(...).then(...)の内外の呼出は同じ開始位置を持つ。Architecture側で開始位置だけをfindすると、正しく検出したfetch要求へ外側thenのcallbackを要求先として割り当てる。元Evidenceの開始と終了を両方照合する。検出器の誤検出と決めつけてfetchを消さない。

別の問題として同名fetchのbindingは必要。既知importとconstクライアント、local/parameterのshadowingを分ける。名前だけで全て採用することも、object.fetchを一律削除して正当な既知クライアントを失うことも避ける。

## Scope

JS/TSの呼出範囲からArchitecture要求・表示・Evidenceを対応付ける処理。任意のHTTPライブラリ、動的設定実行、文字列変換後の全言語offset変換の一般解ではない。

## Evidence

- web-atlasのsemantic.worker.tsの2要求は検出IDとEvidenceを維持し、表示式をcallbackからparserRuntimeUrl/legacyParserRuntimeUrlへ修正。
- crossProjectCorrectness.test.tsでfetch→then→then、近接要求、動的URL、非通信local fetch、既知import/別名/クライアントとshadowingを独立検証。
- vehicle-managementの差分確認でSELF 115件とaws4fetch 4件を正例として保持。ローカルworker.fetchのHTTP分類のみ是正。
- docs/technical/tab10-cross-project-correctness-review-20260916.mdに固定入力・件数・ブラウザ範囲を記録。

## Verification

1. crossProjectCorrectness.test.tsとarchitectureFocus.test.tsを実行。
2. 元ソースをEvidenceのstart/endでsliceし、要求calleeと第一引数、後続callbackの範囲を別々に照合。
3. 正常な要求IDが残り、誤分類の呼出自体は通常のoperationとして残ることを確認。
4. URLを解決できないこととHTTP呼出を確認できないことを混同しない。
