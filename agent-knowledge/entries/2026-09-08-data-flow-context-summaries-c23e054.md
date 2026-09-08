---
id: rm-20260908-data-flow-context-summaries
topic: analyzer-flow
type: pattern
status: active
maturity: candidate
created: 2026-09-08
last_verified: 2026-09-08
source_commit: "536f801a62695feb6d90529babf5401895f3508e"
related_files:
  - src/analyzer/semantic/dataFlow.ts
  - src/analyzer/semantic/types.ts
  - src/analyzer/semantic/tabs89IndependentAccuracy.test.ts
  - src/components/analyzer/SemanticFlowDetail.tsx
  - docs/technical/tabs-8-9-data-analysis.md
tags:
  - data-flow
  - call-site
  - stable-id
  - provenance
  - bounded-expansion
supersedes: null
promoted_to: null
---

# Data Flowの呼び出し文脈と原定義を、集約しても分離する

## Conclusion

Data Flowで実引数を共通の仮引数・returnへ無条件に接続すると、同じ関数への別の呼び出しが互いの入力と結果へ到達する。一方、文脈を保つためにcallee本体を呼び出しごと・再帰的に全複製すると、実入力で出力が乗算的に増え、転送や表示にも負担が及ぶ。

現行はcall-siteごとの実引数、contextualな仮引数・戻り口、call resultを分離する。小さい戻り値関連sliceを個別化し、大きいcalleeや深い文脈は明示的な処理集約と戻り口にする。元の定義ノード、return箇所、関係ID、Evidenceは保持し、集約から`sourceMembers` / `sourceEdgeIds`で参照する。集約された入力から戻り値への経路は静的な可能性として説明し、実測やそのままの値のコピーとはしない。

## Scope

Applicable:

- Data Flowの関数間伝播、call-site識別、多段探索、文脈展開、表示集約や性能改善。
- 同名対象の統合やcallee graphの共有でデータ量を減らそうとする変更。

Do not apply:

- Function Call Flowの`calls`を値の伝播へ変換すること。
- Traceイベントの因果や実値、任意のheap alias、完全な動的実行解析の保証。

## Evidence

- `dataFlow.ts`の`Invocation` / `Template`と`connect`は、call resultとcontextualな仮引数・returnを別IDにする。
- 大きい戻り値slice・深い文脈は、原関係のオブジェクトを繰り返し埋め込まず、元IDを参照する集約を作る。閾値は現行コード・技術文書で確認する。
- `tabs89IndependentAccuracy.test.ts`のDF-07/DF-08は、同じ単純関数への異なる入力の呼び出しについて、片方の入力から他方の結果へ到達しないことを独立に検証する。
- 実入力で全callee複製による大きな出力とbulk insertionの停止を確認した後、boundedなsource-reference方式へ変更し、両入力の完走、ID一意性、端点、Evidence、固定実例を再確認した。最終出力も大きいため、この方式だけでブラウザ性能が保証されるわけではない。
- `SemanticFlowDetail`は集約元の対象・関係への到達を残す。現行契約は`docs/technical/tabs-8-9-data-analysis.md`に記載。

## Verification

1. 異なるcall-siteのactual/formal/return/result IDを確認し、全関係をたどっても入力が別call resultへ混入しないことを検証する。
2. `pnpm exec vitest run src/analyzer/semantic/tabs89IndependentAccuracy.test.ts src/analyzer/semantic/dataRefinement.test.ts`を実行する。
3. 集約後も原定義、各return、原関係とEvidenceが残り、集約IDと原IDを混同していないことを確認する。
4. 大きい入力では解析時間・出力サイズとブラウザ操作を別々に測る。canonicalな対象の黙った削除で性能PASSにしない。
