# Web Atlas — Phase 1 Dictionary 完成実装プロンプト

## 1. 目的

`web-atlas` リポジトリに、**Web Atlas Phase 1 = Dictionary 部分**を、実用上「完成」と呼べる状態まで実装してください。

Web Atlas は、Web 開発周辺の技術を「分類」「具体的な技術」「相互関係」の3方向から理解できる、黒基調の技術辞書 Web アプリです。

Phase 1 では **Dictionary の完成だけに集中**します。

将来 Phase 2 以降で `Analyzer` を追加し、ユーザー自身のプロジェクトから検出した技術・依存関係・コマンド・構造などを Dictionary の各項目へ接続する予定です。

そのため Phase 1 の時点で、Dictionary の表示だけでなく、**安定した ID、URL、分類 ID、package 名、alias、関連技術 ID など、Analyzer から参照できるデータ設計**を必ず用意してください。

---

# 2. プロジェクト基本情報

## プロジェクト名

**Web Atlas**

## リポジトリ / ルートディレクトリ名

```text
web-atlas
```

## アプリ形態

**Web アプリ**

ローカルネイティブアプリにはしません。

## 使用技術

基本構成は以下です。

```text
Node.js
pnpm
TypeScript
React
Vite
Tailwind CSS
```

必要な追加パッケージは、目的が明確な場合のみ導入してください。

### 今回使わないもの

Phase 1 では以下を導入しないでください。

```text
Three.js
React Three Fiber
vGPU
WebGPUを使った独自3D表現
Electron
Tauri
ローカルCompanion
バックエンドAPI
データベース
認証
```

特に Stack Map は、3D 表現ではなく **DOM / CSS / SVG を中心とした 2D 表現**にしてください。

---

# 3. Phase 1 の完成形

Dictionary は大きく3つの画面 / タブで構成します。

```text
Web Atlas
└─ Dictionary
   ├─ A：Stack Map
   ├─ B：Categories
   └─ C：Stacks
```

将来は以下のように拡張する予定ですが、Analyzer は今回実装しません。

```text
Web Atlas
├─ Dictionary
│  ├─ Map
│  ├─ Categories
│  └─ Stacks
│
└─ Analyzer        ← Phase 2以降
```

Phase 1 では、将来この2つを同一プロダクト内で自然に接続できる構造にしてください。

---

# 4. 最重要設計原則

## 4.1 A / B / C を別々にハードコードしない

Dictionary の情報は **単一の正規データソース**から生成してください。

禁止例:

```text
Map用データ
Categories用データ
Stacks用データ
```

に同じ名称・説明・分類関係を重複して直接記述すること。

推奨:

```text
src/
├─ data/
│  ├─ categories.ts
│  ├─ stacks.ts
│  └─ map.ts または relationships.ts
│
├─ types/
│  └─ dictionary.ts
│
└─ ...
```

ただし `map.ts` は、カテゴリーやスタックの情報そのものをコピーするのではなく、**表示順・グループ構造・関係性など Map 固有のメタデータだけ**を持つ設計にしてください。

---

## 4.2 安定した ID を持たせる

すべてのカテゴリー、スタックには URL や Analyzer から永続的に参照できる ID を持たせてください。

例:

```ts
id: "build-tool"
id: "vite"
id: "react"
id: "fullstack-web-framework"
```

表示名を変更しても ID は簡単に変更しない前提です。

---

## 4.3 Analyzer 接続用メタデータを最初から持たせる

具体的な Stack データには最低限以下を持たせてください。

```ts
type StackEntry = {
  id: string;
  name: string;
  categoryId: string;

  summary: string;
  description: string;

  features?: string[];
  useCases?: string[];
  relationships?: StackRelationship[];

  relatedStackIds?: string[];

  packageNames?: string[];
  aliases?: string[];

  officialUrl?: string;

  status?: "active" | "legacy" | "experimental" | "deprecated";
};
```

必要なら型名やフィールド構成は改善して構いません。

特に以下は将来の Analyzer のために重要です。

```text
id
categoryId
packageNames
aliases
relatedStackIds
```

例:

```ts
{
  id: "vite",
  name: "Vite",
  categoryId: "build-tool",
  packageNames: ["vite"],
  aliases: ["Vite"],
}
```

```ts
{
  id: "nextjs",
  name: "Next.js",
  categoryId: "fullstack-web-framework",
  packageNames: ["next"],
  aliases: ["Next", "NextJS", "Next.js"],
}
```

将来 Analyzer では、

```text
package.json
  ↓
"vite"
  ↓
packageNamesに一致
  ↓
stack id = vite
  ↓
/dictionary/stacks/vite
```

という接続を行えるようにします。

---

# 5. URL / Routing 設計

Dictionary は URL から直接開けるようにしてください。

最低限以下を実現します。

```text
/
├─ /dictionary
├─ /dictionary/map
├─ /dictionary/categories
│  └─ /dictionary/categories/:categoryId
└─ /dictionary/stacks
   └─ /dictionary/stacks/:stackId
```

例:

```text
/dictionary/categories/framework
/dictionary/categories/runtime
/dictionary/categories/build-tool

/dictionary/stacks/react
/dictionary/stacks/nextjs
/dictionary/stacks/vite
```

`/` を開いた場合は Dictionary の自然な初期画面へ遷移または表示してください。

推奨初期画面:

```text
/dictionary/map
```

あるいは `/dictionary` 内で Map を初期表示しても構いません。

ただし URL を見たときに状態が分かり、ブラウザの戻る / 進むが正しく動く構成にしてください。

### Router

現在の React エコシステムで一般的かつ保守しやすいブラウザ Router を使用してください。

既存プロジェクトに Router がある場合はそれを尊重し、不要な二重導入をしないでください。

---

# 6. Dictionary 全体 UI

## 6.1 デザインコンセプト

