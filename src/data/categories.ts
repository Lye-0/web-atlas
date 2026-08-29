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
    summary: '依存パッケージの追加・更新・解決とロックファイル管理を行うツール。',
    description:
      'パッケージの取得、バージョン解決、依存関係の再現、スクリプト実行などを担います。ロックファイルによってチームやCIで同じ依存セットを再現できます。',
    role: 'プロジェクトの依存関係とインストール手順を管理する',
    useCases: ['ライブラリを追加・更新する', 'ロックファイルで依存バージョンを固定する', 'ワークスペースやモノレポを管理する'],
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
    useCases: ['大きなWebアプリの構成を揃える', 'ルーティングやミドルウェアの流れを定型化する', 'チームで共通の設計を採用する'],
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
    summary: 'フロントエンドとサーバーサイドの双方を含むWebアプリ構築基盤。',
    description:
      '画面だけでなく、ルーティング、サーバー処理、データ取得、ビルドやデプロイとの接続まで一つの開発体験にまとめます。どこまでを担当するかはフレームワークごとに異なります。',
    role: 'Webアプリ全体の開発・実行モデルを提供する',
    useCases: ['画面とサーバー処理を同じプロジェクトで作る', 'ページルーティングやレンダリングを統合する', 'デプロイしやすい構成を採用する'],
    differences: [
      difference('UIライブラリ', 'UIライブラリは表示部品の構築が中心で、フルスタックフレームワークはサーバーやルーティングも含む構成を提供します。'),
      difference('Web / APIフレームワーク', 'Web / APIフレームワークはHTTP処理に焦点を置き、フルスタックフレームワークは画面とサーバーを一体で扱います。'),
    ],
    relatedCategoryIds: ['ui-library', 'web-api-framework', 'build-tool', 'application-platform'],
  },
  {
    id: 'web-api-framework',
    name: 'Web / APIフレームワーク',
    aliases: ['Web Framework', 'API Framework'],
    parentCategoryId: 'framework',
    summary: 'HTTPリクエスト、ルーティング、ミドルウェア、API実装を支援するフレームワーク。',
    description:
      '受け取ったHTTPリクエストをルートへ振り分け、認証やログなどのミドルウェアを通し、レスポンスを返すサーバー側の流れを整理します。',
    role: 'WebサーバーとAPIのリクエスト処理を組み立てる',
    useCases: ['REST APIやRPCエンドポイントを作る', 'ミドルウェアで共通処理をまとめる', 'エッジやサーバーレス向けのHTTP処理を実装する'],
    differences: [
      difference('フルスタックWebフレームワーク', 'Web / APIフレームワークはサーバーHTTP層に集中し、画面の構成まで必ず提供するわけではありません。'),
      difference('ライブラリ', 'ルーティングやミドルウェアのライフサイクルをまとめて提供するため、単機能ライブラリより構成への影響が大きくなります。'),
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
      '既成のクラス、ユーティリティ、設計規約、コンポーネントの基礎などを提供し、画面全体のスタイルを一貫して組み立てやすくします。Tailwind CSSのようなユーティリティファーストも含みます。',
    role: 'スタイリングの再利用性と一貫性を高める',
    useCases: ['画面を素早く整える', '余白や色の規則を共有する', 'レスポンシブデザインを実装する'],
    differences: [
      difference('スタイルシート言語', 'CSSは言語、CSSフレームワークはCSSを使った設計やユーティリティを提供する開発支援です。'),
      difference('UIコンポーネントシステム', 'CSSフレームワークはスタイル基盤が中心で、UIコンポーネントシステムは再利用可能なUIの配布・組み込み方法まで扱います。'),
    ],
    relatedCategoryIds: ['stylesheet-language', 'ui-component-system'],
  },
  {
    id: 'auth-framework',
    name: '認証フレームワーク',
    aliases: ['Authentication Framework', 'Auth Framework'],
    parentCategoryId: 'framework',
    summary: '認証・認可・セッション・OAuthなどを統合的に扱う仕組み。',
    description:
      'ログインフローだけでなく、セッションの発行・検証、OAuth連携、ユーザー管理など、認証基盤に必要な複数の処理をアプリの構成に沿って組み立てます。',
    role: 'アプリケーションの認証機能を一つの設計にまとめる',
    useCases: ['メールやOAuthでログインさせる', 'セッションと認可を管理する', 'ユーザー情報と認証処理を連携する'],
    differences: [
      difference('認証ライブラリ', '認証ライブラリは部品を提供し、認証フレームワークはセッションやルートなどアプリ全体の流れも定めます。'),
      difference('認証サービス', '認証サービスはマネージドバックエンドを提供します。認証フレームワークは自分のアプリに組み込むソフトウェアの枠組みです。'),
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
      difference('ビルドツール', 'ライブラリはアプリの機能、ビルドツールはコード変換やバンドルなど開発・配布の工程を担当します。'),
    ],
    relatedCategoryIds: ['framework', 'build-tool'],
  },
  {
    id: 'ui-library',
    name: 'UIライブラリ',
    aliases: ['UI Library'],
    parentCategoryId: 'library',
    summary: 'コンポーネントベースでUIを構築するためのライブラリ。',
    description:
      'UIを小さなコンポーネントに分け、状態やpropsに応じて表示を組み立てます。UIの描画方法を抽象化しますが、ルーティングやサーバー機能まで含むとは限りません。',
    role: '再利用可能なUIとその表示ロジックを組み立てる',
    useCases: ['画面をコンポーネントとして分割する', '状態に応じた表示を作る', '複数画面でUIを再利用する'],
    differences: [
      difference('フルスタックWebフレームワーク', 'UIライブラリは表示構築に集中し、フルスタックフレームワークはルーティングやサーバー側機能も提供します。'),
      difference('UIコンポーネントシステム', 'UIライブラリはUIの描画モデル、コンポーネントシステムは完成したUI部品の配布・組み込みの仕組みに焦点があります。'),
    ],
    relatedCategoryIds: ['fullstack-web-framework', 'react-renderer', 'ui-component-system'],
  },
  {
    id: 'react-renderer',
    name: 'Reactレンダラー',
    aliases: ['React Renderer', 'Renderer'],
    parentCategoryId: 'library',
    summary: 'Reactツリーを特定の描画先へ反映する仕組み。',
    description:
      'Reactの宣言的なコンポーネントツリーを、ブラウザDOMやThree.jsのシーンなど別のホスト環境へ変換して反映します。React本体と描画先の間をつなぐ層です。',
    role: 'Reactのコンポーネントツリーを対象環境へ描画する',
    useCases: ['ブラウザDOMへUIを描画する', '別の描画エンジンへReactモデルを接続する', '描画対象ごとの差分を隠蔽する'],
    differences: [
      difference('UIライブラリ', 'UIライブラリがコンポーネントモデルを提供するのに対し、レンダラーはそのツリーを具体的な描画先へ反映します。'),
      difference('3Dグラフィックスライブラリ', 'ReactレンダラーはReactとの接続層で、3Dグラフィックスライブラリはシーンやカメラなどの3D機能を提供します。'),
    ],
    relatedCategoryIds: ['ui-library', '3d-graphics-library'],
  },
  {
    id: '3d-graphics-library',
    name: '3Dグラフィックスライブラリ',
    aliases: ['3D Graphics Library'],
    parentCategoryId: 'library',
    summary: 'シーン、カメラ、ライト、メッシュ、マテリアルなどで3D表現を構築するライブラリ。',
    description:
      'Webの描画APIを直接扱う負担を減らし、3Dオブジェクト、カメラ、照明、マテリアルなどを組み合わせてシーンを描画します。',
    role: 'ブラウザ上の3Dシーンと描画処理を扱う',
    useCases: ['3Dモデルやデータを表示する', 'インタラクティブなシーンを作る', 'WebGL/WebGPUの詳細を抽象化する'],
    differences: [
      difference('Reactレンダラー', '3Dライブラリは描画エンジン、ReactレンダラーはReactツリーをそのエンジンへ接続する層です。'),
      difference('Webホスティング', '3Dライブラリはブラウザ内の表示機能、ホスティングはそのファイルを配信する基盤です。'),
    ],
    relatedCategoryIds: ['react-renderer', 'web-hosting'],
  },
  {
    id: 'state-management-library',
    name: '状態管理ライブラリ',
    aliases: ['State Management Library', 'Client State'],
    parentCategoryId: 'library',
    summary: 'アプリケーション内部で共有するクライアント状態を管理するライブラリ。',
    description:
      'モーダルの開閉、選択中の項目、フォームの一時値など、アプリ内で複数のコンポーネントが共有する状態を保持し、変更を購読する仕組みを提供します。',
    role: 'アプリ内の共有状態を一貫して更新・購読する',
    useCases: ['複数画面でユーザー設定を共有する', 'UIの選択や開閉状態を管理する', '複雑なクライアント側状態を整理する'],
    differences: [
      difference('サーバー状態管理ライブラリ', '状態管理ライブラリはアプリ内の状態、サーバー状態管理はリモートデータのキャッシュ・同期・再取得を扱います。'),
      difference('データベース', '状態管理は主に実行中のアプリのメモリ上の状態で、データベースは永続データを保管します。'),
    ],
    relatedCategoryIds: ['server-state-library', 'database'],
  },
  {
    id: 'server-state-library',
    name: 'サーバー状態管理ライブラリ',
    aliases: ['Server State Library', 'Remote Data'],
    parentCategoryId: 'library',
    summary: 'サーバーから取得するリモートデータの取得、キャッシュ、再取得、同期を扱うライブラリ。',
    description:
      'サーバー由来のデータは、読み込み中・エラー・古い状態・再取得などクライアント状態とは異なるライフサイクルを持ちます。その取得とキャッシュをコンポーネントから扱いやすくします。',
    role: 'リモートデータの取得・キャッシュ・同期状態を管理する',
    useCases: ['APIレスポンスをキャッシュする', '古い状態データを再取得する', '読み込み中やエラーを画面へ反映する'],
    differences: [
      difference('状態管理ライブラリ', '通常の状態管理はアプリ内データ、サーバー状態管理は外部サーバーを正となるデータとするデータを扱います。'),
      difference('データベース', 'サーバー状態管理はクライアント側の取得・同期ロジックであり、データを永続化するDBそのものではありません。'),
    ],
    relatedCategoryIds: ['state-management-library', 'database'],
  },
  {
    id: 'schema-validation-library',
    name: 'スキーマバリデーションライブラリ',
    aliases: ['Schema Validation Library', 'Runtime Validation'],
    parentCategoryId: 'library',
    summary: 'データが期待する形と値を満たすか実行時に検証するライブラリ。',
    description:
      'TypeScriptの型チェックだけでは検証できない、API入力やJSONなど実行時データの形をスキーマとして定義し、検証や変換を行います。',
    role: '外部から入るデータの形と値を安全に確認する',
    useCases: ['APIリクエストを検証する', '環境変数や設定をチェックする', '入力を型付きデータへ変換する'],
    differences: [
      difference('プログラミング言語の型', '静的型は主に開発時、スキーマ検証は実行時に実際の値を検証します。'),
      difference('リンター', 'リンターはソースコードの問題を検出し、バリデータは実行時データの内容を検証します。'),
    ],
    relatedCategoryIds: ['programming-language', 'linter'],
  },
  {
    id: 'orm',
    name: 'ORM',
    aliases: ['Object Relational Mapper', 'Database Toolkit'],
    parentCategoryId: 'library',
    summary: 'アプリケーションコードと主にリレーショナルデータベースの間を橋渡しする仕組み。',
    description:
      'テーブルやクエリを、型やオブジェクト/モデルを通じてアプリから扱いやすくします。SQLを完全に隠すものから、SQLに近い操作感を重視するものまで設計はさまざまです。',
    role: 'アプリのデータモデルとDB操作を接続する',
    useCases: ['型付きでCRUDを実装する', 'スキーマとアプリモデルを同期する', 'クエリやマイグレーションを管理する'],
    differences: [
      difference('データベース', 'ORMはDBそのものではなく、アプリケーションからDBへアクセスするソフトウェア層です。'),
      difference('スキーマバリデーションライブラリ', 'ORMは永続DBとの読み書き、バリデータは入力データの形の検証が中心です。'),
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
      'OAuthプロバイダとの連携、トークンやセッションの処理、認証情報の検証など、認証に必要な機能をアプリの設計に合わせて組み合わせます。',
    role: 'アプリへ認証機能を組み込むための部品を提供する',
    useCases: ['OAuthログインを追加する', 'セッションやトークンを検証する', '認証フローをアプリに合わせて構成する'],
    differences: [
      difference('認証フレームワーク', '認証ライブラリは部品、認証フレームワークは認証に関わるアプリ全体の流れや規約も提供します。'),
      difference('認証サービス', '認証サービスは外部マネージドバックエンド、ライブラリは自分のアプリ内で使うコードです。'),
    ],
    relatedCategoryIds: ['auth-framework', 'auth-service'],
  },
  {
    id: 'ui-component-system',
    name: 'UIコンポーネントシステム',
    aliases: ['UI Component System', 'Component System'],
    summary: '再利用可能なUIコンポーネントと、その配布・組み込み・カスタマイズの仕組み。',
    description:
      '見た目と操作のパターンをコンポーネントとして揃え、プロジェクトへ取り込む方法や、デザイントークン・アクセシビリティ方針まで含めてUIを一貫させます。',
    role: 'UI部品の設計・配布・カスタマイズを統一する',
    useCases: ['チームでUIパターンを共有する', 'アクセシブルな部品を再利用する', 'プロジェクトのデザインに合わせて部品を拡張する'],
    differences: [
      difference('UIライブラリ', 'UIライブラリは描画モデルやコンポーネントAPIが中心、UIコンポーネントシステムは部品の所有・配布・設計規約まで含みます。'),
      difference('CSSフレームワーク', 'CSSフレームワークはスタイルの基盤、コンポーネントシステムは操作可能なUI部品のまとまりです。'),
    ],
    relatedCategoryIds: ['ui-library', 'css-framework'],
  },
  {
    id: 'build-tool',
    name: 'ビルドツール',
    aliases: ['Build Tool', 'Bundler', '開発ツール'],
    summary: 'ソースコードの変換、開発サーバー、バンドル、本番ビルドを担うツール。',
    description:
      'TypeScriptやJSXの変換、依存のバンドル、開発中のHMR、本番向けの最適化など、コードを実行・配布できる形にする工程を管理します。',
    role: 'ソースコードを開発・配布可能な成果物へ変換する',
    useCases: ['開発サーバーとHMRを使う', '本番向けバンドルを生成する', 'フレームワークやCSSの変換を統合する'],
    differences: [
      difference('パッケージマネージャ', 'パッケージマネージャは依存を取得・解決し、ビルドツールはソースを変換・バンドルします。'),
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
      'データを保存するだけでなく、検索、更新、整合性、同時実行などを扱います。データモデルやアクセス方法によってRDB、ドキュメントデータベース、オブジェクトデータベースなどに分かれます。',
    role: 'アプリケーションデータを検索・更新可能な形で永続化する',
    useCases: ['ユーザーや注文などの業務データを保存する', '条件検索や集計を行う', '制約でデータ整合性を保つ'],
    differences: [
      difference('オブジェクトストレージ', 'データベースは検索・更新する構造化データ、オブジェクトストレージは画像や動画などのファイル保存が中心です。'),
      difference('ストレージ', 'ストレージは保存基盤全般、データベースはデータモデルと問い合わせ機能を持つ保存システムです。'),
    ],
    relatedCategoryIds: ['relational-database', 'document-database', 'object-database', 'storage'],
  },
  {
    id: 'relational-database',
    name: 'リレーショナルデータベース（RDB）',
    aliases: ['RDB', 'Relational Database'],
    parentCategoryId: 'database',
    summary: 'テーブル、行、列、関係、SQL、制約を中心に扱うデータベース。',
    description:
      'データを表形式で管理し、テーブル間の関係を定義しながらSQLで問い合わせます。トランザクションや制約により、複数データの整合性を保ちやすいのが特徴です。',
    role: '関係のある構造化データを整合性付きで管理する',
    useCases: ['業務データを正規化して保存する', '複数テーブルを結合して検索する', 'トランザクションで複数更新をまとめる'],
    differences: [
      difference('ドキュメントデータベース', 'RDBはテーブルと関係を中心に設計し、ドキュメントDBはドキュメント単位の構造を中心に設計します。'),
      difference('オブジェクトデータベース', 'RDBは表とSQL、オブジェクトDBはプログラミング言語のオブジェクトを直接永続化する考え方です。'),
    ],
    relatedCategoryIds: ['database', 'document-database', 'object-database', 'orm'],
  },
  {
    id: 'document-database',
    name: 'ドキュメントデータベース',
    aliases: ['Document Database', 'NoSQL'],
    parentCategoryId: 'database',
    summary: 'JSONに近いドキュメント単位でデータを保存するデータベース。',
    description:
      '行と列の表よりも、入れ子を含むドキュメントを単位にデータをモデル化します。データの形を柔軟に変えやすい一方、関係や整合性の設計は製品と用途に応じて考える必要があります。',
    role: 'ドキュメント中心のデータモデルで柔軟にデータを扱う',
    useCases: ['JSONに近いデータを保存する', 'ドキュメント単位で読み書きする', '変化する属性を持つデータを扱う'],
    differences: [
      difference('RDB', 'ドキュメントDBはドキュメントとコレクションを中心に扱い、RDBはテーブル・関係・SQLを中心に扱います。'),
      difference('オブジェクトデータベース', 'ドキュメントDBはJSONに近いデータ形式、オブジェクトDBは言語のオブジェクトモデルを永続化する仕組みです。'),
    ],
    relatedCategoryIds: ['database', 'relational-database', 'object-database'],
  },
  {
    id: 'object-database',
    name: 'オブジェクトデータベース（OODBMS）',
    aliases: ['Object Database', 'OODBMS'],
    parentCategoryId: 'database',
    summary: 'プログラミング言語のオブジェクトを直接的に永続化する考え方のデータベース。',
    description:
      'オブジェクトの識別情報、型、関係などを保ったまま永続化し、アプリのオブジェクトモデルとの距離を小さくします。RDBのテーブルへマッピングするORMとは異なるアプローチです。',
    role: 'アプリケーションオブジェクトを中心にデータを永続化する',
    useCases: ['複雑なオブジェクトグラフを保存する', '組み込み環境でオブジェクトを扱う', '言語モデルに近い永続化を行う'],
    differences: [
      difference('RDB', 'オブジェクトDBはオブジェクトを中心に扱い、RDBはテーブル・関係・SQLを中心に扱います。'),
      difference('オブジェクトストレージ', 'オブジェクトDBのオブジェクトは検索可能なプログラムデータ、オブジェクトストレージのオブジェクトはファイルです。'),
    ],
    relatedCategoryIds: ['database', 'relational-database', 'object-storage'],
  },
  {
    id: 'storage',
    name: 'ストレージ',
    aliases: ['Storage'],
    summary: 'ファイルやバイナリデータなどを保存する広い概念。',
    description:
      'データを保持する仕組み全般を指し、ファイル、バイナリデータ、ブロック、データベースなど目的によって形が異なります。何をどの粒度で検索・更新するかによって適切な種類を選びます。',
    role: 'データを失わずに保持する保存基盤を提供する',
    useCases: ['ファイルや画像を保存する', 'バックアップやアーカイブを保持する', 'データベースなどの永続層を選ぶ'],
    differences: [
      difference('データベース', 'ストレージは保存の総称、データベースは構造化データを問い合わせるための仕組みです。'),
      difference('オブジェクトストレージ', 'オブジェクトストレージはストレージの一種で、ファイルやバイナリデータをオブジェクトとして保存します。'),
    ],
    relatedCategoryIds: ['database', 'object-storage'],
  },
  {
    id: 'object-storage',
    name: 'オブジェクトストレージ',
    aliases: ['Object Storage', 'Blob Storage'],
    parentCategoryId: 'storage',
    summary: '画像、PDF、動画、バックアップなどのファイルやバイナリデータをオブジェクトとして保存するストレージ。',
    description:
      'オブジェクトに識別子とメタデータを付けて保存し、HTTP APIなどで取得します。大きなバイナリデータの配信や保管に向き、業務データの複雑な検索は通常データベースが担当します。',
    role: 'ファイルやバイナリデータを耐久性のあるオブジェクトとして保存・配信する',
    useCases: ['画像・動画・PDFを保存する', 'ユーザーアップロードを管理する', 'バックアップや静的アセットを保管する'],
    differences: [
      difference('データベース', 'オブジェクトストレージはファイルの取得が中心で、複雑な条件検索やトランザクションを行うDBとは目的が異なります。'),
      difference('オブジェクトデータベース', 'オブジェクトストレージのオブジェクトはファイル、オブジェクトDBのオブジェクトはプログラムのデータモデルです。'),
    ],
    relatedCategoryIds: ['storage', 'database'],
  },
  {
    id: 'auth-service',
    name: '認証サービス',
    aliases: ['Authentication Service', 'Managed Auth'],
    summary: '認証基盤をマネージドサービスとして外部サービスが提供するもの。',
    description:
      'ユーザー登録、認証情報検証、識別情報プロバイダ連携などの認証基盤をサービスとして利用します。アプリはSDKやAPIを通じて接続し、運用の多くをサービス側へ委ねます。',
    role: '認証バックエンドの運用を外部マネージドサービスへ委譲する',
    useCases: ['短期間でログイン機能を導入する', '複数の識別情報プロバイダを扱う', '認証基盤の運用負担を減らす'],
    differences: [
      difference('認証フレームワーク', '認証サービスは外部の運用済みバックエンド、認証フレームワークはアプリへ組み込むコードの枠組みです。'),
      difference('認証ライブラリ', '認証ライブラリは自分のコードで使う部品、サービスはユーザー情報や認証処理を外部で管理します。'),
    ],
    relatedCategoryIds: ['auth-framework', 'auth-library'],
  },
  {
    id: 'testing',
    name: 'テスト',
    aliases: ['Testing', 'Software Test'],
    summary: 'ソフトウェアが期待通り動くことを確認する仕組み全般。',
    description:
      '小さな関数からユーザーの一連の操作まで、異なる粒度で期待する振る舞いを検証します。テストは品質を保証する一回の作業ではなく、変更時に安全を確認する仕組みです。',
    role: '変更による不具合を早く発見し、期待する振る舞いを守る',
    useCases: ['関数やコンポーネントの振る舞いを検証する', 'APIや複数モジュールの連携を検証する', 'ブラウザでユーザーフローを確認する'],
    differences: [
      difference('リンター', 'テストは実行した振る舞いを確認し、リンターはソースコードの静的な問題を検出します。'),
      difference('E2Eテストフレームワーク', 'テストは目的の総称、E2Eフレームワークはブラウザを含むユーザーフローを実行する具体的な道具です。'),
    ],
    relatedCategoryIds: ['test-framework', 'e2e-test-framework', 'code-quality'],
  },
  {
    id: 'test-framework',
    name: 'テストフレームワーク',
    aliases: ['Test Framework', 'Unit Test Framework'],
    parentCategoryId: 'testing',
    summary: '単体・統合テストを記述・実行するためのフレームワーク。',
    description:
      'テストケースの定義、アサーション、フィクスチャ、モック、実行・報告などを提供します。通常はブラウザを完全に操作するより、関数やモジュール単位の検証に向きます。',
    role: 'コードの期待する振る舞いを自動テストとして実行する',
    useCases: ['関数の入出力を検証する', 'コンポーネントやモジュールの連携を検証する', 'CIで高速な回帰テストを実行する'],
    differences: [
      difference('E2Eテストフレームワーク', 'テストフレームワークはコード単位が中心、E2Eは実際のブラウザとユーザーフロー全体を対象にします。'),
      difference('リンター', 'テストフレームワークはコードを実行して結果を確認し、リンターは実行せず静的解析します。'),
    ],
    relatedCategoryIds: ['testing', 'e2e-test-framework', 'linter'],
  },
  {
    id: 'e2e-test-framework',
    name: 'E2Eテストフレームワーク',
    aliases: ['E2E Test Framework', 'End-to-end Testing'],
    parentCategoryId: 'testing',
    summary: 'ブラウザを操作し、ユーザーフロー全体をテストするためのフレームワーク。',
    description:
      'ページ遷移、入力、クリック、ネットワークや表示結果などを、ユーザーに近い経路で検証します。実環境に近い分、単体テストより実行コストが高くなります。',
    role: 'アプリケーションをユーザー視点の一連の操作で検証する',
    useCases: ['ログインから購入までのフローを確認する', '複数ブラウザエンジンで表示を検証する', '重要な画面遷移を回帰テストする'],
    differences: [
      difference('テストフレームワーク', 'E2Eはブラウザや外部サービスを含む全体フロー、通常のテストフレームワークは関数やモジュールの検証が中心です。'),
      difference('ブラウザ', 'E2Eフレームワークはブラウザを操作・制御するテスト道具で、ブラウザ自体は実行環境です。'),
    ],
    relatedCategoryIds: ['testing', 'test-framework', 'web-hosting'],
  },
  {
    id: 'code-quality',
    name: 'コード品質',
    aliases: ['Code Quality'],
    summary: '可読性、一貫性、問題検出、保守性向上に関わるツール群。',
    description:
      '静的解析、整形、型検査、統合ツールチェーンなどを組み合わせ、個人の注意力だけに頼らずコードの品質基準を保ちます。',
    role: 'コードの問題を早期に見つけ、一貫した保守性を保つ',
    useCases: ['コミット前に問題を検出する', '整形を自動適用する', 'CIで品質基準を検査する'],
    differences: [
      difference('テスト', 'コード品質ツールは静的な規則や形式を確認し、テストは実行時の振る舞いを確認します。'),
      difference('統合ツールチェーン', 'コード品質は目的の分類、統合ツールチェーンは静的解析や整形などをまとめて提供する具体的な形です。'),
    ],
    relatedCategoryIds: ['linter', 'formatter', 'integrated-toolchain', 'testing'],
  },
  {
    id: 'linter',
    name: 'リンター',
    aliases: ['Linter', 'Static Analysis'],
    parentCategoryId: 'code-quality',
    summary: '静的解析により問題やコーディングルール違反を検出するもの。',
    description:
      'ソースコードを解析し、バグにつながりやすい記述、未使用変数、プロジェクト固有の規則違反などを指摘します。必ずしもコードを自動修正するものではありません。',
    role: 'コードの潜在的な問題と規約違反を検出する',
    useCases: ['危険なパターンを検出する', 'チームのコーディングルールを揃える', 'CIで違反をブロックする'],
    differences: [
      difference('フォーマッター', 'リンターは意味や品質上の問題を指摘し、フォーマッターは見た目の形式を整えます。'),
      difference('テスト', 'リンターはコードを静的解析し、テストはコードを実行して振る舞いを確認します。'),
    ],
    relatedCategoryIds: ['code-quality', 'formatter', 'test-framework'],
  },
  {
    id: 'formatter',
    name: 'フォーマッター',
    aliases: ['Formatter', 'Code Formatter'],
    parentCategoryId: 'code-quality',
    summary: 'コードの見た目を自動的に統一するもの。',
    description:
      'インデント、改行、引用符など、機能に影響しない形式を機械的に整えます。レビューで議論する対象をロジックへ集中させることが目的です。',
    role: 'コードの形式を自動整形し、無用な差分を減らす',
    useCases: ['保存時にコードを整形する', 'チームで同じ整形を適用する', 'CIで整形違反を検出する'],
    differences: [
      difference('リンター', 'フォーマッターは見た目の形式を整え、リンターは潜在的な問題や規則違反を検出します。'),
      difference('統合ツールチェーン', 'フォーマッターは一つの役割、統合ツールチェーンはフォーマッターやリンターなど複数の役割をまとめます。'),
    ],
    relatedCategoryIds: ['code-quality', 'linter', 'integrated-toolchain'],
  },
  {
    id: 'integrated-toolchain',
    name: '統合ツールチェーン',
    aliases: ['Integrated Toolchain', 'Toolchain'],
    parentCategoryId: 'code-quality',
    summary: '静的解析、整形など複数の役割を一つのツールチェーンで提供するもの。',
    description:
      'コード品質に関わる複数の機能を同じ設定や実行基盤でまとめます。個別ツールの組み合わせより導入が単純になる場合がありますが、既存設定との互換性は確認が必要です。',
    role: '品質検査と整形の実行方法・設定を統合する',
    useCases: ['静的解析と整形を一つのCLIで実行する', 'プロジェクト設定を簡素化する', 'CIの品質チェックを標準化する'],
    differences: [
      difference('リンター', '統合ツールチェーンはリンターを含む場合がありますが、静的解析だけに限定されません。'),
      difference('フォーマッター', '統合ツールチェーンはフォーマッターを含む場合がありますが、形式整形だけを目的としません。'),
    ],
    relatedCategoryIds: ['code-quality', 'linter', 'formatter'],
  },
  {
    id: 'version-control',
    name: 'バージョン管理',
    aliases: ['Version Control', 'VCS'],
    summary: 'ソースコードの変更履歴、ブランチ、マージなどを管理する仕組み。',
    description:
      '誰がいつ何を変更したかを記録し、並行開発、差分確認、過去状態への復元を可能にします。分散型では各開発者が履歴の複製を持ちます。',
    role: 'コードの履歴と複数人の変更を安全に管理する',
    useCases: ['変更をコミットする', 'ブランチで機能を分離する', 'マージやレビューで変更を統合する'],
    differences: [
      difference('開発プラットフォーム', 'バージョン管理は履歴を扱う仕組み、開発プラットフォームはリポジトリホスティングやIssue・PRなど周辺機能を提供します。'),
      difference('CI/CD', 'バージョン管理は変更を記録し、CI/CDはその変更を契機にビルドやデプロイを自動化します。'),
    ],
    relatedCategoryIds: ['development-platform', 'ci-cd'],
  },
  {
    id: 'development-platform',
    name: '開発プラットフォーム',
    aliases: ['Development Platform', 'Code Hosting'],
    summary: 'リポジトリホスティング、Issue、PR、レビュー、自動化など開発全体を支援するプラットフォーム。',
    description:
      'コードを共有するだけでなく、変更提案、レビュー、課題管理、権限、自動化など、チーム開発の協働面を提供します。',
    role: 'チームのコード共有と開発プロセスを支える',
    useCases: ['リポジトリを共有する', 'プルリクエストでレビューする', 'Issueや自動化で作業を追跡する'],
    differences: [
      difference('バージョン管理', '開発プラットフォームはGitなどの履歴をホスト・協働化するサービスであり、Gitそのものではありません。'),
      difference('CI/CD', '開発プラットフォームは開発の場全体、CI/CDはビルド・テスト・デプロイの自動化という一領域です。'),
    ],
    relatedCategoryIds: ['version-control', 'ci-cd'],
  },
  {
    id: 'ci-cd',
    name: 'CI/CD',
    aliases: ['Continuous Integration', 'Continuous Delivery', 'Continuous Deployment'],
    summary: 'ビルド、テスト、デプロイなどを自動化する仕組み。',
    description:
      'コード変更を契機に依存インストール、品質検査、テスト、成果物作成、環境への配布などを再現可能なワークフローとして実行します。',
    role: '変更の検証と配布を自動化し、手作業の差を減らす',
    useCases: ['プルリクエストごとにテストを実行する', 'mainへの変更をデプロイする', '定期的な品質・セキュリティチェックを動かす'],
    differences: [
      difference('バージョン管理', 'バージョン管理は変更履歴を保持し、CI/CDはその変更を契機に処理を自動実行します。'),
      difference('アプリケーションプラットフォーム', 'CI/CDは自動化ワークフロー、アプリケーションプラットフォームはアプリをビルド・実行・公開する基盤です。'),
    ],
    relatedCategoryIds: ['version-control', 'development-platform', 'deployment-platform'],
  },
  {
    id: 'container',
    name: 'コンテナ',
    aliases: ['Container', 'Containerization'],
    summary: 'アプリケーションとランタイム・依存関係・環境をまとめ、一貫した実行環境を作る仕組み。',
    description:
      'アプリと必要なファイル・設定をイメージとしてまとめ、隔離された処理として実行します。仮想マシンより軽量になりやすい一方、ホストカーネルを共有するなど性質が異なります。',
    role: '実行環境の差を減らし、再現可能な配布単位を作る',
    useCases: ['開発と本番の環境を揃える', '依存をイメージに固定する', '複数サービスを分離して運用する'],
    differences: [
      difference('仮想マシン', 'コンテナは通常ホストカーネルを共有する処理隔離、VMはゲストOSを含む仮想化です。'),
      difference('アプリケーションプラットフォーム', 'コンテナは実行単位のパッケージ化、プラットフォームはビルド・デプロイ・ランタイムなどの運用基盤です。'),
    ],
    relatedCategoryIds: ['runtime', 'application-platform'],
  },
  {
    id: 'deployment-platform',
    name: 'デプロイ基盤',
    aliases: ['Deployment Platform', 'Deployment Infrastructure'],
    summary: 'Webアプリケーションを公開・実行するプラットフォームやインフラの総称。',
    description:
      '成果物をどこへ置き、どのランタイムで実行し、どのURLへ配信するかというデプロイの土台を指します。アプリケーションプラットフォーム、サーバーレスランタイム、ホスティングなど複数の形があります。',
    role: 'アプリケーションを利用可能な環境へ届ける',
    useCases: ['ビルド成果物を公開する', 'サーバー側コードを実行する', 'プレビューや本番環境を分ける'],
    differences: [
      difference('CI/CD', 'デプロイ基盤はアプリを実行・公開する場所、CI/CDはそこへ届ける自動ワークフローです。'),
      difference('Webホスティング', 'Webホスティングは主にWeb資産の配信、デプロイ基盤はサーバーレス実行やアプリケーションプラットフォームまで含む広い概念です。'),
    ],
    relatedCategoryIds: ['application-platform', 'serverless-runtime', 'web-hosting', 'ci-cd'],
  },
  {
    id: 'application-platform',
    name: 'アプリケーションプラットフォーム',
    aliases: ['Application Platform', 'App Platform'],
    parentCategoryId: 'deployment-platform',
    summary: 'ビルド、デプロイ、ランタイム、プレビューなどを統合して提供するプラットフォーム。',
    description:
      'アプリケーションをビルドして環境へ配置し、必要なランタイムやプレビューURL、ログなどをまとめて扱えるようにします。利用者はサーバーの細部を管理せずに運用できます。',
    role: 'Webアプリのビルドから実行・公開までを統合する',
    useCases: ['Git pushからプレビューを作る', 'フロントエンドとサーバー処理をデプロイする', '環境変数やランタイムを管理する'],
    differences: [
      difference('Webホスティング', 'アプリケーションプラットフォームはビルドやサーバー側ランタイムも扱い、ホスティングは主に静的Web資産の配信に集中します。'),
      difference('サーバーレス実行基盤', 'アプリケーションプラットフォームはデプロイ・プレビュー・ホスティングなどを含む統合層、サーバーレスランタイムはコードを実行する層です。'),
    ],
    relatedCategoryIds: ['deployment-platform', 'web-hosting', 'serverless-runtime'],
  },
  {
    id: 'serverless-runtime',
    name: 'サーバーレス実行基盤',
    aliases: ['Serverless Runtime', 'Edge Runtime'],
    parentCategoryId: 'deployment-platform',
    summary: 'サーバーマシンを直接管理せず、コードを実行できる基盤。',
    description:
      'インフラのプロビジョニングや常駐サーバーの管理を抽象化し、リクエストやイベントに応じてサーバー側コードを実行します。実行時間や利用可能APIなどの制約は基盤ごとに異なります。',
    role: '運用サーバーを意識せずサーバー側処理を実行する',
    useCases: ['APIエンドポイントを公開する', 'イベント-駆動な処理を実行する', 'エッジに近い場所でリクエストを処理する'],
    differences: [
      difference('ランタイム', 'サーバーレスランタイムはデプロイ・スケーリング・実行制約まで含む提供形態、ランタイムはコードを動かす環境という一般概念です。'),
      difference('Webホスティング', 'サーバーレスランタイムはコード実行、ホスティングはHTMLやアセット配信が中心です。'),
    ],
    relatedCategoryIds: ['deployment-platform', 'runtime', 'web-api-framework'],
  },
  {
    id: 'web-hosting',
    name: 'Webホスティング',
    aliases: ['Web Hosting', 'Static Hosting'],
    parentCategoryId: 'deployment-platform',
    summary: 'HTML、CSS、JS、静的アセットなどを配信し、Webサイトを公開する基盤。',
    description:
      'ビルド済みのWeb資産をCDNなどから配信し、ドメインやHTTPSと組み合わせてブラウザから利用可能にします。サーバー側コードの実行を含むかはサービスによって異なります。',
    role: 'Webサイトと静的資産をブラウザへ配信する',
    useCases: ['静的サイトを公開する', 'SPAのビルド成果物を配信する', 'アセットをCDN経由で届ける'],
    differences: [
      difference('サーバーレス実行基盤', 'ホスティングは資産の配信、サーバーレスランタイムはリクエストに応じたサーバー側コードの実行が中心です。'),
      difference('アプリケーションプラットフォーム', 'ホスティングは配信に集中し、アプリケーションプラットフォームはビルド・ランタイム・プレビューなどより広い機能を統合します。'),
    ],
    relatedCategoryIds: ['deployment-platform', 'application-platform', 'serverless-runtime'],
  },
];
