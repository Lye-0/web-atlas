---
id: rm-20260917-definition-preset-boundary
topic: analyzer-architecture
type: constraint
status: active
maturity: candidate
created: 2026-09-17
last_verified: 2026-09-17
source_commit: "7ce445b"
related_files:
  - src/analyzer/semantic/architectureContent.ts
  - src/analyzer/semantic/architectureContext.ts
  - src/analyzer/semantic/architectureContent.test.ts
  - docs/technical/architecture-map.md
tags:
  - preset
  - definition
  - environment
supersedes: null
promoted_to: null
---

# 囲いの論理定義区分を論理アプリプリセットの全探索起点にしない

## Conclusion

architectureEnvironmentContextのdefinitionはcode-definition断片も含む描画区分。論理アプリと実行構成を読むプリセットの中心とは一致しない。論理単位を種にし、実在するdefinition/serves対応と必要最小限の同じ所有IDのコード/configuresを残す。コードや実行構成からツール・成果物・DB・要求へ一般探索しない。全体図の分類は変更しない。

## Scope

タブ10の論理定義プリセット。通常の環境別・4経路別・全体表示の関係を削る根拠ではない。

## Evidence

7ce445b上の修正を3固定入力で照合。論理定義はvehicle143/336→36/9、git-lines33/10→25/2、web-atlas17/13→11/7（投影前対象/関係）。他の全候補は対象/関係IDが一致し、正規モデルJSON不変。

## Verification

architectureContent.test.tsの論理単位・複数実行構成・未解決アプリ・同じ端点の別用途関係の正例/負例を実行する。実入力の母集団と条件はtab10-preset-polish-review-20260917.mdを参照。
