---
id: rm-20260829-dictionary-presentation-contract
topic: dictionary
type: decision
status: active
maturity: candidate
created: 2026-08-29
last_verified: 2026-08-30
source_commit: daffdb4
related_files:
  - src/components/map/StackMap.tsx
  - src/components/categories/CategoryTable.tsx
  - src/components/stacks/StackTable.tsx
  - src/components/categories/CategoryDetail.tsx
  - src/components/stacks/StackDetail.tsx
  - src/components/search/DictionarySearch.tsx
  - src/utils/categoryHierarchy.ts
  - src/data/dictionaryGroups.ts
  - src/utils/stackStatus.ts
  - docs/technical/dictionary.md
tags:
  - dictionary
  - presentation
  - map
  - categories
  - stacks
  - analyzer
  - accessibility
supersedes: null
promoted_to: null
---

# DictionaryのPresentation Contract

## Conclusion

Phase 1.3のDictionary UIは、Phase 1.2の役割分担と5大visual groupを維持しながら、Mapを5列均等配置から中央幹＋左右2レーンのTreeへ進める。左レーンは「UIとアプリケーション」「品質と検証」、右レーンは「言語と実行基盤」「データとストレージ」「開発と配信」とし、`dictionaryVisualGroups`の`side` / `order`を配置メタデータとして共有する。Mapは説明を読む画面ではなく、RootからCategory・Stackへ続く構造を俯瞰する。Categoriesは同じ5大グループの親子階層から分類概念と比較へ進む索引、Stacksは共通グループのfilterと名称・Category・概要から個別技術の詳細へ進む索引とする。Mapの通常ノードではsummaryを表示せず、一覧ではstable IDとactive statusを主役にしない。

Analyzer接続用の`categoryId`、`packageNames`、`aliases`、`relatedStackIds`、`relationships`は正規データから削除しない。Stack詳細の「開発者向けメタデータ」に折りたたみ、relationship kindは日本語ラベルでsource / relation / targetとして表示する。利用者向けの文章は正規Dictionaryデータに自然な日本語で直接保持し、表示時の大量文字列置換には依存しない。stable ID、routing、Deep Link、検索対象の正規データ契約は維持する。内部Dictionaryリンクは`→`、一覧内のDetail導線と公式サイトなど外部リンクは`↗`で区別する。

Categoriesは「分類の意味・役割・違いを読む」画面として、5大visual groupをmarkerlessで強いGroup Headingにする。Parent Categoryはsquare marker付きのstrong row / block、Child Categoryはindent付きのnested rowとし、summaryは重要情報として読みやすいsecondary textで表示する。Desktopは意味のある2column、`max-width: 820px`以下は1columnでCategory name + arrow / summaryの2段構成とする。Categories一覧のCategory Detail rowは親子を問わず`↗`を使い、Parent / Childは共通row構造のままTree線・indent・Typographyで階層差を示す。Mapは構造を見る画面、Categoriesは分類の意味・違いを読む画面という役割分担を維持する。

Stacksは「多数の技術を高速に走査し、詳細へ進む」画面として、5大visual groupのSection Heading、Stack名、近接したCategory label、Summary、`↗`を表示する。Stack rowは全体をStack Detailへの単一focusable linkとし、Category labelはnested interactive elementを避けるため非リンク表示にする。Desktopは`Stack名 + Category label | Summary | ↗`の3領域、`max-width: 820px`以下はStack名 + `↗` / Category / Summaryの3段とし、Stack名を最も強く、Summaryを読みやすいsecondary text、Stack row dividerをGroup boundaryより弱く表示する。Filterはlabel・select・件数を一つのcontrol areaとしてまとめ、`active` statusは隠し、例外statusだけを表示する。

Category Detailは既存のDocument構造を維持し、Desktopでは読み幅を保ったMain Contentと近接したSidebarを同じGrid内に配置する。H1とSection間隔を少し落ち着かせ、Section label・Sidebar heading・比較labelのコントラストを補正する。`具体的な技術`、`下位分類`、`関連する分類`のDetail導線はrow全体をfocusableなlinkとして`↗`を表示し、戻るlinkは`←`を維持する。Mobile / Narrowでは「このページ」のTOCを非表示にし、「関連する分類」を本文後の通常Sectionとして全幅row・tap area・divider付きで表示する。Breadcrumb直下の重複する種別eyebrowはCategory / Stack Detailの両方から除去するが、本文・metadata・relationship構造は変更しない。