**黒ベースの、静かで高級感のある Developer Reference / Technical Dictionary**

派手なゲーミング UI にはしないでください。

目標イメージ:

```text
near-black background
dark elevated surfaces
subtle borders
white / light-gray primary text
muted secondary text
restrained accent colors
clear information hierarchy
technical / precise / calm
```

### 避ける表現

```text
過剰なネオン
常時強いglow
虹色gradient
過剰なglassmorphism
意味のないanimation
大量のdrop shadow
3D演出
```

---

## 6.2 レイアウト

全画面共通で、以下を検討してください。

```text
Header
├─ Web Atlas ロゴ / タイトル
├─ Dictionary ナビゲーション
│  ├─ Map
│  ├─ Categories
│  └─ Stacks
└─ Search
```

Analyzer は今回実装しませんが、将来 Header に

```text
Dictionary | Analyzer
```

という上位ナビゲーションを追加しやすい構造にしてください。

現時点で無効な Analyzer タブを表示する必要はありません。

---

# 7. A — Stack Map

## 7.1 目的

Web 開発周辺スタックの全体像を、分類階層と具体的な技術の関係が一目で分かる形で表示します。

ASCII Tree をそのまま表示するのではなく、**視覚的な Node / Tree UI** にしてください。

---

## 7.2 基本データ構造

Map で表現する内容は以下です。

```text
Web開発周辺スタック
│
├─ 言語
│  ├─ マークアップ言語
│  │  └─ HTML
│  ├─ スタイルシート言語
│  │  └─ CSS
│  └─ プログラミング言語
│     ├─ JavaScript
│     └─ TypeScript
│
├─ ランタイム
│  └─ Node.js
│
├─ パッケージマネージャ
│  ├─ npm
│  └─ pnpm
│
├─ フレームワーク
│  ├─ フルスタックWebフレームワーク
│  │  └─ Next.js
│  ├─ Web / APIフレームワーク
│  │  └─ Hono
│  ├─ CSSフレームワーク
│  │  └─ Tailwind CSS
│  └─ 認証フレームワーク
│     └─ Better Auth
│
├─ ライブラリ
│  ├─ UIライブラリ
│  │  └─ React
│  ├─ Reactレンダラー
│  │  ├─ React DOM
│  │  └─ React Three Fiber
│  ├─ 3Dグラフィックスライブラリ
│  │  └─ Three.js
│  ├─ 状態管理ライブラリ
│  │  └─ Zustand
│  ├─ サーバー状態管理ライブラリ
│  │  └─ TanStack Query
│  ├─ スキーマバリデーションライブラリ
│  │  └─ Zod
│  ├─ ORM
│  │  ├─ Drizzle ORM
│  │  └─ Prisma ORM
│  └─ 認証ライブラリ
│     └─ Auth.js
│
├─ UIコンポーネントシステム
│  └─ shadcn/ui
│
├─ ビルドツール
│  └─ Vite
│
├─ データベース
│  ├─ リレーショナルデータベース（RDB）
│  │  ├─ PostgreSQL
│  │  ├─ MySQL
│  │  ├─ SQLite
│  │  └─ Cloudflare D1
│  ├─ ドキュメントデータベース
│  │  └─ MongoDB
│  └─ オブジェクトデータベース（OODBMS）
│     ├─ ObjectDB
│     └─ ObjectBox
│
├─ ストレージ
│  └─ オブジェクトストレージ
│     ├─ Amazon S3
│     ├─ Cloudflare R2
│     ├─ Backblaze B2
│     ├─ Google Cloud Storage
│     └─ Cloud Storage for Firebase
│
├─ 認証サービス
│  └─ Firebase Authentication
│
├─ テスト
│  ├─ テストフレームワーク
│  │  └─ Vitest
│  └─ E2Eテストフレームワーク
│     └─ Playwright Test
│
├─ コード品質
│  ├─ リンター
│  │  └─ ESLint
│  ├─ フォーマッター
│  │  └─ Prettier
│  └─ 統合ツールチェーン
│     └─ Biome
│
├─ バージョン管理
│  └─ Git
│
├─ 開発プラットフォーム
│  └─ GitHub
│
├─ CI/CD
│  └─ GitHub Actions
│
├─ コンテナ
│  └─ Docker
│
└─ デプロイ基盤
   ├─ アプリケーションプラットフォーム
   │  └─ Vercel
   ├─ サーバーレス実行基盤
   │  └─ Cloudflare Workers
   └─ Webホスティング
      └─ Cloudflare Pages
```

---

## 7.3 Map の UI 要件

Map は「情報構造の把握」が主目的です。

### 必須

- 親子関係が線で分かる
- カテゴリーと具体的 Stack を視覚的に区別する
- Node の hover 状態がある
- keyboard focus がある
- クリック可能であることが分かる
- Category Node を押すと B の対応 Category へ移動
- Stack Node を押すと C の対応 Stack へ移動
- 見た目より可読性を優先
- PC で全体を俯瞰しやすい
- スマートフォンでも文字が潰れない

### 推奨

カテゴリーごとに、非常に控えめな accent を使っても構いません。

ただし色だけに意味を依存させないでください。

### モバイル

Map 全体を無理に極小縮小しないでください。

必要なら、

- 縦方向中心のレイアウト
- セクション単位の折りたたみ
- 横スクロール
- responsive tree

などを使って可読性を維持してください。

---

# 8. B — Categories

## 8.1 目的

「フレームワークとは何か」「ライブラリとは何か」「ランタイムとは何か」のように、**技術そのものではなく分類概念を理解する辞書**です。

B は Web Atlas の中でも特に「違いが分からない」を解消する場所にしてください。

---

## 8.2 上部：Category 一覧

Categories 画面上部に、全カテゴリーを一覧できる表または一覧 UI を置いてください。

