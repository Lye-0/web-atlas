import type { CategoryEntry } from '../types';

const difference = (against: string, explanation: string) => ({ against, explanation });

export const categories: CategoryEntry[] = [
  {
    id: 'markup-language',
    name: 'マークアップ言語',
    aliases: ['Markup Language'],
    summary: '文書の構造と意味を記述する言語。',
    description:
      '見出し、段落、リンク、フォームなど、コンテンツが何であるかを表します。見た目の指定や処理の実行ではなく、文書の意味を機械が読み取れる形にする役割です。',
    role: 'Web文書の意味と構造を定義する',
    useCases: ['Webページの骨格を作る', '検索・支援技術に文書構造を伝える', 'フォームやリンクなどの意味を表す'],
    differences: [
      difference('スタイルシート言語', 'マークアップは構造、スタイルシートは色・余白・レイアウトなどの見た目を担当します。'),
      difference('プログラミング言語', 'マークアップは処理手順を実行せず、文書の意味と構造を表します。'),
    ],
    relatedCategoryIds: ['stylesheet-language', 'programming-language'],
  },
  {
    id: 'stylesheet-language',
    name: 'スタイルシート言語',
    aliases: ['Stylesheet Language'],
    summary: '文書の見た目、レイアウト、装飾を指定する言語。',
    description:
      'HTMLなどで表された文書に対して、色、フォント、余白、配置、レスポンシブな振る舞いなどの表示ルールを適用します。',
    role: '文書の表示方法を定義する',
    useCases: ['ページのレイアウトを組む', '画面幅に合わせて表示を変える', '状態や操作に応じた見た目を表す'],
    differences: [
      difference('マークアップ言語', 'スタイルシートは文書が何であるかではなく、どう見えるかを定義します。'),
      difference('CSSフレームワーク', 'CSSは言語そのもの、CSSフレームワークはCSSを使いやすくする規約や部品の集合です。'),
    ],
    relatedCategoryIds: ['markup-language', 'css-framework'],
  },
  {
    id: 'programming-language',
    name: 'プログラミング言語',
    aliases: ['Programming Language', '言語'],
    summary: '処理、条件分岐、計算、データ操作、ロジックを記述する言語。',
    description:
      '入力を受け取り、条件に応じて処理し、データを変換するなど、アプリケーションの振る舞いを表します。Webではブラウザとサーバーの両方で使われます。',
    role: 'アプリケーションのロジックと振る舞いを実装する',
    useCases: ['UIのインタラクションを実装する', 'サーバーやCLIの処理を書く', 'データを検証・変換する'],
    differences: [
      difference('マークアップ言語', 'プログラミング言語は処理を実行するための命令や式を記述します。'),
      difference('ランタイム', '言語はコードの記法、ランタイムはそのコードを実際に実行する環境です。'),
    ],
    relatedCategoryIds: ['markup-language', 'stylesheet-language', 'runtime'],
  },
  {
    id: 'runtime',
    name: 'ランタイム',
    aliases: ['Runtime', '実行環境'],
    summary: 'プログラムを実際に実行するための環境。',
    description:
      'ランタイムは、言語のコードを動かすエンジンに加え、ファイル、ネットワーク、タイマーなどのAPIや実行時の制約を提供します。同じJavaScriptでもブラウザとNode.jsでは使えるAPIが異なります。',
    role: 'プログラムの実行場所と実行時APIを提供する',
    useCases: ['ブラウザでUIを動かす', 'サーバーでリクエストを処理する', '開発ツールやスクリプトを実行する'],
    differences: [
      difference('プログラミング言語', '言語はコードの書き方、ランタイムはそのコードを動かす実行環境です。'),
      difference('フレームワーク', 'ランタイムは実行基盤、フレームワークはアプリの構成・規約・流れを提供します。'),
    ],
    relatedCategoryIds: ['programming-language', 'serverless-runtime', 'framework'],
  },
  {
    id: 'package-manager',
    name: 'パッケージマネージャ',
    aliases: ['Package Manager', '依存管理'],
    summary: '依存パッケージの追加・更新・解決とlockfile管理を行うツール。',
    description:
      'パッケージの取得、バージョン解決、依存関係の再現、スクリプト実行などを担います。lockfileによってチームやCIで同じ依存セットを再現できます。',
    role: 'プロジェクトの依存関係とインストール手順を管理する',
    useCases: ['ライブラリを追加・更新する', 'lockfileで依存バージョンを固定する', 'workspaceやmonorepoを管理する'],
    differences: [
      difference('ランタイム', 'パッケージマネージャは依存を管理する開発ツールで、アプリを実行する環境そのものではありません。'),
      difference('レジストリ', 'パッケージマネージャはレジストリからパッケージを取得するクライアントです。'),
    ],
    relatedCategoryIds: ['runtime'],
  },
  {
    id: 'framework',
    name: 'フレームワーク',
    aliases: ['Framework'],
    summary: 'アプリケーション全体または大きな領域の構成・流れ・規約を提供する仕組み。',
    description:
      'フレームワークは、アプリ側が従うライフサイクル、ディレクトリ構成、ルーティングなどを用意し、設計の土台を作ります。自由に呼び出す部品というより、アプリの進行を支える枠組みです。',
    role: 'アプリケーションの構造と開発ルールを整える',
    useCases: ['大きなWebアプリの構成を揃える', 'routingやmiddlewareの流れを定型化する', 'チームで共通の設計を採用する'],
    differences: [
      difference('ライブラリ', 'ライブラリはアプリが必要な時に呼び出しますが、フレームワークは定めた流れの中でアプリのコードを呼び出すことがあります。'),
      difference('ランタイム', 'フレームワークは設計と機能の枠組み、ランタイムはコードを実行する基盤です。'),
    ],
    relatedCategoryIds: ['library', 'runtime', 'fullstack-web-framework', 'web-api-framework', 'css-framework', 'auth-framework'],
  },
  {
    id: 'fullstack-web-framework',
    name: 'フルスタックWebフレームワーク',
    aliases: ['Full-stack Web Framework', 'フルスタック'],
    parentCategoryId: 'framework',
    summary: 'FrontendとServer Sideの双方を含むWebアプリ構築基盤。',
    description:
      '画面だけでなく、routing、サーバー処理、データ取得、buildやdeployとの接続まで一つの開発体験にまとめます。どこまでを担当するかはフレームワークごとに異なります。',
    role: 'Webアプリ全体の開発・実行モデルを提供する',
    useCases: ['画面とサーバー処理を同じプロジェクトで作る', 'ページルーティングやrenderingを統合する', 'デプロイしやすい構成を採用する'],
    differences: [
      difference('UIライブラリ', 'UIライブラリは表示部品の構築が中心で、フルスタックフレームワークはサーバーやroutingも含む構成を提供します。'),
      difference('Web / APIフレームワーク', 'Web / APIフレームワークはHTTP処理に焦点を置き、フルスタックフレームワークは画面とサーバーを一体で扱います。'),
    ],
    relatedCategoryIds: ['ui-library', 'web-api-framework', 'build-tool', 'application-platform'],
  },
  {
    id: 'web-api-framework',
    name: 'Web / APIフレームワーク',
    aliases: ['Web Framework', 'API Framework'],
    parentCategoryId: 'framework',
    summary: 'HTTPリクエスト、routing、middleware、API実装を支援するフレームワーク。',
    description:
      '受け取ったHTTPリクエストをrouteへ振り分け、認証やログなどのmiddlewareを通し、レスポンスを返すサーバー側の流れを整理します。',
    role: 'WebサーバーとAPIのリクエスト処理を組み立てる',
    useCases: ['REST APIやRPCエンドポイントを作る', 'middlewareで共通処理をまとめる', 'Edgeやserverless向けのHTTP処理を実装する'],
    differences: [
      difference('フルスタックWebフレームワーク', 'Web / APIフレームワークはサーバーHTTP層に集中し、画面の構成まで必ず提供するわけではありません。'),
      difference('ライブラリ', 'routingやmiddlewareのライフサイクルをまとめて提供するため、単機能ライブラリより構成への影響が大きくなります。'),
    ],
    relatedCategoryIds: ['framework', 'serverless-runtime', 'application-platform'],
  },
  {
    id: 'css-framework',
    name: 'CSSフレームワーク',
    aliases: ['CSS Framework'],
    parentCategoryId: 'framework',
    summary: 'CSSによるスタイリングを効率化する仕組み。',
    description:
      '既成のクラス、utility、設計規約、コンポーネントの基礎などを提供し、画面全体のスタイルを一貫して組み立てやすくします。Tailwind CSSのようなutility-firstも含みます。',
    role: 'スタイリングの再利用性と一貫性を高める',
    useCases: ['画面を素早く整える', 'spacingやcolorの規則を共有する', 'responsive designを実装する'],
    differences: [
      difference('スタイルシート言語', 'CSSは言語、CSSフレームワークはCSSを使った設計やutilityを提供する開発支援です。'),
      difference('UIコンポーネントシステム', 'CSSフレームワークはスタイル基盤が中心で、UIコンポーネントシステムは再利用可能なUIの配布・組み込み方法まで扱います。'),
    ],
    relatedCategoryIds: ['stylesheet-language', 'ui-component-system'],
  },
  {
    id: 'auth-framework',
    name: '認証フレームワーク',
    aliases: ['Authentication Framework', 'Auth Framework'],
    parentCategoryId: 'framework',
    summary: '認証・認可・session・OAuthなどを統合的に扱う仕組み。',
    description:
      'ログインフローだけでなく、sessionの発行・検証、OAuth連携、ユーザー管理など、認証基盤に必要な複数の処理をアプリの構成に沿って組み立てます。',
    role: 'アプリケーションの認証機能を一つの設計にまとめる',
    useCases: ['メールやOAuthでログインさせる', 'sessionと認可を管理する', 'ユーザー情報と認証処理を連携する'],
    differences: [
      difference('認証ライブラリ', '認証ライブラリは部品を提供し、認証フレームワークはsessionやrouteなどアプリ全体の流れも定めます。'),
      difference('認証サービス', '認証サービスはmanaged backendを提供します。認証フレームワークは自分のアプリに組み込むソフトウェアの枠組みです。'),
    ],
    relatedCategoryIds: ['auth-library', 'auth-service', 'framework'],
  },
  {
    id: 'library',
    name: 'ライブラリ',
    aliases: ['Library'],
    summary: '特定機能を再利用可能なコードとして提供し、アプリ側から呼び出して使うもの。',
    description:
      'ライブラリは、アプリケーションが必要なタイミングで関数やコンポーネントを呼び出して利用します。目的に合わせて複数のライブラリを組み合わせられる一方、全体の構成はアプリ側が決めます。',
    role: '特定の機能を再利用可能な部品として提供する',
    useCases: ['UIや状態管理を部品化する', 'データ検証やDBアクセスを共通化する', '既存機能を複数の画面で使う'],
    differences: [
      difference('フレームワーク', 'ライブラリはアプリが呼び出す部品、フレームワークはアプリの構成や呼び出しの流れを提供します。'),
      difference('ビルドツール', 'ライブラリはアプリの機能、ビルドツールはコード変換やbundleなど開発・配布の工程を担当します。'),
    ],
    relatedCategoryIds: ['framework', 'build-tool'],
  },
  {
    id: 'ui-library',
    name: 'UIライブラリ',
    aliases: ['UI Library'],
    parentCategoryId: 'library',
    summary: 'componentベースでUIを構築するためのライブラリ。',
    description:
      'UIを小さなcomponentに分け、stateやpropsに応じて表示を組み立てます。UIの描画方法を抽象化しますが、routingやサーバー機能まで含むとは限りません。',
    role: '再利用可能なUIとその表示ロジックを組み立てる',
    useCases: ['画面をcomponentとして分割する', 'stateに応じた表示を作る', '複数画面でUIを再利用する'],
    differences: [
      difference('フルスタックWebフレームワーク', 'UIライブラリは表示構築に集中し、フルスタックフレームワークはroutingやserver-side機能も提供します。'),
      difference('UIコンポーネントシステム', 'UIライブラリはUIの描画モデル、コンポーネントシステムは完成したUI部品の配布・組み込みの仕組みに焦点があります。'),
    ],
    relatedCategoryIds: ['fullstack-web-framework', 'react-renderer', 'ui-component-system'],
  },
  {
    id: 'react-renderer',
    name: 'Reactレンダラー',
    aliases: ['React Renderer', 'Renderer'],
    parentCategoryId: 'library',
    summary: 'React treeを特定の描画先へ反映する仕組み。',
    description:
      'Reactの宣言的なcomponent treeを、Browser DOMやThree.js sceneなど別のhost環境へ変換して反映します。React本体と描画先の間をつなぐ層です。',
    role: 'Reactのcomponent treeを対象環境へ描画する',
    useCases: ['Browser DOMへUIを描画する', '別の描画エンジンへReactモデルを接続する', '描画対象ごとの差分を隠蔽する'],
    differences: [
      difference('UIライブラリ', 'UIライブラリがcomponentモデルを提供するのに対し、rendererはそのtreeを具体的な描画先へ反映します。'),
      difference('3Dグラフィックスライブラリ', 'React rendererはReactとの接続層で、3Dグラフィックスライブラリはsceneやcameraなどの3D機能を提供します。'),
    ],
    relatedCategoryIds: ['ui-library', '3d-graphics-library'],
  },
  {
    id: '3d-graphics-library',
    name: '3Dグラフィックスライブラリ',
    aliases: ['3D Graphics Library'],
    parentCategoryId: 'library',
    summary: 'Scene、Camera、Light、Mesh、Materialなどで3D表現を構築するライブラリ。',
    description:
      'Webの描画APIを直接扱う負担を減らし、3Dオブジェクト、カメラ、照明、マテリアルなどを組み合わせてsceneを描画します。',
    role: 'ブラウザ上の3D sceneと描画処理を扱う',
    useCases: ['3Dモデルやデータを表示する', 'インタラクティブなsceneを作る', 'WebGL/WebGPUの詳細を抽象化する'],
    differences: [
      difference('Reactレンダラー', '3Dライブラリは描画エンジン、React rendererはReact treeをそのエンジンへ接続する層です。'),
      difference('Webホスティング', '3Dライブラリはブラウザ内の表示機能、ホスティングはそのファイルを配信する基盤です。'),
    ],
    relatedCategoryIds: ['react-renderer', 'web-hosting'],
  },
  {
    id: 'state-management-library',
    name: '状態管理ライブラリ',
    aliases: ['State Management Library', 'Client State'],
    parentCategoryId: 'library',
    summary: 'アプリケーション内部で共有するclient stateを管理するライブラリ。',
    description:
      'モーダルの開閉、選択中の項目、フォームの一時値など、アプリ内で複数のcomponentが共有する状態を保持し、変更を購読する仕組みを提供します。',
    role: 'アプリ内の共有状態を一貫して更新・購読する',
    useCases: ['複数画面でユーザー設定を共有する', 'UIの選択や開閉状態を管理する', '複雑なclient-side stateを整理する'],
    differences: [
      difference('サーバー状態管理ライブラリ', '状態管理ライブラリはアプリ内の状態、サーバー状態管理はremote dataのcache・同期・再取得を扱います。'),
      difference('データベース', '状態管理は主に実行中のアプリのメモリ上の状態で、データベースは永続データを保管します。'),
    ],
    relatedCategoryIds: ['server-state-library', 'database'],
  },
  {
    id: 'server-state-library',
    name: 'サーバー状態管理ライブラリ',
    aliases: ['Server State Library', 'Remote Data'],
    parentCategoryId: 'library',
    summary: 'Serverから取得するremote dataのfetch、cache、refetch、同期を扱うライブラリ。',
    description:
      'サーバー由来のデータは、loading・error・stale・再取得などclient stateとは異なるライフサイクルを持ちます。その取得とcacheをcomponentから扱いやすくします。',
    role: 'remote dataの取得・cache・同期状態を管理する',
    useCases: ['APIレスポンスをcacheする', 'stale dataを再取得する', 'loadingやerrorを画面へ反映する'],
    differences: [
      difference('状態管理ライブラリ', '通常の状態管理はアプリ内データ、サーバー状態管理は外部サーバーをsource of truthとするデータを扱います。'),
      difference('データベース', 'サーバー状態管理はclient側の取得・同期ロジックであり、データを永続化するDBそのものではありません。'),
    ],
    relatedCategoryIds: ['state-management-library', 'database'],
  },
  {
    id: 'schema-validation-library',
    name: 'スキーマバリデーションライブラリ',
    aliases: ['Schema Validation Library', 'Runtime Validation'],
    parentCategoryId: 'library',
    summary: 'データが期待するshapeとvalueを満たすか実行時に検証するライブラリ。',
    description:
      'TypeScriptの型チェックだけでは検証できない、API入力やJSONなど実行時データの形をschemaとして定義し、検証や変換を行います。',
    role: '外部から入るデータの形と値を安全に確認する',
    useCases: ['APIリクエストを検証する', '環境変数や設定をチェックする', '入力を型付きデータへ変換する'],
    differences: [
      difference('プログラミング言語の型', '静的型は主に開発時、schema validationは実行時に実際の値を検証します。'),
      difference('リンター', 'リンターはソースコードの問題を検出し、validatorは実行時データの内容を検証します。'),
    ],
    relatedCategoryIds: ['programming-language', 'linter'],
  },
  {
    id: 'orm',
    name: 'ORM',
    aliases: ['Object Relational Mapper', 'Database Toolkit'],
    parentCategoryId: 'library',
    summary: 'アプリケーションコードと主にrelational databaseの間を橋渡しする仕組み。',
    description:
      'テーブルやクエリを、型やobject/modelを通じてアプリから扱いやすくします。SQLを完全に隠すものから、SQLに近い操作感を重視するものまで設計はさまざまです。',
    role: 'アプリのデータモデルとDB操作を接続する',
    useCases: ['型付きでCRUDを実装する', 'schemaとアプリモデルを同期する', 'queryやmigrationを管理する'],
    differences: [
      difference('データベース', 'ORMはDBそのものではなく、アプリケーションからDBへアクセスするソフトウェア層です。'),
      difference('スキーマバリデーションライブラリ', 'ORMは永続DBとの読み書き、validatorは入力データの形の検証が中心です。'),
    ],
    relatedCategoryIds: ['relational-database', 'schema-validation-library'],
  },
  {
    id: 'auth-library',
    name: '認証ライブラリ',
    aliases: ['Authentication Library', 'Auth Library'],
    parentCategoryId: 'library',
    summary: '認証処理の構築に必要な機能を部品として提供するライブラリ。',
    description:
      'OAuth providerとの連携、tokenやsessionの処理、credentialの検証など、認証に必要な機能をアプリの設計に合わせて組み合わせます。',
    role: 'アプリへ認証機能を組み込むための部品を提供する',
    useCases: ['OAuthログインを追加する', 'sessionやtokenを検証する', '認証フローをアプリに合わせて構成する'],
    differences: [
      difference('認証フレームワーク', '認証ライブラリは部品、認証フレームワークは認証に関わるアプリ全体の流れや規約も提供します。'),
      difference('認証サービス', '認証サービスは外部managed backend、ライブラリは自分のアプリ内で使うコードです。'),
    ],
    relatedCategoryIds: ['auth-framework', 'auth-service'],
  },
  {
    id: 'ui-component-system',
    name: 'UIコンポーネントシステム',
    aliases: ['UI Component System', 'Component System'],
    summary: '再利用可能なUI componentと、その配布・組み込み・カスタマイズの仕組み。',
    description:
      '見た目と操作のパターンをcomponentとして揃え、プロジェクトへ取り込む方法や、デザインtoken・アクセシビリティ方針まで含めてUIを一貫させます。',
    role: 'UI部品の設計・配布・カスタマイズを統一する',
    useCases: ['チームでUIパターンを共有する', 'アクセシブルな部品を再利用する', 'プロジェクトのデザインに合わせて部品を拡張する'],
    differences: [
      difference('UIライブラリ', 'UIライブラリは描画モデルやcomponent APIが中心、UIコンポーネントシステムは部品の所有・配布・設計規約まで含みます。'),
      difference('CSSフレームワーク', 'CSSフレームワークはスタイルの基盤、component systemは操作可能なUI部品のまとまりです。'),
    ],
    relatedCategoryIds: ['ui-library', 'css-framework'],
  },
  {
    id: 'build-tool',
    name: 'ビルドツール',
    aliases: ['Build Tool', 'Bundler', '開発ツール'],
    summary: 'source codeの変換、development server、bundle、production buildを担うツール。',
    description:
      'TypeScriptやJSXの変換、依存のbundle、開発中のHMR、production向けの最適化など、コードを実行・配布できる形にする工程を管理します。',
    role: 'ソースコードを開発・配布可能な成果物へ変換する',
    useCases: ['開発サーバーとHMRを使う', 'production bundleを生成する', 'frameworkやCSSの変換を統合する'],
    differences: [
      difference('パッケージマネージャ', 'パッケージマネージャは依存を取得・解決し、ビルドツールはソースを変換・bundleします。'),
      difference('ランタイム', 'ビルドツールはコードを準備する工程、ランタイムは準備されたコードを実行する環境です。'),
    ],
    relatedCategoryIds: ['package-manager', 'runtime', 'framework'],
  },
  {
    id: 'database',
    name: 'データベース',
    aliases: ['Database', 'DB'],
    summary: '構造化されたデータを永続化し、検索・更新するための仕組み。',
    description:
      'データを保存するだけでなく、検索、更新、整合性、同時実行などを扱います。データモデルやアクセス方法によってRDB、document database、object databaseなどに分かれます。',
    role: 'アプリケーションデータを検索・更新可能な形で永続化する',
    useCases: ['ユーザーや注文などの業務データを保存する', '条件検索や集計を行う', '制約でデータ整合性を保つ'],
    differences: [
      difference('オブジェクトストレージ', 'データベースは検索・更新する構造化データ、object storageは画像や動画などのfile/blob保存が中心です。'),
      difference('ストレージ', 'ストレージは保存基盤全般、データベースはデータモデルと問い合わせ機能を持つ保存システムです。'),
    ],
    relatedCategoryIds: ['relational-database', 'document-database', 'object-database', 'storage'],
  },
  {
    id: 'relational-database',
    name: 'リレーショナルデータベース（RDB）',
    aliases: ['RDB', 'Relational Database'],
    parentCategoryId: 'database',
    summary: 'table、row、column、relation、SQL、constraintを中心に扱うデータベース。',
    description:
      'データを表形式で管理し、テーブル間の関係を定義しながらSQLで問い合わせます。transactionやconstraintにより、複数データの整合性を保ちやすいのが特徴です。',
    role: '関係のある構造化データを整合性付きで管理する',
    useCases: ['業務データを正規化して保存する', '複数テーブルをjoinして検索する', 'transactionで複数更新をまとめる'],
    differences: [
      difference('ドキュメントデータベース', 'RDBはtableとrelationを中心に設計し、document DBはdocument単位の構造を中心に設計します。'),
      difference('オブジェクトデータベース', 'RDBは表とSQL、object DBはプログラミング言語のobjectを直接永続化する考え方です。'),
    ],
    relatedCategoryIds: ['database', 'document-database', 'object-database', 'orm'],
  },
  {
    id: 'document-database',
    name: 'ドキュメントデータベース',
    aliases: ['Document Database', 'NoSQL'],
    parentCategoryId: 'database',
    summary: 'JSONに近いdocument単位でデータを保存するデータベース。',
    description:
      '行と列の表よりも、入れ子を含むdocumentを単位にデータをモデル化します。データの形を柔軟に変えやすい一方、関係や整合性の設計は製品と用途に応じて考える必要があります。',
    role: 'document中心のデータモデルで柔軟にデータを扱う',
    useCases: ['JSONに近いデータを保存する', 'document単位で読み書きする', '変化する属性を持つデータを扱う'],
    differences: [
      difference('RDB', 'document DBはdocumentとcollectionを中心に扱い、RDBはtable・relation・SQLを中心に扱います。'),
      difference('オブジェクトデータベース', 'document DBはJSON-likeなデータ形式、object DBは言語のobjectモデルを永続化する仕組みです。'),
    ],
    relatedCategoryIds: ['database', 'relational-database', 'object-database'],
  },
  {
    id: 'object-database',
    name: 'オブジェクトデータベース（OODBMS）',
    aliases: ['Object Database', 'OODBMS'],
    parentCategoryId: 'database',
    summary: 'プログラミング言語のobjectを直接的に永続化する考え方のデータベース。',
    description:
      'objectのidentity、型、関係などを保ったまま永続化し、アプリのobjectモデルとの距離を小さくします。RDBのtableへマッピングするORMとは異なるアプローチです。',
    role: 'アプリケーションobjectを中心にデータを永続化する',
    useCases: ['複雑なobject graphを保存する', '組み込み環境でobjectを扱う', '言語モデルに近い永続化を行う'],
    differences: [
      difference('RDB', 'object DBはobjectを中心に扱い、RDBはtable・relation・SQLを中心に扱います。'),
      difference('オブジェクトストレージ', 'object DBのobjectは検索可能なプログラムデータ、object storageのobjectはfile/blobです。'),
    ],
    relatedCategoryIds: ['database', 'relational-database', 'object-storage'],
  },
  {
    id: 'storage',
    name: 'ストレージ',
    aliases: ['Storage'],
    summary: 'ファイルやbinary dataなどを保存する広い概念。',
    description:
      'データを保持する仕組み全般を指し、file、blob、block、databaseなど目的によって形が異なります。何をどの粒度で検索・更新するかによって適切な種類を選びます。',
    role: 'データを失わずに保持する保存基盤を提供する',
    useCases: ['ファイルや画像を保存する', 'backupやarchiveを保持する', 'データベースなどの永続層を選ぶ'],
    differences: [
      difference('データベース', 'ストレージは保存の総称、データベースは構造化データを問い合わせるための仕組みです。'),
      difference('オブジェクトストレージ', 'object storageはストレージの一種で、file/blobをobjectとして保存します。'),
    ],
    relatedCategoryIds: ['database', 'object-storage'],
  },
  {
    id: 'object-storage',
    name: 'オブジェクトストレージ',
    aliases: ['Object Storage', 'Blob Storage'],
    parentCategoryId: 'storage',
    summary: '画像、PDF、動画、backupなどのfile/blobをobjectとして保存するstorage。',
    description:
      'objectに識別子とmetadataを付けて保存し、HTTP APIなどで取得します。大きなbinary dataの配信や保管に向き、業務データの複雑な検索は通常データベースが担当します。',
    role: 'file/blobを耐久性のあるobjectとして保存・配信する',
    useCases: ['画像・動画・PDFを保存する', 'ユーザーアップロードを管理する', 'backupや静的assetを保管する'],
    differences: [
      difference('データベース', 'object storageはfile/blobの取得が中心で、複雑な条件検索やtransactionを行うDBとは目的が異なります。'),
      difference('オブジェクトデータベース', 'object storageのobjectはファイル、object DBのobjectはプログラムのデータモデルです。'),
    ],
    relatedCategoryIds: ['storage', 'database'],
  },
  {
    id: 'auth-service',
    name: '認証サービス',
    aliases: ['Authentication Service', 'Managed Auth'],
    summary: '認証基盤をmanaged serviceとして外部サービスが提供するもの。',
    description:
      'ユーザー登録、credential検証、identity provider連携などのbackendをサービスとして利用します。アプリはSDKやAPIを通じて接続し、運用の多くをサービス側へ委ねます。',
    role: '認証backendの運用を外部managed serviceへ委譲する',
    useCases: ['短期間でログイン機能を導入する', '複数のidentity providerを扱う', '認証基盤の運用負担を減らす'],
    differences: [
      difference('認証フレームワーク', '認証サービスは外部の運用済みbackend、認証フレームワークはアプリへ組み込むコードの枠組みです。'),
      difference('認証ライブラリ', '認証ライブラリは自分のコードで使う部品、サービスはユーザー情報や認証処理を外部で管理します。'),
    ],
    relatedCategoryIds: ['auth-framework', 'auth-library'],
  },
  {
    id: 'testing',
    name: 'テスト',
    aliases: ['Testing', 'Software Test'],
    summary: 'Softwareが期待通り動くことを確認する仕組み全般。',
    description:
      '小さな関数からユーザーの一連の操作まで、異なる粒度で期待する振る舞いを検証します。テストは品質を保証する一回の作業ではなく、変更時に安全を確認する仕組みです。',
    role: '変更による不具合を早く発見し、期待する振る舞いを守る',
    useCases: ['関数やcomponentの振る舞いを検証する', 'APIや複数モジュールの連携を検証する', 'browserでユーザーフローを確認する'],
    differences: [
      difference('リンター', 'テストは実行した振る舞いを確認し、リンターはソースコードの静的な問題を検出します。'),
      difference('E2Eテストフレームワーク', 'テストは目的の総称、E2E frameworkはbrowserを含むユーザーフローを実行する具体的な道具です。'),
    ],
    relatedCategoryIds: ['test-framework', 'e2e-test-framework', 'code-quality'],
  },
  {
    id: 'test-framework',
    name: 'テストフレームワーク',
    aliases: ['Test Framework', 'Unit Test Framework'],
    parentCategoryId: 'testing',
    summary: 'Unit / integration testを記述・実行するためのframework。',
    description:
      'test caseの定義、assertion、fixture、mock、実行・報告などを提供します。通常はブラウザを完全に操作するより、関数やモジュール単位の検証に向きます。',
    role: 'コードの期待する振る舞いを自動テストとして実行する',
    useCases: ['関数の入出力を検証する', 'componentやmoduleの連携を検証する', 'CIで高速なregression testを実行する'],
    differences: [
      difference('E2Eテストフレームワーク', 'テストframeworkはコード単位が中心、E2Eは実際のbrowserとユーザーフロー全体を対象にします。'),
      difference('リンター', 'テストframeworkはコードを実行して結果を確認し、リンターは実行せず静的解析します。'),
    ],
    relatedCategoryIds: ['testing', 'e2e-test-framework', 'linter'],
  },
  {
    id: 'e2e-test-framework',
    name: 'E2Eテストフレームワーク',
    aliases: ['E2E Test Framework', 'End-to-end Testing'],
    parentCategoryId: 'testing',
    summary: 'Browserを操作し、user flow全体をtestするためのframework。',
    description:
      'ページ遷移、入力、クリック、ネットワークや表示結果などを、ユーザーに近い経路で検証します。実環境に近い分、unit testより実行コストが高くなります。',
    role: 'アプリケーションをユーザー視点の一連の操作で検証する',
    useCases: ['ログインから購入までのflowを確認する', '複数browser engineで表示を検証する', '重要な画面遷移をregression testする'],
    differences: [
      difference('テストフレームワーク', 'E2Eはbrowserや外部サービスを含む全体flow、通常のtest frameworkは関数やmoduleの検証が中心です。'),
      difference('ブラウザ', 'E2E frameworkはbrowserを操作・制御するテスト道具で、browser自体は実行環境です。'),
    ],
    relatedCategoryIds: ['testing', 'test-framework', 'web-hosting'],
  },
  {
    id: 'code-quality',
    name: 'コード品質',
    aliases: ['Code Quality'],
    summary: '可読性、一貫性、問題検出、保守性向上に関わるtool群。',
    description:
      'lint、format、型検査、統合toolchainなどを組み合わせ、個人の注意力だけに頼らずコードの品質基準を保ちます。',
    role: 'コードの問題を早期に見つけ、一貫した保守性を保つ',
    useCases: ['commit前に問題を検出する', 'formatを自動適用する', 'CIで品質基準を検査する'],
    differences: [
      difference('テスト', 'コード品質toolは静的な規則や形式を確認し、テストは実行時の振る舞いを確認します。'),
      difference('統合ツールチェーン', 'コード品質は目的の分類、統合toolchainはlintやformatなどをまとめて提供する具体的な形です。'),
    ],
    relatedCategoryIds: ['linter', 'formatter', 'integrated-toolchain', 'testing'],
  },
  {
    id: 'linter',
    name: 'リンター',
    aliases: ['Linter', 'Static Analysis'],
    parentCategoryId: 'code-quality',
    summary: 'Static analysisにより問題やcoding rule違反を検出するもの。',
    description:
      'ソースコードを解析し、バグにつながりやすい記述、未使用変数、プロジェクト固有の規則違反などを指摘します。必ずしもコードを自動修正するものではありません。',
    role: 'コードの潜在的な問題と規約違反を検出する',
    useCases: ['危険なパターンを検出する', 'teamのcoding ruleを揃える', 'CIで違反をブロックする'],
    differences: [
      difference('フォーマッター', 'リンターは意味や品質上の問題を指摘し、formatterは見た目の形式を整えます。'),
      difference('テスト', 'リンターはコードを静的解析し、テストはコードを実行して振る舞いを確認します。'),
    ],
    relatedCategoryIds: ['code-quality', 'formatter', 'test-framework'],
  },
  {
    id: 'formatter',
    name: 'フォーマッター',
    aliases: ['Formatter', 'Code Formatter'],
    parentCategoryId: 'code-quality',
    summary: 'Codeの見た目を自動的に統一するもの。',
    description:
      'indent、改行、引用符など、機能に影響しない形式を機械的に整えます。レビューで議論する対象をロジックへ集中させることが目的です。',
    role: 'コードの形式を自動整形し、無用な差分を減らす',
    useCases: ['保存時にコードを整形する', 'teamで同じformatを適用する', 'CIでformat違反を検出する'],
    differences: [
      difference('リンター', 'formatterは見た目の形式を整え、linterは潜在的な問題や規則違反を検出します。'),
      difference('統合ツールチェーン', 'formatterは一つの役割、統合toolchainはformatterやlinterなど複数の役割をまとめます。'),
    ],
    relatedCategoryIds: ['code-quality', 'linter', 'integrated-toolchain'],
  },
  {
    id: 'integrated-toolchain',
    name: '統合ツールチェーン',
    aliases: ['Integrated Toolchain', 'Toolchain'],
    parentCategoryId: 'code-quality',
    summary: 'Lint、formatなど複数の役割を一つのtoolchainで提供するもの。',
    description:
      'コード品質に関わる複数の機能を同じ設定や実行基盤でまとめます。個別toolの組み合わせより導入が単純になる場合がありますが、既存設定との互換性は確認が必要です。',
    role: '品質検査と整形の実行方法・設定を統合する',
    useCases: ['lintとformatを一つのCLIで実行する', 'プロジェクト設定を簡素化する', 'CIの品質チェックを標準化する'],
    differences: [
      difference('リンター', '統合toolchainはlinterを含む場合がありますが、lintだけに限定されません。'),
      difference('フォーマッター', '統合toolchainはformatterを含む場合がありますが、形式整形だけを目的としません。'),
    ],
    relatedCategoryIds: ['code-quality', 'linter', 'formatter'],
  },
  {
    id: 'version-control',
    name: 'バージョン管理',
    aliases: ['Version Control', 'VCS'],
    summary: 'Source codeの変更履歴、branch、mergeなどを管理する仕組み。',
    description:
      '誰がいつ何を変更したかを記録し、並行開発、差分確認、過去状態への復元を可能にします。分散型では各開発者が履歴の複製を持ちます。',
    role: 'コードの履歴と複数人の変更を安全に管理する',
    useCases: ['変更をcommitする', 'branchで機能を分離する', 'mergeやreviewで変更を統合する'],
    differences: [
      difference('開発プラットフォーム', 'バージョン管理は履歴を扱う仕組み、開発platformはrepository hostingやIssue・PRなど周辺機能を提供します。'),
      difference('CI/CD', 'バージョン管理は変更を記録し、CI/CDはその変更を契機にbuildやdeployを自動化します。'),
    ],
    relatedCategoryIds: ['development-platform', 'ci-cd'],
  },
  {
    id: 'development-platform',
    name: '開発プラットフォーム',
    aliases: ['Development Platform', 'Code Hosting'],
    summary: 'Repository hosting、Issue、PR、Review、automationなど開発全体を支援するplatform。',
    description:
      'コードを共有するだけでなく、変更提案、レビュー、課題管理、権限、automationなど、チーム開発の協働面を提供します。',
    role: 'チームのコード共有と開発プロセスを支える',
    useCases: ['repositoryを共有する', 'Pull Requestでレビューする', 'Issueやautomationで作業を追跡する'],
    differences: [
      difference('バージョン管理', '開発platformはGitなどの履歴をホスト・協働化するサービスであり、Gitそのものではありません。'),
      difference('CI/CD', '開発platformは開発の場全体、CI/CDはbuild・test・deployの自動化という一領域です。'),
    ],
    relatedCategoryIds: ['version-control', 'ci-cd'],
  },
  {
    id: 'ci-cd',
    name: 'CI/CD',
    aliases: ['Continuous Integration', 'Continuous Delivery', 'Continuous Deployment'],
    summary: 'Build、test、deployなどを自動化する仕組み。',
    description:
      'コード変更を契機に依存インストール、品質検査、テスト、成果物作成、環境への配布などを再現可能なworkflowとして実行します。',
    role: '変更の検証と配布を自動化し、手作業の差を減らす',
    useCases: ['Pull Requestごとにtestを実行する', 'mainへの変更をdeployする', '定期的な品質・security checkを動かす'],
    differences: [
      difference('バージョン管理', 'バージョン管理は変更履歴を保持し、CI/CDはその変更を契機に処理を自動実行します。'),
      difference('アプリケーションプラットフォーム', 'CI/CDは自動化workflow、application platformはアプリをbuild・実行・公開する基盤です。'),
    ],
    relatedCategoryIds: ['version-control', 'development-platform', 'deployment-platform'],
  },
  {
    id: 'container',
    name: 'コンテナ',
    aliases: ['Container', 'Containerization'],
    summary: 'Applicationとruntime・dependency・environmentをまとめ、一貫した実行環境を作る仕組み。',
    description:
      'アプリと必要なファイル・設定をimageとしてまとめ、隔離されたprocessとして実行します。仮想マシンより軽量になりやすい一方、ホストkernelを共有するなど性質が異なります。',
    role: '実行環境の差を減らし、再現可能な配布単位を作る',
    useCases: ['開発と本番の環境を揃える', '依存をimageに固定する', '複数サービスを分離して運用する'],
    differences: [
      difference('仮想マシン', 'containerは通常host kernelを共有するprocess隔離、VMはguest OSを含む仮想化です。'),
      difference('アプリケーションプラットフォーム', 'containerは実行単位のパッケージ化、platformはbuild・deploy・runtimeなどの運用基盤です。'),
    ],
    relatedCategoryIds: ['runtime', 'application-platform'],
  },
  {
    id: 'deployment-platform',
    name: 'デプロイ基盤',
    aliases: ['Deployment Platform', 'Deployment Infrastructure'],
    summary: 'Web applicationを公開・実行するplatformやinfrastructureの総称。',
    description:
      '成果物をどこへ置き、どのruntimeで実行し、どのURLへ配信するかというdeployの土台を指します。application platform、serverless runtime、hostingなど複数の形があります。',
    role: 'アプリケーションを利用可能な環境へ届ける',
    useCases: ['build成果物を公開する', 'server-side codeを実行する', 'previewやproduction環境を分ける'],
    differences: [
      difference('CI/CD', 'デプロイ基盤はアプリを実行・公開する場所、CI/CDはそこへ届ける自動workflowです。'),
      difference('Webホスティング', 'Web hostingは主にWeb資産の配信、デプロイ基盤はserverless実行やapplication platformまで含む広い概念です。'),
    ],
    relatedCategoryIds: ['application-platform', 'serverless-runtime', 'web-hosting', 'ci-cd'],
  },
  {
    id: 'application-platform',
    name: 'アプリケーションプラットフォーム',
    aliases: ['Application Platform', 'App Platform'],
    parentCategoryId: 'deployment-platform',
    summary: 'Build、deploy、runtime、previewなどを統合して提供するplatform。',
    description:
      'アプリケーションをbuildして環境へ配置し、必要なruntimeやpreview URL、ログなどをまとめて扱えるようにします。利用者はserverの細部を管理せずに運用できます。',
    role: 'Webアプリのbuildから実行・公開までを統合する',
    useCases: ['Git pushからpreviewを作る', 'frontendとserver処理をdeployする', '環境変数やruntimeを管理する'],
    differences: [
      difference('Webホスティング', 'application platformはbuildやserver-side runtimeも扱い、hostingは主に静的Web資産の配信に集中します。'),
      difference('サーバーレス実行基盤', 'application platformはdeploy・preview・hostingなどを含む統合層、serverless runtimeはcodeを実行する層です。'),
    ],
    relatedCategoryIds: ['deployment-platform', 'web-hosting', 'serverless-runtime'],
  },
  {
    id: 'serverless-runtime',
    name: 'サーバーレス実行基盤',
    aliases: ['Serverless Runtime', 'Edge Runtime'],
    parentCategoryId: 'deployment-platform',
    summary: 'Server machineを直接管理せず、codeを実行できる基盤。',
    description:
      'インフラのプロビジョニングや常駐serverの管理を抽象化し、requestやeventに応じてserver-side codeを実行します。実行時間や利用可能APIなどの制約は基盤ごとに異なります。',
    role: '運用サーバーを意識せずserver-side処理を実行する',
    useCases: ['API endpointを公開する', 'event-drivenな処理を実行する', 'Edgeに近い場所でrequestを処理する'],
    differences: [
      difference('ランタイム', 'serverless runtimeはdeploy・scaling・実行制約まで含む提供形態、runtimeはコードを動かす環境という一般概念です。'),
      difference('Webホスティング', 'serverless runtimeはcode実行、hostingはHTMLやasset配信が中心です。'),
    ],
    relatedCategoryIds: ['deployment-platform', 'runtime', 'web-api-framework'],
  },
  {
    id: 'web-hosting',
    name: 'Webホスティング',
    aliases: ['Web Hosting', 'Static Hosting'],
    parentCategoryId: 'deployment-platform',
    summary: 'HTML、CSS、JS、static assetsなどを配信し、Webサイトを公開する基盤。',
    description:
      'build済みのWeb資産をCDNなどから配信し、ドメインやHTTPSと組み合わせてブラウザから利用可能にします。server-side codeの実行を含むかはサービスによって異なります。',
    role: 'Webサイトと静的資産をブラウザへ配信する',
    useCases: ['静的サイトを公開する', 'SPAのbuild成果物を配信する', 'assetをCDN経由で届ける'],
    differences: [
      difference('サーバーレス実行基盤', 'hostingは資産の配信、serverless runtimeはrequestに応じたserver-side codeの実行が中心です。'),
      difference('アプリケーションプラットフォーム', 'hostingは配信に集中し、application platformはbuild・runtime・previewなどより広い機能を統合します。'),
    ],
    relatedCategoryIds: ['deployment-platform', 'application-platform', 'serverless-runtime'],
  },
];