Stack DetailはCategory Detailと同じDictionary DetailのMain + Sidebar、読み幅、column gap、Section spacing、small label、divider、TOC、visible focusのルールを共有する。Stack固有のCategory / Related Stack / Relationship targetへの内部Detail導線は`↗`、戻るlinkは`←`、公式サイトの外部導線も`↗`とする。少数のFeatureは1列、多数（4件以上）はDesktop 2列、Narrowは1列とし、RelationshipはSource / Relation / Targetを一つのrow groupにまとめ、幅不足時だけwrapする。Mobile / NarrowではTOCと空のasideを非表示にし、本文を上から下へ読む。Developer / Analyzer metadata、Summary / Description、bullet、canonical relationship dataは維持する。

## Scope

Applicable:
- Phase 1 DictionaryのMap、Categories、Stacks、詳細、検索の表示設計
- Map・Categories・Stacks filterで共有する5大visual groupの表示設計
- Mapの中央幹・左右2レーン、幅不足時の1列Vertical Tree、内部 / 外部リンク矢印の表示設計
- Categoriesの5大visual group見出し、parent / child階層、summary、Desktop 2column、Narrow 2段rowの表示設計
- Stacksの5大visual group見出し、Stack row、Category label、Summary、Stack Detail arrow、Desktop 3領域、Narrow 3段row、filter controlの表示設計
- Category DetailのDocument本文、Desktop Main + Sidebar、Mobile TOC / Related Categories、Detail link arrowの表示設計
- Stack Detailの共通Dictionary Detail、長いH1、Feature件数別layout、Relationship group、Related Stack row、Mobile TOC非表示の表示設計
- Desktop / Mobileの情報密度、階層表現、visible focus、reduced motion

Do not apply:
- `src/data/categories.ts`、`src/data/stacks.ts`、`src/data/map.ts`のIDやAnalyzer metadataをUI都合で削除・変更すること
- Three.js、React Flow、backend、DB、Auth、Analyzer本体の追加
- Cloudflare Workers Static Assetsの公開契約や既存routeを変更すること

## Evidence