最低限:

```text
Category
概要
主な役割
```

必要ならレスポンシブ時はカード形式に変えて構いません。

Category 名をクリックすると同じページ内の詳細、または `/dictionary/categories/:categoryId` へ移動します。

---

## 8.3 Category 詳細

各 Category には最低限以下を用意してください。

```text
名称
短い概要
詳しい説明
主な役割
どのような場面で使われるか
他の分類との違い
具体的な Stack
関連 Category
```

「他の分類との違い」は特に重要です。

例:

```text
Framework vs Library
Runtime vs Framework
Database vs Object Storage
Authentication Framework vs Authentication Library vs Authentication Service
RDB vs Document Database vs Object Database
Linter vs Formatter
Git vs GitHub
Hosting vs Serverless Runtime vs Application Platform
```

この比較説明は、表面的な一文だけではなく、初心者が混同しなくなる程度まで具体的に書いてください。

---

## 8.4 Category 一覧

以下の分類を Dictionary に含めてください。

```text
マークアップ言語
スタイルシート言語
プログラミング言語

ランタイム
パッケージマネージャ

フレームワーク
フルスタックWebフレームワーク
Web / APIフレームワーク
CSSフレームワーク
認証フレームワーク

ライブラリ
UIライブラリ
Reactレンダラー
3Dグラフィックスライブラリ
状態管理ライブラリ
サーバー状態管理ライブラリ
スキーマバリデーションライブラリ
ORM
認証ライブラリ

UIコンポーネントシステム
ビルドツール

データベース
リレーショナルデータベース（RDB）
ドキュメントデータベース
オブジェクトデータベース（OODBMS）

ストレージ
オブジェクトストレージ

認証サービス

テスト
テストフレームワーク
E2Eテストフレームワーク

コード品質
リンター
フォーマッター
統合ツールチェーン

バージョン管理
開発プラットフォーム
CI/CD
コンテナ

デプロイ基盤
アプリケーションプラットフォーム
サーバーレス実行基盤
Webホスティング
```

必要に応じて上位 Category と下位 Category の親子関係をデータで表現してください。

例:

```text
ライブラリ
├─ UIライブラリ
├─ Reactレンダラー
├─ 3Dグラフィックスライブラリ
...
```

---

# 9. Category の説明方針

以下を基準に内容を作成してください。

## マークアップ言語

文書の構造や意味を記述する言語。

例:
- 見出し
- 段落
- リンク
- フォーム
- セマンティック構造

## スタイルシート言語

文書の見た目・レイアウト・装飾を指定する言語。

## プログラミング言語

処理、条件分岐、計算、データ操作、ロジックなどを記述する言語。

## ランタイム

プログラムを実際に実行するための環境。

「言語」や「フレームワーク」との違いを説明すること。

## パッケージマネージャ

依存パッケージの追加・削除・更新・バージョン解決・lockfile 管理などを行うツール。

## フレームワーク

アプリケーション全体または大きな領域の構成・流れ・規約を提供する仕組み。

ライブラリとの違いを丁寧に説明すること。

## フルスタックWebフレームワーク

Frontend と Server Side の双方を含む Web アプリケーション構築基盤。

## Web / APIフレームワーク

HTTP リクエスト処理、routing、middleware、API 実装などを支援するフレームワーク。

## CSSフレームワーク

CSS によるスタイリングを効率化する仕組み。

Tailwind のような Utility-first もここに含む。

## 認証フレームワーク

認証・認可・session・OAuth 等を比較的統合された形で提供する仕組み。

## ライブラリ

特定機能を再利用可能なコードとして提供し、アプリ側から呼び出して使うもの。

## UIライブラリ

UI を component ベースで構築するためのライブラリ。

## Reactレンダラー

React Tree を特定の描画先へ反映する仕組み。

例:

```text
React
├─ React DOM → Browser DOM
└─ React Three Fiber → Three.js scene
```

## 3Dグラフィックスライブラリ

Scene、Camera、Light、Mesh、Material などを用いて 3D 表現を構築するためのライブラリ。

## 状態管理ライブラリ

アプリケーション内部で共有する client state / application state を管理するもの。

## サーバー状態管理ライブラリ

Server から取得する remote data の fetch、cache、refetch、同期、loading/error state などを扱うもの。

通常の client state 管理との違いを説明すること。

## スキーマバリデーションライブラリ

データが期待する shape / value を満たすか検証する仕組み。

## ORM

アプリケーションコードと主に relational database の間を橋渡しし、型や object / model を通して DB を扱いやすくする仕組み。

## 認証ライブラリ

認証処理の構築に必要な機能をライブラリとして提供するもの。

認証フレームワーク / 認証サービスとの違いを説明すること。

## UIコンポーネントシステム

再利用可能な UI component と、その配布・組み込み・カスタマイズの仕組み。

shadcn/ui は「一般的な component library と完全に同じ」と雑に扱わないこと。

## ビルドツール

Source code の変換、development server、bundle、production build、最適化などを担うツール。

## データベース

構造化されたデータを永続化し、検索・更新するための仕組み。

## RDB

Table、row、column、relation、SQL、constraint 等を中心にデータを扱う DB。

## ドキュメントデータベース

JSON に近い document 単位でデータを保存する DB。

## オブジェクトデータベース

Programming language の object を直接的に永続化する考え方を持つ DB。

Object Storage との違いを必ず説明すること。

## ストレージ

ファイルや binary data 等を保存する広い概念。

## オブジェクトストレージ

画像、PDF、動画、backup などの file / blob を object として保存する storage。

Database とは目的が異なることを明記する。

## 認証サービス

認証基盤を managed service として外部サービスが提供するもの。

## テスト

Software が期待通り動くことを確認する仕組み全般。

## テストフレームワーク

Unit / integration test などを記述・実行するための framework。

## E2Eテストフレームワーク

