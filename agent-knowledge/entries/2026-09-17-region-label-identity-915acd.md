---
id: rm-20260917-region-label-identity
topic: analyzer-architecture
type: constraint
status: active
maturity: candidate
created: 2026-09-17
last_verified: 2026-09-17
source_commit: "2caeede8fc92a159630b519a6d40c625b5d8f350"
related_files:
  - src/analyzer/semantic/flowRegions.ts
  - src/components/analyzer/SemanticFlow3D.tsx
  - src/components/analyzer/semanticFlowLabels.ts
  - src/components/analyzer/architectureContextPolish.test.tsx
tags:
  - regions
  - labels
  - identity
  - projection
supersedes: null
promoted_to: null
---

# 囲い生成とDOMラベルの所属索引で同じ領域IDを使う

## Conclusion

タブ10の統合図では、ノードに明示flowEnvironmentがある場合、その環境IDが囲いのキーになる。3DのDOMラベルを許可するregionNodes索引も、同じsemanticFlowRegionIdentityを使う。explorerがあるだけで所属IDへ置換すると、衝突回避がラベルを生成していてもDOMのfilterで全名称が消える。

## Scope

環境とexplorerの両方を持つ意味構成図。元ノードの所属・環境・IDを変更する規則ではなく、描画索引の整合条件。非Architectureの従来のdirectory/group判定は維持する。

## Evidence

vehicle-managementの3Dで囲いONでも名称が0件だった。semanticFlowRegionsはflowEnvironmentを優先し、regionNodesは常にexplorerRegionIdentityを使っていた。共通関数への統一後に直接名称が出ることを確認。git-linesの回転後も同一ラベルIDが新しい境界投影へ追従し、OFF→ONで消去/再表示できた。

## Verification

1. architectureContextPolish.test.tsxのexplorer併用時のID一致を実行する。
2. semanticFlowLabels.test.tsのArchitecture境界投影・回転・regions消去テストを実行する。
3. 実ブラウザでprojected labelの有無とDOM許可索引を別々に確認する。空表示の原因を衝突回避だけに決めつけない。

検証条件はdocs/technical/tab10-direct-headings-review-20260917.mdを参照。
