---
id: rm-20260918-simple-ownership-before-auxiliary
topic: analyzer-architecture
type: failure
status: active
maturity: candidate
created: 2026-09-18
last_verified: 2026-09-18
source_commit: "72a9e7831e297b7503c2b4249f3a9ae314ddb849"
related_files:
  - src/analyzer/semantic/architectureSimple.ts
  - src/analyzer/semantic/architectureSimple.test.ts
  - src/analyzer/semantic/architectureSimplePolishActual.test.ts
  - docs/technical/tab10-simple-overview-polish-review-20260918.md
tags:
  - simple-overview
  - auxiliary
  - ownership
  - internal-relations
supersedes: null
promoted_to: null
---

# 簡易要約では補助用途より実際の所属を先に解決する

## Conclusion

補助用途を先に一括要約すると、主要アプリに所属するテスト責務とその要求が別要約へ移り、本来内部の参照が外側への線に見える。元の解析が正しくても表示投影でこの誤読が生まれる。簡易全体では親/論理所有者/要求元の写像を先に作り、独立した補助ルートだけを用途でまとめる。

## Scope

Architecture正規モデルから簡易全体への要約に適用する。元モデルのauxiliary判定や全体の補助フィルターを変更する理由にはしない。独立した補助構成、内部移動先となる実際の入口は元の境界を維持する。

## Evidence

- source_commitを基準にした本作業差分で検証。vehicle-managementの旧簡易図41要素/80線を再現し、内部テスト責務/要求の元parentId/ownerIdを照合した。
- architectureSimple.test.tsの「keeps auxiliary internal code and requests inside their actual app」は内部コードと未特定要求を同じ単位へ収め、外側線0、内部元関係2を確認する。
- 保存した3モデルで元ノード/元関係ID保存と旧全体/プリセット投影一致を検証。検出層のHTTP判定は変更していない。

## Verification

1. `pnpm exec vitest run src/analyzer/semantic/architectureSimple.test.ts`。
2. 大量の外側参照が見えたときは、元両端の所属と要約ownersを照合する。線数だけで誤検出と断定しない。
3. 内部へ移す関係は元の両端が同一要約に写るものだけとし、別アプリへの正当な関係は残す。