Browser を操作し、user flow 全体を test するための framework。

## コード品質

可読性、一貫性、問題検出、保守性向上などに関わる tool 群。

## リンター

Static analysis により問題や coding rule 違反を検出するもの。

## フォーマッター

Code の見た目を自動的に統一するもの。

## 統合ツールチェーン

Lint、format など複数の役割を一つの toolchain で提供するもの。

## バージョン管理

Source code の変更履歴、branch、merge 等を管理する仕組み。

## 開発プラットフォーム

Repository hosting、issue、PR、review、automation など開発全体を支援する platform。

Git と GitHub を混同しないこと。

## CI/CD

Build、test、deploy 等を自動化する仕組み。

## コンテナ

Application と runtime / dependency / environment をまとめ、一貫した実行環境を作る仕組み。

## デプロイ基盤

Web application を公開・実行するための platform / infrastructure の総称。

## アプリケーションプラットフォーム

Build、deploy、runtime、preview 等を統合して提供する platform。

## サーバーレス実行基盤

Server machine をユーザーが直接管理せず、code を実行できる基盤。

## Webホスティング

HTML / CSS / JS / static assets 等を配信し、Web site を公開する基盤。

---

# 10. C — Stacks

## 10.1 目的

「Viteって何？」「React と Next.js は何が違う？」「D1 と R2 は何が違う？」という疑問に対して、**具体的な技術単位で理解できる辞書**にします。

単なる製品紹介ではなく、Web 開発の中でその技術が「どこに位置し、何を担当するのか」が分かる内容にしてください。

---

## 10.2 上部：Stack 一覧

Stacks 画面上部に全 Stack を一覧できる table / list を用意してください。

最低限:

```text
Stack
Category
Summary
```

必要なら検索・絞り込みと連携してください。

Stack 名クリックで `/dictionary/stacks/:stackId` または同ページ内詳細へ遷移します。

---

## 10.3 Stack 詳細

各 Stack 詳細には原則以下を持たせます。

```text
名称
Category
短い概要
詳しい説明
主な特徴
何を担当するか
どんなときに使うか
他の技術との関係
よく一緒に使う技術
関連 Category
公式サイト
```

技術によって適さない項目は無理に埋めなくても構いません。

説明は日本語で書いてください。

英語の固有名詞や一般的な technical term は無理に日本語化しなくて構いません。

---

# 11. Stack 一覧と内容

以下の Stack を最低限含めてください。

---

## HTML

```text
Category:
マークアップ言語

概要:
Webページの構造や意味を記述するための標準的なマークアップ言語。

ポイント:
見出し、段落、リンク、フォーム、画像、セマンティック要素など。
```

---

## CSS

```text
Category:
スタイルシート言語

概要:
HTMLなどで構築された文書の見た目・レイアウトを定義するスタイルシート言語。

ポイント:
色、余白、layout、responsive、animation 等。
```

---

## JavaScript

```text
Category:
プログラミング言語

概要:
Webブラウザで標準的に実行されるプログラミング言語。

ポイント:
BrowserだけでなくNode.jsなどを通じてserver/toolingでも利用される。
```

---

## TypeScript

```text
Category:
プログラミング言語

概要:
JavaScriptに静的型付けを追加した言語。

ポイント:
型チェック、IDE補完、大規模開発での保守性。
最終的にはJavaScriptへ変換して実行されることを説明。
```

---

## Node.js

```text
Category:
ランタイム

概要:
JavaScriptをブラウザ外で実行する代表的なruntime。

ポイント:
Web serverだけでなく、Vite、package manager周辺toolなどWeb開発toolingの実行基盤にもなる。
```

---

## npm

```text
Category:
パッケージマネージャ

概要:
Node.js ecosystemで広く使われるpackage manager。

ポイント:
package install、version管理、scripts、npm registry、lockfile。
Node.jsと関係は深いが「Node.jsそのもの」ではない。
```

---

## pnpm

```text
Category:
パッケージマネージャ

概要:
Node.js ecosystem向けpackage manager。

ポイント:
disk efficiency、高速性、strictなdependency handling、workspace / monorepoとの相性。
```

---

## Next.js

```text
Category:
フルスタックWebフレームワーク

概要:
ReactをベースとしたWeb application framework。

ポイント:
routing、server-side機能、Reactとの関係、build/deployとの関係。
Reactそのものではないことを明確に。
```

---

## Hono

```text
Category:
Web / APIフレームワーク

概要:
TypeScript / Web Standardsを重視した軽量なWeb/API framework。

ポイント:
API、routing、middleware、Edge / Workers系runtimeとの相性。
```

---

## Tailwind CSS

```text
Category:
CSSフレームワーク

概要:
Utility classを組み合わせてUIをstylingするCSS framework。

ポイント:
CSS languageそのものではなく、CSSを効率よく利用するframework。
```

---

## Better Auth

```text
Category:
認証フレームワーク

概要:
TypeScript ecosystem向けのauthentication / authorization framework。

ポイント:
session、OAuth、user managementなど認証基盤の構築を支援。
```

---

## React

```text
Category:
UIライブラリ

概要:
componentベースでUIを構築するためのJavaScript library。

ポイント:
declarative UI、component、state。
Next.jsとの違いを明確に。
React単体がfull-stack frameworkではないこと。
```

---

## React DOM

```text
Category:
Reactレンダラー

概要:
React TreeをbrowserのDOMへ描画するためのrenderer。

関係:
React
  ↓
React DOM
  ↓
DOM
```

---

## React Three Fiber

```text
Category:
Reactレンダラー

概要:
Reactのdeclarative modelでThree.js sceneを構築するためのrenderer。

関係:
React
  ↓
React Three Fiber
  ↓
Three.js
  ↓
3D rendering
```

