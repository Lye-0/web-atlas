---
id: rm-20260916-architecture-tool-context
topic: analyzer-architecture
type: decision
status: active
maturity: candidate
created: 2026-09-16
last_verified: 2026-09-16
source_commit: "327ab0f"
related_files:
  - src/analyzer/semantic/architectureCommands.ts
  - src/analyzer/semantic/architectureToolFlows.ts
  - src/analyzer/semantic/architectureToolFlows.test.ts
  - src/analyzer/semantic/architectureContext.ts
  - src/analyzer/semantic/architectureContext.test.ts
  - docs/technical/architecture-map.md
tags:
  - tool-usage
  - environment
  - provenance
  - operation
supersedes: null
promoted_to: null
---

# ツールの使用は操作文脈として同じArchitectureへ接続する

## Conclusion

2026-09-16のユーザー合意では、CLIを詳細の補足だけに限定しない。実際のコマンド使用が確認できた場合は、起動・公開・生成・DB適用を別の操作として同じ図へ接続する。依存宣言だけからサービスを作らない規則と両立する。環境/用途の別画面を必須にして主要経路を隠さない。

同一ツール名ではなく元コマンドID・所有package・呼出文脈で識別する。転送引数は元scriptを書き換えない。成果物はパスと環境、DBは既存identityと設定出現箇所を照合する。localの操作先とcloud実体、ツールの実行場所、対象環境は別軸。実行場所・成功は静的コマンドから観測済みにしない。

主要対象はルート図へ投影するが、論理的所属を環境のparentIdへ変更しない。通常選択で対応付けを再実行しない。新しい操作にも元のauxiliary区分を継承し、テストfixtureのコマンドを初期図へ混入させない。

同日の表示仕上げでは、論理定義と環境別構成を元の所有IDで対応付けた。対応線はstructuralとして図/詳細で読めるが、通信・実行の探索で開発と本番をつなぐ橋にはしない。環境空欄は共有の証明ではなく、複数環境へ入力されるコード/成果物の関係が確認できた場合だけ共有と表示する。CLIの実行場所が未知でも、元の操作関係から解決できた具体的な公開先・起動先を「操作先未確認」で隠さない。

## Scope

タブ10の操作・成果物・実行構成への対応。全CLI・任意shell・動的設定の実行解析や、他タブの全面再構成へ広げない。未対応のCLIの起動先を一般論から補わない。

## Evidence

- architectureToolFlows.test.tsの独立入力: dev/prod、同名別DB、生成/適用、パス一致、動的設定の負例、remote binding、選択時の配置/3D cache、auxiliaryの保全。
- vehicle-managementの実script/configからVite、Wrangler、Firebase CLI、Drizzle Kitを照合。docs/technical/tab10-unified-tool-flows-review-20260916.mdに根拠・測定条件・未検証を記録。
- 既存のDBアクセス式がinferredなら新しい実行構成への関係もinferredのままprovenanceへ元関係を保持。
- architectureContext.test.tsの独立fixtureで、定義/共有/既定/未知、structural探索除外、公開先と実行場所の分離、同名呼出範囲、混合集約の意味を確認。仕上げの実入力・GUI・性能結果はdocs/technical/tab10-context-polish-review-20260916.md。

## Verification

1. architectureToolFlows / architectureStableScope / localDevelopmentCli / architectureSummaryテストを実行。
2. 依存のみ・configのみ・未知configで操作対象を捏造しないことを確認。
3. 同じcanvasで操作・成果物・接続を読み、選択だけでscope/座標/cameraが変わらないことを2D/3Dで確認。
4. 元scriptの条件とEvidenceへ戻れること、補助コードの表示区分を維持することを確認。
