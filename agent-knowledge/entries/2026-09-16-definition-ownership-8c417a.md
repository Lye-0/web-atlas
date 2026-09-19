---
id: rm-20260916-definition-ownership
topic: analyzer-architecture
type: constraint
status: active
maturity: candidate
created: 2026-09-16
last_verified: 2026-09-16
source_commit: "3215aa4ec77f5cbb83083811ebd1a4e821ae6b2f"
related_files:
  - src/analyzer/semantic/architecturePositioning.ts
  - src/analyzer/semantic/client.ts
  - src/components/analyzer/architectureContextPolish.test.tsx
  - docs/technical/architecture-map.md
tags:
  - ownership
  - manifest
  - workspace
  - positioning
supersedes: null
promoted_to: null
---

# 定義の所属と用途を分離し、workspace所属は関係の根拠で確認する

## Conclusion

Architectureの説明属性を伝播するとき、npm packageだけを所有者候補にすると、深い独立Swift/.NET定義へ直下npmの位置づけが漏れる。言語別manifestの独立定義を尊重し、明示的parent/logicalOwnerを優先する。パス包含は独立定義を越える根拠にしない。

workspace-package factは一般のパッケージ検出からも作られる。その存在だけでworkspace設定に所属すると説明しない。workspace-patternからのmatches関係とEvidenceがある場合に所属根拠を表示する。workspace所属も主要/補助用途の判定とは別。

## Scope

タブ10のcompositionRole/definitionLocation等の説明属性。検出した元ID、種類、所属、Evidence、補助コードフィルターを変更する規則ではない。深さ・フォルダー名から補助用途を推定しない。

## Evidence

- 独立manifestの改名・深さ変更サンプルで、直下npm説明を継承せず、配下componentが正しい独立定義を引き継ぐことを確認した。
- 実Swift定義と既存npm入力を併せて読み取り専用で解析し、詳細の定義パス・位置・用途をChromeで確認した。
- vehicle-managementのapps/apiにはpnpm-workspace.yamlのmatches Evidenceからworkspace所属の説明が出る。
- 検証条件はdocs/technical/tab10-headings-peer-summary-review-20260916.md参照。

## Verification

1. architectureContextPolish.test.tsxとclient.test.tsを実行する。
2. 新しい言語manifestを追加した場合、独立定義のID namespaceとparent/logicalOwnerの関係を照合する。
3. workspace-packageだけの入力と、workspace-patternのmatches Evidenceを持つ入力を区別する。