注意:
Web Atlas Phase 1の実装には使用しない。
Dictionary項目として掲載するだけ。
```

---

## Three.js

```text
Category:
3Dグラフィックスライブラリ

概要:
Web browserで3D graphicsを扱いやすくするJavaScript library。

ポイント:
scene、camera、light、mesh、material。
低レベルgraphics APIを直接扱う負担を軽減する。

注意:
Web Atlas Phase 1自身には使用しない。
```

---

## Zustand

```text
Category:
状態管理ライブラリ

概要:
React ecosystemでよく使われる軽量なclient/application state management library。
```

---

## TanStack Query

```text
Category:
サーバー状態管理ライブラリ

概要:
Serverから取得するremote dataのfetch、cache、refetch、同期などを扱うlibrary。

ポイント:
Zustand等のclient state managementとの役割の違い。
```

---

## Zod

```text
Category:
スキーマバリデーションライブラリ

概要:
TypeScriptでschema定義とruntime validationを行うlibrary。
```

---

## Drizzle ORM

```text
Category:
ORM

概要:
TypeScript向けのSQL志向・type-safeなdatabase toolkit / ORM。

ポイント:
SQLとの距離が比較的近いこと。
```

---

## Prisma ORM

```text
Category:
ORM

概要:
Schemaとtype-safe clientを中心にdatabase accessを支援するORM。
```

---

## Auth.js

```text
Category:
認証ライブラリ

概要:
Web applicationにauthenticationを組み込むためのlibrary。

ポイント:
Better Auth、Firebase Authenticationとの分類差を説明。
現行statusや推奨状況について断定する場合は実装時に公式情報を確認すること。
```

---

## shadcn/ui

```text
Category:
UIコンポーネントシステム

概要:
Component source codeを自分のprojectへ取り込み、所有・編集しながら使うUI component system / code distribution approach。

重要:
単純に「一般的なcomponent library」とだけ分類しないこと。
```

---

## Vite

```text
Category:
ビルドツール

概要:
Modern Web development向けbuild tool。

ポイント:
development server、HMR、production build、framework integration。
ReactやTypeScriptそのものではない。
```

---

## PostgreSQL

```text
Category:
RDB

概要:
高機能なopen-source relational database。

ポイント:
SQL、transaction、constraint、extensibility。
```

---

## MySQL

```text
Category:
RDB

概要:
Web applicationでも長く広く利用されているrelational database。
```

---

## SQLite

```text
Category:
RDB

概要:
Server processを必要とせず、embedded / file-basedで利用できる軽量なrelational database。
```

---

## Cloudflare D1

```text
Category:
RDB

概要:
Cloudflare環境で利用できるmanaged serverless SQL database。

ポイント:
SQLite semanticsとの関係、Workersとの統合。

注意:
最新仕様に依存する細部は公式資料を確認すること。
```

---

## MongoDB

```text
Category:
ドキュメントデータベース

概要:
JSON-like documentを中心にデータを扱う代表的なdocument database。

ポイント:
RDBとのdata modelingの違い。
```

---

## ObjectDB

```text
Category:
オブジェクトデータベース

概要:
Program objectを直接永続化するobject-oriented databaseの例。

ポイント:
Object Storageではない。
```

---

## ObjectBox

```text
Category:
オブジェクトデータベース

概要:
Embedded / Edge / Mobileなどでも利用されるobject database。

ポイント:
Object Storageではない。
```

---

## Amazon S3

```text
Category:
オブジェクトストレージ

概要:
AWSが提供する代表的なobject storage。

ポイント:
画像、PDF、動画、backup等のfile/blob保存。
Databaseとの違い。
```

---

## Cloudflare R2

```text
Category:
オブジェクトストレージ

概要:
Cloudflareのobject storage。

ポイント:
S3-compatible APIなど。
最新料金や仕様を説明する場合は公式情報を確認する。
```

---

## Backblaze B2

```text
Category:
オブジェクトストレージ

概要:
Backblazeが提供するcloud object storage。
```

---

## Google Cloud Storage

```text
Category:
オブジェクトストレージ

概要:
Google Cloudが提供するobject storage。
```

---

## Cloud Storage for Firebase

```text
Category:
オブジェクトストレージ

概要:
Firebase application向けのfile/object storage。

ポイント:
Firebase Authenticationやsecurity rulesとの連携。
Google Cloud Storageとの関係も分かりやすく説明。
```

---

## Firebase Authentication

```text
Category:
認証サービス

概要:
Firebaseが提供するmanaged authentication service。

ポイント:
email/password、identity provider等を利用した認証backend。
Better Auth / Auth.jsとの分類差。
```

---

## Vitest

```text
Category:
テストフレームワーク

概要:
JavaScript / TypeScript向けtest framework。

ポイント:
Vite ecosystemとの親和性。
```

---

## Playwright Test

```text
Category:
E2Eテストフレームワーク

概要:
Browserを実際に操作してWeb applicationをtestするE2E framework。

ポイント:
主要browser engineを利用したcross-browser testing。
```

---

## ESLint

```text
Category:
リンター

概要:
JavaScript / TypeScript等のcodeをstatic analysisし、問題やrule violationを検出するlinter。
```

---

## Prettier

```text
Category:
フォーマッター

概要:
Code formattingを自動化し、一貫したstyleへ整えるformatter。
```

---

## Biome

```text
Category:
統合ツールチェーン

概要:
Formatterやlinter等を統合的に提供するtoolchain。

ポイント:
ESLint / Prettierとの役割の重なりと違い。
```

---

## Git

```text
Category:
バージョン管理

概要:
Distributed version control system。

ポイント:
commit、branch、merge、history。
GitHubとは別物。
```

---

## GitHub

```text
Category:
開発プラットフォーム

概要:
Git repository hostingを中心に、PR、Issue、Review、automation等を提供するdevelopment platform。

