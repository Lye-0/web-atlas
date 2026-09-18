---
id: rm-20260918-simple-deployment-arrival-role
topic: analyzer-architecture
type: failure
status: active
maturity: candidate
created: 2026-09-18
last_verified: 2026-09-18
source_commit: "33a0cc6"
related_files:
  - src/analyzer/semantic/architectureSimple.ts
  - src/analyzer/semantic/architectureSimpleGroups.ts
  - src/analyzer/semantic/architectureSimpleDeployment.test.ts
  - docs/technical/tab10-simple-deployment-review-20260918.md
tags:
  - simple-overview
  - deployment
  - projection
  - destination
supersedes: null
promoted_to: null
---

# 論理所有者が同じでも公開の入力と到着先は同じ要約へ吸収しない

## Conclusion

logicalOwnerIdだけでexecution-configを論理アプリへまとめると、正規モデルに公開経路があっても「アプリ→道具→同じアプリ」の往復に見える。元ID/Evidenceを保存するだけでは主要経路の読解を保証しない。簡易全体ではflow-deploysの到着先となる既存実行構成を保護し、元の公開対象設定として図に残す。

## Scope

正規Architectureから簡易全体への表示投影に適用。公開先検出やURL補完、全実行構成の独立表示、詳細な全体の再設計を要求する規則ではない。公開操作がない/対象が未解決ならその段階で止める。同じ設定の環境別集合にできるが、元実体の同一性を変更しない。

## Evidence

- source_commitを基準とした修正差分で、記録済み公開線のtargetが入力の論理アプリと同じownersへ写っていたことを確認。
- architectureSimpleDeployment.test.tsはコード/成果物合流、複数公開先、同環境の別対象、公開なし/未解決、同名成果物の別環境で、元の到着ID・経路を保持する。
- 3保存入力で元対象/元関係の全ID保存と旧全体/既存プリセット一致を確認。ブラウザでは環境別の元構成を指定して全体へ移動した。

## Verification

1. `pnpm exec vitest run src/analyzer/semantic/architectureSimpleDeployment.test.ts`。
2. 公開が見えない場合、検出・元関係・owners写像の順で確認する。未検出と表示吸収を混同しない。
3. 成果物は名前ではなく元ID/環境/記録済み入力を照合する。図の欠けを推移的な接続で埋めない。
