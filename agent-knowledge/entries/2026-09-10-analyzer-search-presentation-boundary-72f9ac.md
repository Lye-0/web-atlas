---
id: rm-20260910-analyzer-search-presentation-boundary
topic: analyzer-interaction
type: failure
status: active
maturity: candidate
created: 2026-09-10
last_verified: 2026-09-10
source_commit: "bf7c4392d67d1b727967d8d43623b46db9a34e7e"
related_files:
  - src/pages/AnalyzerPage.tsx
  - src/pages/AnalyzerPage.test.tsx
  - src/components/analyzer/AnalyzerGraphStage.tsx
  - src/analyzer/presentation.ts
  - src/analyzer/search.ts
  - docs/technical/analyzer.md
  - docs/technical/analyzer-common-ui-review.md
tags:
  - search
  - selection
  - camera
  - presentation
supersedes: null
promoted_to: null
---

# 検索入力を表示展開の入力へ戻さない

## Conclusion

Views 1–4の`presentAnalyzerView`はqueryから祖先や表示グループを展開できる。検索結果欄を共通部品に替えるだけでは、キー入力のたびにlayoutとroutingが変わる問題は残る。さらに1件一致の自動選択effectがあると、明示的に解除しても同じ対象が復活する。

入力queryは論理対象の候補と一致表示だけに使う。Aのページ・stageのpresentationには空queryを渡し、明示選択だけが既存の選択contextを通じて必要な範囲を開く。検索消去、詳細閉鎖、カメラResetから選択・検索・展開を暗黙に初期化しない。検索indexは名前・別名・コマンド・所属・パスに限定し、metadata全体や内部IDを投入しない。

## Scope

Applicable:

- Aの検索UI、検索候補の並べ替え、ブロック展開、カメラ・選択連携を変更するとき。
- 全候補を保持するSearchResultStripと明示フィルターの接続。

Do not apply:

- Bの固定Module layoutをAへ移植すること、AにCのExplorer階層移動を追加すること。
- 明示的な検索結果選択や「選択へ移動」に必要な展開・カメラ移動まで禁止すること。

## Evidence

- 修正前はAに`.slice(0, 8)`と1件一致の自動選択があり、同じqueryをpresentationにも渡していた。
- `AnalyzerPage.test.tsx`の4つのAケースは、8件超の論理候補、Endによる末尾選択、入力中のgeometry保持、検索Escape、Reset、詳細閉鎖、選択解除を実ページとSessionで確認する。
- 52ファイルの独立サンプル、git-lines、vehicle-managementのブラウザ検証でquery入力前後のNode配置・SVG経路が一致し、明示選択後のコード操作と空白解除が独立することを確認した。
- 記録元HEADに対する未コミット実装で確認。性能と適用範囲は`analyzer-common-ui-review.md`に記録する。

## Verification

1. queryからpresentation、camera、selectへ至るeffectとcallbackを確認する。
2. `pnpm exec vitest run src/pages/AnalyzerPage.test.tsx src/analyzer/search.test.ts src/components/analyzer/SearchResultStrip.test.tsx`を実行する。
3. 実画面で0件・1件・多数一致を入力し、NodeのstyleとEdgeのdが不変であることを確認する。末尾候補の選択・消去・空白解除も確認する。