ポイント:
Gitそのものではない。
```

---

## GitHub Actions

```text
Category:
CI/CD

概要:
GitHub repository内でworkflowを定義し、build、test、deploy等を自動化する仕組み。
```

---

## Docker

```text
Category:
コンテナ

概要:
Applicationとその実行environmentをcontainerとして扱うためのplatform / tooling。

ポイント:
Virtual machineとの違いを必要に応じて簡潔に説明。
```

---

## Vercel

```text
Category:
アプリケーションプラットフォーム

概要:
Web applicationのbuild、deploy、hosting、runtime等を統合的に提供するplatform。

ポイント:
Next.jsとの親和性は説明してよいが、Vercel = Next.js と誤解させない。
```

---

## Cloudflare Workers

```text
Category:
サーバーレス実行基盤

概要:
Cloudflareのdistributed infrastructure上でserver-side codeを実行するserverless runtime。

ポイント:
Hono、D1等との関係。
```

---

## Cloudflare Pages

```text
Category:
Webホスティング

概要:
Frontend / static Web contentをdeploy・配信するためのCloudflareのWeb hosting platform。

注意:
Workersとの境界・最新product integrationについて断定する場合は公式情報を確認する。
```

---

# 12. B と C のリンク

## B → C

Category 詳細に表示される具体的 Stack 名はクリック可能にしてください。

例:

```text
◆ ビルドツール

具体的なStack
[Vite]
```

`Vite` を押すと

```text
/dictionary/stacks/vite
```

へ移動します。

---

## C → B

C の Stack 詳細に表示される Category 名もクリック可能にしてください。

例:

```text
Vite

Category:
[ビルドツール]
```

`ビルドツール` を押すと

```text
/dictionary/categories/build-tool
```

へ移動します。

---

## C → C

関連 Stack もクリック可能にしてください。

例:

```text
Next.js
関連:
React
TypeScript
Vercel
```

---

# 13. Search

Phase 1 で Search を実装してください。

検索対象:

```text
Category name
Category aliases（必要なら）
Category summary

Stack name
Stack aliases
Stack packageNames
Stack summary
```

最低限、名称と alias で高品質に検索できればよいです。

---

## 13.1 検索例

入力:

```text
react
```

候補:

```text
Stacks
- React
- React DOM
- React Three Fiber
```

入力:

```text
build
```

候補:

```text
Category
- ビルドツール
```

入力:

```text
next
```

候補:

```text
Stack
- Next.js
```

---

## 13.2 Search UX

- keyboard 操作可能
- Enter で選択
- Escape で閉じる
- 選択すると対応 route へ移動
- モバイルでも使用可能
- 検索結果が多すぎないよう上位件数を制御
- 文字入力のたびに不自然なlayout shiftを起こさない

高度な全文検索engineは不要です。

---

# 14. Direct Link / Deep Link

以下のような URL をブラウザへ直接入力しても正しく表示してください。

```text
/dictionary/stacks/vite
/dictionary/stacks/react
/dictionary/categories/runtime
```

対象項目が存在しない場合は blank page にしないでください。

適切な Not Found 表示または Dictionary 一覧への誘導を用意してください。

---

# 15. Highlight / Scroll

一覧から詳細へ移動した際は、ユーザーが「どこへ移動したか」分かるようにしてください。

例:

- smooth scroll
- detail card の一時的な highlight
- heading focus
- URL route で詳細を独立表示

実装方式は設計に合わせて選んでください。

Accessibility を壊すほど animation を多用しないこと。

`prefers-reduced-motion` を尊重してください。

---

# 16. Responsive

最低限以下で実用的にしてください。

```text
Desktop
Tablet
Mobile
```

## Desktop

- Map の全体像を掴みやすい
- B / C table の一覧性が高い
- 詳細説明の一行が長くなりすぎない

## Mobile

- Table が極端に潰れない
- 必要なら card/list 形式へ切り替える
- Map の文字サイズを極端に小さくしない
- Header / navigation / Search が操作可能
- 横スクロールを使用する場合は意図が明確

---

# 17. Accessibility

最低限以下を守ってください。

```text
semantic HTML
keyboard navigation
visible focus
button / link の適切な使い分け
aria-label が必要なicon buttonへの付与
十分なcontrast
reduced motion対応
heading hierarchy
```

クリック可能な `div` を乱用しないでください。

---

# 18. Tailwind CSS の使い方

Tailwind CSS を使用します。

ただし、

- className が巨大化しすぎる場合は component 化
- design token 的な値を一貫させる
- 同一 pattern を何度もコピペしない
- arbitrary value の乱用を避ける

こと。

Color / spacing / border radius / typography の規則性を持たせてください。

必要なら CSS variables を併用して構いません。

---

# 19. Component 設計

例として以下程度の粒度を検討してください。

```text
src/
├─ components/
│  ├─ layout/
│  │  ├─ AppHeader
│  │  ├─ DictionaryNav
│  │  └─ PageContainer
│  │
│  ├─ search/
│  │  ├─ DictionarySearch
│  │  └─ SearchResultItem
│  │
│  ├─ map/
│  │  ├─ StackMap
│  │  ├─ MapCategoryNode
│  │  ├─ MapStackNode
│  │  └─ MapConnector
│  │
│  ├─ categories/
│  │  ├─ CategoryTable
│  │  ├─ CategoryDetail
│  │  └─ CategoryStackLink
│  │
│  └─ stacks/
│     ├─ StackTable
│     ├─ StackDetail
│     ├─ StackBadge
│     └─ RelatedStacks
│
├─ data/
├─ types/
├─ pages/
├─ routes/
└─ utils/
```

これは固定ではありません。

既存project structureとReactの保守性を見て改善してください。

ただし巨大な1ファイルへ全UIを詰め込まないでください。

---

# 20. Data Validation

Dictionary はデータ駆動なので、開発時にデータ不整合を検出できるようにしてください。

最低限チェックしたいもの:

```text
Category ID の重複
Stack ID の重複
存在しない categoryId
存在しない relatedStackIds
存在しない parentCategoryId
packageNames の不自然な重複
URL生成不能なID
```

runtime assertion、build-time utility、unit test など、適切な方法を選んでください。

---

# 21. 型安全性

TypeScript の型を活用してください。

避ける:

```ts
any
as any
大量のnon-null assertion
stringだけで全てのrelationを扱う無秩序な実装
```

必要なら branded type まで行う必要はありませんが、Category / Stack / Relationship の意味が型から分かる状態を目指してください。

---

# 22. Content の正確性

このプロジェクトは Dictionary なので、見た目以上に **内容の正確性が重要**です。

技術の分類や status が変化しうるものについて、曖昧な記憶で断定しないでください。

特に以下は、必要なら公式 documentation を確認して記述してください。

```text
Auth.js
Better Auth
Cloudflare D1
Cloudflare Pages
Cloudflare Workers
shadcn/ui
React Three Fiber
Vite
Next.js
Tailwind CSS
```

料金・version番号・細かなproduct statusのように変化しやすい情報は、Dictionaryの本質でない限り書かないでください。

Phase 1では「長期間有効な概念説明」を優先します。

---

# 23. 説明文のトーン

日本語で、技術的に正確かつ初心者にも理解しやすくしてください。

避ける:

```text
単なるmarketing文
「超高速」「最強」などの誇張
意味の薄い一文説明
英語documentationの不自然な直訳
```

目指す:

```text
これは何か
何を担当するか
どこに位置するか
似たものと何が違うか
何と一緒に使われるか
```

が読めば分かる説明。

---

# 24. 関係性の表現

C の Stack 詳細では、単なる related list だけでなく、意味のある場合は関係を短く可視化してください。

例:

```text
React
  ↓ rendered by