- `src/components/map/StackMap.tsx` の表示専用visual groupとsummary非表示のMap node
- `src/data/dictionaryGroups.ts` のpresentation groupingとroot Category検証
- `src/data/dictionaryGroups.ts` の`side` / `order`配置メタデータと重複検証
- `src/components/categories/CategoryTable.tsx` と `src/utils/categoryHierarchy.ts` の親子階層一覧
- `src/components/stacks/StackTable.tsx` の大分類filter、5大group表示、Stack row全体のDetail link、Category label、`↗`、active status条件表示（`a4abe66`）
- `src/components/stacks/StackDetail.tsx` の日本語relationship、公式サイト、折りたたみmetadata、共通Detail layout・`↗`導線・Feature / Relationship表示（`daffdb4`）
- `src/components/categories/CategoryDetail.tsx` と `src/components/stacks/StackDetail.tsx` のDetail本文構造、row全体link、`↗` / `←`導線、重複種別eyebrow整理（`440c8a1`）
- `src/styles.css` のCategory Detail専用Main / Sidebar、H1 / section spacing、sidebar contrast、mobile TOC非表示・Related Categories通常Section、内部link hover / focus調整（`440c8a1`）
- `src/components/search/DictionarySearch.tsx` の日本語placeholder、結果表示、Ctrl / Cmd + K focus
- `docs/technical/dictionary.md` のPhase 1.1 / 1.2 Presentation Contract
- `docs/technical/dictionary.md` のCategory Detail Presentation Contract（`440c8a1`）
- `docs/technical/dictionary.md` のStack Detail Presentation Contract（`daffdb4`）
- `src/styles.css` のCategory / Stack共通Detail layout、Sidebar、section spacing、Stack Feature / Relationship / Mobile調整（`daffdb4`）
- `src/components/categories/CategoryTable.tsx` と `src/styles.css` のCategories専用arrow・共通row・階層・divider・connector・Responsive調整（`0d6b53d`）
- `pnpm build`、`pnpm lint`、`pnpm typecheck`、`pnpm test` の成功（9 tests）
- `pnpm install --frozen-lockfile` と `pnpm exec wrangler deploy --dry-run` の成功
- `agent-browser`で`/dictionary/categories`を1600 / 1440 / 1280 / 1100 / 1024 / 900 / 820 / 768 / 390pxで確認し、900px以上の2column、820px以下の1column・2段row、横overflowなしを確認
- `agent-browser`でParent / Child rowを確認し、Wideのarrow X位置一致、`↗` 43件統一、Child indent、Sibling gap、最終Childの縦線停止を確認
- `agent-browser`でMap、Categories、Stacks、Category / Stack詳細、404、Search、390px viewport、Browser back / forwardを確認し、横スクロールとARIA violationがないことを確認
- `agent-browser`でMapを1600 / 1440 / 1280 / 1200 / 1100 / 1024 / 900 / 820 / 768 / 390pxで確認し、1100px以下の1列化、長い名称の折り返し、横overflowなしを確認
- `agent-browser`で`/dictionary/stacks`を1600 / 1440 / 1280 / 1024pxのDesktop 3領域、820 / 768 / 390pxのNarrow 3段として確認し、各幅で48行・48 row link・48 arrow、横overflowなし、Desktopのarrow X位置一致を確認
- `agent-browser`でStacksのUI filterを選択し、`application`が17件・Group Headingなしへ切り替わること、HTML row全体のDetail遷移とBrowser back / forwardを確認
- `agent-browser`でStacks、React Detail、HTML Detail、Map、Categoriesを1024pxで確認し、横overflowと画面エラーがないことを確認。Stacksのa11y violationは0件（既存の背景gradientに関するcontrast判定はincomplete）
- `pnpm install --frozen-lockfile`、`pnpm build`、`pnpm lint`、`pnpm typecheck`、`pnpm test`（3 files / 9 tests）、`pnpm exec wrangler deploy --dry-run`の成功（`a4abe66`）
- `agent-browser`でCategory Detailのmarkup-language / framework / library / databaseを1600pxと390pxで確認し、DesktopのMain + Sidebar近接、MobileのTOC非表示・Related Categories通常Section、row全体link、`↗`、横overflowなしを確認
- `agent-browser`でCategory Detailを1600 / 1440 / 1280 / 1100 / 1024 / 900 / 820 / 768 / 390pxで確認し、900px以上の2column、820px以下の1column、全幅のRelated Categories行、横overflowなしを確認
- `agent-browser`でCategory Detailのrow全体遷移とBrowser back / forward、row focus outlineを確認。Category Detailのa11y violationは0件（既存の背景gradientに関するcontrast判定はincomplete）
- `pnpm install --frozen-lockfile`、`pnpm build`、`pnpm lint`、`pnpm typecheck`、`pnpm test`（3 files / 9 tests）、`pnpm exec wrangler deploy --dry-run`の成功（`440c8a1`）
- `agent-browser`でStack Detailのhtml / react / react-three-fiber / cloudflare-workers / firebase-authentication / firebase-storageを1600 / 1440 / 1280 / 1024 / 820 / 768 / 390pxで確認し、DesktopのMain + Sidebar近接、Feature 1 / 2列、Narrow 1列、TOC非表示、長いH1、Relationshipのwrap、Related Stackの`↗`、横overflowなしを確認
- `agent-browser`でStack DetailのRelated Stack row全体遷移とBrowser back / forward、row / Relationship targetのfocus outlineを確認。Stack Detailのa11y violationは0件（既存の背景gradientに関するcontrast判定はincomplete）
- `pnpm install --frozen-lockfile`、`pnpm build`、`pnpm lint`、`pnpm typecheck`、`pnpm test`（3 files / 9 tests）、`pnpm exec wrangler deploy --dry-run`の成功（`daffdb4`）

## Verification

1. `pnpm build`、`pnpm lint`、`pnpm typecheck`、`pnpm test`を実行する。
2. `/dictionary/map`でsummaryが通常表示されず、全Category / StackがID参照で表示されることを確認する。
3. `/dictionary/categories`で5大Group Heading、parent / child共通row、`↗` arrow、summary、Desktop 2column、`max-width: 820px`以下の1column・2段rowを確認し、`/dictionary/stacks`では5大group heading、Stack名・Category label・Summary・`↗`、Desktop 3領域、`max-width: 820px`以下の3段row、filter、active status非表示を確認する。
4. `/dictionary/categories/:categoryId`でDocument本文、Desktop Main + Sidebar、`具体的な技術` / `下位分類` / `関連する分類`の`↗`、Mobile TOC非表示・Related Categories通常Sectionを確認し、`/dictionary/stacks/:stackId`では共通Main + Sidebar、Feature件数別layout、relationshipのsource / relation / target、Related Stackの`↗`、公式サイト、metadata折りたたみを確認する。
5. Search、Deep Link、Not Found、Browser back / forward、390px前後の横幅を再確認する。
6. Mapは1600px以上の左右2レーンと、1100px以下の1列Vertical Treeを確認する。通常の内部リンクが`→`、Categories一覧のCategory Detail rowと外部リンクが`↗`であることも確認する。
