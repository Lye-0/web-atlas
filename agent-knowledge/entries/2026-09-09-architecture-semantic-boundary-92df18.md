---
id: rm-20260909-architecture-semantic-boundary
topic: analyzer-architecture
type: decision
status: active
maturity: candidate
created: 2026-09-09
last_verified: 2026-09-10
source_commit: "4f28a339cbeac0adbc24bd3c72d6156dd33efa81"
related_files:
  - src/analyzer/semantic/architecture.ts
  - src/analyzer/semantic/architectureProjection.ts
  - src/analyzer/semantic/architecture.test.ts
  - src/pages/FlowAnalyzerPage.tsx
  - docs/technical/architecture-map.md
  - docs/technical/architecture-map-review.md
  - src/analyzer/semantic/architectureFocus.test.ts
  - docs/technical/architecture-focus-review.md
  - src/components/analyzer/architectureSummary.test.tsx
  - docs/technical/architecture-readability-review.md
tags:
  - architecture
  - semantic-aggregation
  - projection
  - evidence
supersedes: null
promoted_to: null
---

# Architectureの意味階層と表示密度を別々に扱う

## Conclusion

タブ10はCの操作基盤を使うが、2Dは各構成階層の関係を選択前から表示する構成図。3Dも同じArchitecture要素を点にし、元の全関数・全値へ戻さない。自動省略OFFはArchitecture要素を全表示する指定であり、意味集約を解除する指定ではない。

実行単位の境界はmanifest・具体的な入口・設定から確定する。manifestだけなら利用未確認のコードパッケージとし、共有コードにはライブラリ契約と参照または境界をまたぐソース参照を求める。構成関係の集約は端点・種類・confidence・環境ごとに元edge/Evidenceの集合を保存し、隣り合う要約関係から推移的な実行経路を生成しない。

3Dは現在の直下を詳細に、外側の主要ルートを概要に投影する。外側を選択しても現在地を変えず、明示的に開いた場合だけ移動する。親だけに根拠のある境界関係を子へ接続しない。折り畳みによる内部関係の要約と、現在粒度で根拠のある実際の自己関係は別扱いとする。周辺構成OFFでも直接関係先と保護した選択を残し、自動省略OFFと意味を混同しない。

ラベルの内部／接続先／周辺も現在地が所有する。選択した外側の関係は追加描画されるため、その全描画線から「直接の相手」を求めると、無関係だった外側同士まで分類が変わる。現在の直下に接する関係と境界関係だけで基礎分類し、選択・hover／focus・明示関係の読みやすさは別の一時状態にする。

## Scope

タブ10の構成モデルとC共通操作への接続に適用。Aの全面更新はこの作業の対象外であり、A/Bを同じrendererへ変える根拠ではない。実装・検証はユーザー指定により単独実行したが、恒久的なサブエージェント禁止規則ではない。

## Evidence

- 記録時HEADに対する変更を検証。T01–15と補足22テストで誤ったアプリ境界・DB生成・動的接続・集約の負例を確認。
- Git LinesでExtension Host/Webview、vehicle-managementでWeb/Worker/WPF/共有コード、Web Atlasで静的Webを独立期待値に照合。
- 40要素fixtureでON/OFF後のArchitecture ID・位置・カメラを保持し、内訳閲覧と明示選択を分離。受け入れ表は技術レビューに記載。
- 上記source_commitに対する未コミット変更でF1–F7/T01–T16を再照合した。新しい混合粒度、未特定要求の表示集合、同一IDの設定出現箇所、宣言技術と主体別使用はarchitecture-focus-review.mdを参照。HEAD単独が今回の変更を含むとは限らない。

## Verification

1. `pnpm exec vitest run src/analyzer/semantic/architecture.test.ts src/pages/SemanticAnalyzerPage.test.tsx`。
2. 2D root→内部→3D→OFFを操作し、元memberの大量再表示やIDの付け替えがないことを確認。
3. 環境・関係種別・confidence別の集約とprovenanceを照合し、集約件数を全ファイル数と混同しない。
4. `architectureSummary.test.tsx`の独立fixtureで、外側Cの選択がC→Dを追加描画してもC/Dの周辺区分を変えず、座標と正規モデルを保持することを確認。実入力の選択・解除・別対象・モード往復で一時強調が残らないことも確認する。