React DOM
  ↓
Browser DOM
```

```text
React
  ↓ base
Next.js
```

```text
React
  ↓
React Three Fiber
  ↓
Three.js
```

```text
Browser
  ↓ HTTP
Cloudflare Workers
  ↓
Hono
  ↓
D1
```

ただし Phase 2 Analyzer のような巨大 graph は作らないでください。

Dictionary の理解を助ける小さな relation diagram の範囲に留めます。

---

# 25. Analyzer との将来接続

今回は Analyzer の UI / parser / local file access は一切実装しません。

ただし将来、以下のような接続を実現します。

```text
Analyzer
└─ package.jsonで "vite" を検出
      ↓
Dictionary stackId = vite
      ↓
/dictionary/stacks/vite
```

```text
Analyzer
└─ Vite を Build Tool と判定
      ↓
categoryId = build-tool
      ↓
/dictionary/categories/build-tool
```

そのため Dictionary 側は「Analyzer がリンクしやすい安定した knowledge base」として実装してください。

---

# 26. Phase 2 以降に想定している Analyzer

これは **今回実装しない**ものです。

将来構想を理解して data architecture を壊さないためだけに記載します。

```text
Project Analyzer
├─ Structure
│  ├─ Project Overview
│  └─ Workspace Flow
│
├─ Execution
│  ├─ Command Flow
│  └─ Install / Dependency Resolution Flow
│
├─ Dependency
│  ├─ Package Dependency Flow
│  └─ Code Reference Flow
│
└─ Architecture
   ├─ Technology Runtime Flow
   └─ Architecture Flow
```

将来の例:

```text
pnpm dev
  ↓
root package.json
  ↓
scripts.dev
  ↓
concurrently
  ├─ dev:web
  ├─ dev:api
  └─ dev:auth
```

```text
pnpm install
  ↓
pnpm-workspace.yaml
  ↓
workspace package discovery
  ↓
dependencies
  ↓
external package / workspace package
  ↓
pnpm-lock.yaml
```

```text
UserPage.tsx
  ↓
useUser()
  ↓
