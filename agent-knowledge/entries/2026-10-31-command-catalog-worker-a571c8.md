---
id: rm-20261031-command-catalog-worker
topic: analyzer-architecture
type: failure
status: active
maturity: candidate
created: 2026-10-31
last_verified: 2026-10-31
source_commit: "f0f1eaf"
related_files:
  - src/analyzer/projectors.ts
  - src/analyzer/semantic/architectureCommands.ts
  - src/analyzer/semantic/client.ts
  - src/analyzer/semantic/architectureCommands.test.ts
  - docs/technical/semantic-analyzer.md
tags:
  - worker
  - commands
  - performance
  - evidence
supersedes: null
promoted_to: null
---

# コマンドの全体カタログと選択entryの投影は用途を分離する

## Conclusion

Architecture用の全コマンド収集をscriptごとのprojectCommandで行うと、共通の呼び先と全EvidenceのMap構築を繰り返す。projectCommandCatalogは同じresolverで全rootを共有visited/Evidence索引から一度ずつ探索し、architectureCommandsは出辺と所有者を索引化する。UIのCommand Flowは選択entryだけを投影する従来APIを保つ。UI側はsemanticInput(store,true)でfiles/readTextを除いたデータを送り、Worker内でカタログを生成する。

## Scope

全体の静的コマンド収集とWorkerへの受け渡し。executionRankやlaneを全rootの画面表示へ混用しない。元コマンドID、呼出関係、転送引数の別文脈、Evidenceの範囲は保持し、CLI使用を通信の中継や実行済み事実へ変えない。直接解析用のsemanticInput(store)はeager互換経路。

## Evidence

architectureCommands.test.tsは単独entry投影の和集合とcatalogのcommand/target/call/Evidenceを照合し、eager/deferred解析の全nodes/edges/Architecture一致を確認。501scripts/11006Evidenceの単回比較で繰り返し投影412ms、catalog収集23ms。UI全体の速度改善率ではない。client.test.tsでserializable payloadと同期送信失敗後のretryを確認。

## Verification

pnpm exec vitest run src/analyzer/semantic/architectureCommands.test.ts src/analyzer/semantic/client.test.ts src/analyzer/semantic/architectureToolFlows.test.ts。必要時WEB_ATLAS_STABILITY_BENCH=1で同じサンプルの比較を再取得する。