TanStack Query
```

これらを将来 Dictionary の Stack / Category へリンクする予定です。

繰り返しますが、**Phase 1 では Analyzer は実装しません。**

---

# 27. Phase 1 で明確にやらないこと

以下は scope 外です。

```text
× local project folderの自動解析
× package.json parserによるproject analysis
× pnpm-workspace.yaml解析
× command execution
× pnpm installの追跡
× dependency graph自動生成
× import/export graph解析
× function参照解析
× variable参照解析
× class/type/interface参照解析
× architecture自動生成
× file watcher
× CLI
× local companion
× backend
× authentication
× database
× cloud sync
× Three.jsによる3D Map
× vGPU
```

scope creep を起こさないでください。

---

# 28. Testing

最低限、重要部分には test を用意してください。

優先度:

1. Dictionary data validation
2. ID / relation resolution
3. Search
4. Route parameter → correct entry
5. 必要に応じて主要UI component

すべての見た目を snapshot test で固める必要はありません。

---

# 29. Quality Gate

実装完了前に、projectで用意したcommandに合わせて以下を確認してください。

```text
pnpm install
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test
```

script名が異なる場合は実際の `package.json` に従ってください。

存在しないscriptを無理に実行するのではなく、必要なら適切なscriptを整備してください。

最終的に少なくとも:

```text
build 成功
type error なし
lint error なし
主要test成功
```

を目標にしてください。

---

# 30. package manager

このリポジトリでは **pnpm** を使用してください。

npm の lockfile と pnpm の lockfile を混在させないでください。

新規セットアップなら:

```text
pnpm-lock.yaml
```

を正とします。

既に意図的な設定が存在する場合は、破壊せず確認してから調整してください。

---

# 31. Git / 既存リポジトリへの配慮

既存 repository にファイルや設定がある場合:

- まず現在の構成を確認
- 不要な全面書き換えをしない
- unrelated file を変更しない
- user の既存変更を消さない
- lockfile を不用意に複数生成しない
- generated file を必要以上にcommit対象へ入れない

既存実装がある場合は、まず理解してから変更してください。

---

# 32. 実装順序

以下の順序を推奨します。

## Step 1 — 現在の repository を確認

確認:

```text
package.json
pnpm-lock.yaml
src/
vite.config.*
tsconfig*
Tailwind設定
既存routing
既存style
```

---

## Step 2 — Type / Data model を設計

先に:

```text
Category
Stack
Relationship
Map hierarchy
Search index
```

を型で定義。

---

## Step 3 — Dictionary data を完成

A/B/Cで必要な全Category・全Stackを投入。

この段階でvalidationを通す。

---

## Step 4 — Routing

以下を成立させる。

```text
/dictionary/map
/dictionary/categories
/dictionary/categories/:categoryId
/dictionary/stacks
/dictionary/stacks/:stackId
```

---

## Step 5 — 共通Layout / Header / Navigation

黒ベースのWeb Atlas shellを完成。

---

## Step 6 — B Categories

一覧と詳細を先に完成。

理由:
Mapより通常DOMで実装しやすく、data modelの正しさを確認しやすいため。

---

## Step 7 — C Stacks

全Stack一覧、詳細、相互リンクを完成。

---

## Step 8 — A Stack Map

B/Cへのlinkを含めてMapを完成。

---

## Step 9 — Search

Category / Stackを横断検索。

---

## Step 10 — Responsive / Accessibility

desktopだけで完成扱いにしない。

---

## Step 11 — Test / Build / Polish

Error、broken link、layout shift、mobile overflow、focus、not foundなどを確認。

---

# 33. 完了条件

以下をすべて満たしたら Phase 1 完成です。

```text
Web Atlas — Phase 1

[ ] React + TypeScript + Vite + Tailwind CSS でWebアプリとして動作

[ ] pnpm を使用

[ ] 黒ベースの統一されたDeveloper Reference UI

[ ] Dictionary dataが一元管理されている

[ ] Category / Stack にstable IDがある

[ ] Analyzer接続用 packageNames / aliases / categoryId 等がある

[ ] A：Stack Map完成
    [ ] 全分類を表示
    [ ] 全Stackを表示
    [ ] Category click → B
    [ ] Stack click → C
    [ ] responsive

[ ] B：Categories完成
    [ ] 全Category一覧
    [ ] 全Category詳細
    [ ] 役割
    [ ] 他分類との違い
    [ ] 具体的Stack
    [ ] Stackへのlink

[ ] C：Stacks完成
    [ ] 全Stack一覧
    [ ] 全Stack詳細
    [ ] Category
    [ ] 説明
    [ ] 特徴
    [ ] use case
    [ ] relation
    [ ] related stack
    [ ] official URL
    [ ] B / C間link

[ ] Search完成

[ ] Deep Link完成

[ ] Not Found処理

[ ] Browser Back / Forwardが自然に動く

[ ] Desktop / Tablet / Mobile対応

[ ] Keyboard操作可能

[ ] visible focus

[ ] reduced motion対応

[ ] data validation

[ ] TypeScript型安全性

[ ] build成功

[ ] lint成功

[ ] typecheck成功

[ ] 主要test成功

[ ] Analyzerそのものは実装していない

[ ] Three.js / R3F / vGPUを実装依存として導入していない
```

---

# 34. 最終成果物の確認方法

実装完了後、最後に以下を報告してください。

## 1. 実装したもの

簡潔に整理。

## 2. 主な設計

特に:

```text
data model
routing
A/B/Cの生成方法
search
Analyzer接続用metadata
```

## 3. 変更した主要ファイル

重要なもののみ。

## 4. Verification

実行したものと結果。

例:

```text
pnpm build     ✅
pnpm lint      ✅
pnpm typecheck ✅
pnpm test      ✅
```

## 5. 残課題

本当に残っているものだけを書く。

Phase 2 Analyzer の未実装を「バグ」のように残課題扱いしないでください。
それは意図的に scope 外です。

---

# 35. 実装上の判断基準

迷った場合は次の優先順位で判断してください。

```text
1. 内容の正確性
2. 情報構造の理解しやすさ
3. Navigationの一貫性
4. Analyzerとの将来接続性
5. Accessibility
6. Responsive
7. 保守性
8. 見た目
9. Animation / 演出
```

見た目のために情報構造を犠牲にしないでください。

---

# 36. 最終的に目指す体験

ユーザーが Web Atlas を開き、

```text
「Web開発の全体像を見たい」
→ Map

「フレームワークってそもそも何？」
→ Categories

「Viteって何？」
→ Stacks

「ReactとNext.jsの関係は？」
→ Stack詳細 / relation

「DatabaseとObject Storageの違いは？」
→ Category詳細
```

という形で迷わず理解できること。

そして将来 Analyzer が追加されたとき、

```text
自分のprojectでViteを検出
       ↓
Vite nodeをclick
       ↓
Web Atlas Dictionary / Vite
```

と自然につながること。

Phase 1 はそのための **正確で、リンク可能で、拡張可能な知識基盤**として完成させてください。

---

# 37. 実装開始時の指示

ここまでを仕様として扱ってください。

まず repository の現状を確認し、現在の構成を壊さない実装計画を短く立ててから、そのまま Phase 1 の実装へ進んでください。

途中で、実装上の軽微な選択肢について毎回質問して止まる必要はありません。

仕様に明記されていない細部は、

```text
正確性
保守性
一貫性
将来のAnalyzer接続性
```

を優先して合理的に決定してください。

ただし、Phase 1 の scope を超える大きな機能追加は行わないでください。

**Dictionary を完成させることが今回のゴールです。**
