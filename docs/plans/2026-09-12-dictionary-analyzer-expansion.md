# Dictionary拡充・Analyzer対応・Mapレスポンシブ計画

- 作成日: 2026-09-12
- 状態: **採用した静的形式の実装完了**。最終の修正・検証は単独で実施。[94件台帳](2026-09-12-dictionary-analyzer-acceptance.md)と[最終確認結果](2026-09-12-dictionary-analyzer-final-review.md)を参照。未測定の実機・性能項目は最終結果で区別する。
- 実装開始基準: `34551af`。変更は作業ツリーへ保存済み、commit/deployは未実施。
- 対象: DictionaryのMap / Categories / Stacks、新規技術のAnalyzer検出・解析・投影・表示。
- 作成時の実施範囲は計画書の保存のみ。後続の指示で全P0〜P7のアプリ・データ・CSS・テスト実装へ移行した。以下の要件は引き続き対象の正本とする。

## 1. 要件と対象件数

1. Analyzerが認識している技術のDictionary不足を補い、主要技術・CDNも追加する。
2. **TSX、JSX、Firebaseエミュレーターは、それぞれ独立Stackとして登録する。**
3. 新規StackのAnalyzer不足を埋める。Dictionary掲載・依存名の認識だけを専用解析対応と扱わない。
4. Analyzer各タブで、技術の所属・接続・ブロック配置・2D/3D・通常/全画面を考慮する。
5. Dictionary Mapに全追加項目を掲載し、画面サイズ別に読みやすく操作できるようにする。
6. 既存Stack / Categoryの説明と関連リンクも更新する。

現在48 Stack / 43 Category。前回案91 Stackに指定3件を加え、**新規94 Stack、合計142 Stack**。前回案7 Categoryに構文拡張・ローカルエミュレーターを加え、**新規9 Category、合計52 Category**。第4章の台帳を対象の正本とする。段階ごとの完了を全体完了と取り違えない。

## 2. 確認した現状と境界

| 現在の実装 | 計画上の扱い |
| --- | --- |
| stacks.ts / categories.tsが正規本文、map.tsは参照IDの木 | 本文を複製せず、既存ID/URLを維持。全項目をMapに1回ずつ掲載 |
| CategoryDetailはstacksForCategoryで所属技術を取得 | CategoryへのStack名手動追記は不要 |
| relatedStackIdsとrelationshipsは独立 | 回遊・比較リンクと方向のある技術関係を分ける |
| packageNamesがAnalyzerの照合にも使われる | 識別子追加は検出結果への影響も検証 |
| dictionaryGroups.tsの5グループが3タブ共通 | 新最上位Categoryの所属を同時更新 |
| Module Dependencyの拡張子はJS/TS系 | 多言語の構文木解析と、多言語module依存の対応を区別 |
| .jsxにTSX grammarを再利用 | grammar IDとユーザー向けJSX/TSX IDを分離 |
| Nuxt/Astroの起動scriptからWebアプリ推定 | 専用route/data解析は不足があり追加対象 |
| Mapは1100px以下で縦1列、広幅は左右mirror | 意味的構造を維持し、Mapの実効幅に対応 |

現行仕様: [Dictionary](../technical/dictionary.md)、[Analyzer](../technical/analyzer.md)、[Semantic](../technical/semantic-analyzer.md)。本計画の将来仕様で現行仕様を上書きせず、検証済みになった部分だけ反映する。

## 3. Category計画

### 新設9件

| ID案 | 名称 | 親ID | 表示グループ | 説明・比較対象 |
| --- | --- | --- | --- | --- |
| query-schema-language | クエリ・スキーマ言語 | なし | language-runtime | SQLの検索/更新/DDL、GraphQLのAPI型/問い合わせ。DB製品との違い |
| syntax-extension | 構文拡張 | programming-language | language-runtime | JSX/TSXを言語・runtime・UIライブラリと区別 |
| ui-framework | UIフレームワーク | framework | application | Web・デスクトップのUI構成と反応性 |
| key-value-store | Key-Valueストア | database | data | キーによる操作。永続性・整合性は製品別 |
| backend-platform | バックエンドサービス基盤 | deployment-platform | delivery | DB/Auth/Storage統合提供。ホスティングとの違い |
| cdn | CDN | deployment-platform | delivery | origin/edge/cache/TTL/purge。保存・実行との違い |
| web-server | Webサーバー・リバースプロキシ | deployment-platform | delivery | HTTP受付・配信・上流転送。CDNとの違い |
| container-orchestration | コンテナオーケストレーション | container | delivery | Composeの構成管理とKubernetesのcluster運用を区別 |
| local-emulator | ローカルエミュレーター | testing | quality | サービス代替の検証環境。mock・本番・runtimeとの違い |

query-schema-languageだけ新最上位。dictionaryGroups.tsのlanguage-runtimeへ登録。他8件は親グループを継承。1 Stackは主分類1つとし、他の役割は関連リンクと説明で示す。

### 既存Categoryへの追記

| 既存ID | 修正内容・追加するrelatedCategoryIds |
| --- | --- |
| programming-language | Web以外の用途。syntax-extension / query-schema-language |
| markup-language | HTMLとJSXの違い。syntax-extension |
| framework | ui-framework |
| fullstack-web-framework | Django/Rails/Laravelのserver template方式も含める。ui-framework |
| ui-library | ui-framework / syntax-extensionとの違い |
| orm | ID維持、名称を「ORM / ODM」へ。document-database / query-schema-language |
| database | 永続化必須という一律説明を修正。key-value-store |
| document-database | orm / key-value-store |
| relational-database | query-schema-language |
| deployment-platform | backend-platform / cdn / web-server |
| web-hosting | cdn / web-serverとの違い |
| object-storage | CDNのoriginになる構成。cdn |
| application-platform | backend-platformとの違い |
| auth-service | backend-platform / local-emulator |
| container | container-orchestration |
| testing | local-emulator |
| runtime | local-emulatorとの違い |
| build-tool / package-manager | Cargo/Maven/Gradle等の複数役割と主分類 |

新Categoryからも対応する既存Categoryへ関連リンクを付ける。relatedCategoryIdsへStack IDは入れない。

## 4. 新規Stack台帳（全94件）

各行の根拠は**今後実装する検出条件**を含む。「既存解析あり」も一部構文/設定への対応であり、製品全体対応を意味しない。

### 4.1 Analyzer対応プロファイル

全行で根拠付きStack Map表示・Dictionaryリンクが必須。記号を第7章の配置契約と組み合わせる。

| 記号 | 対象 | 必須対応 |
| --- | --- | --- |
| L | 言語/構文 | ソース識別、Scope、module/定義/呼び出し/データ構造、解決限界 |
| Q | query/schema | 定義/field/参照、Data Modelと明示データ操作 |
| U | UI | import/型、component、静的event/props/state/binding、必要なtemplate解析 |
| F | framework | route/handler/middleware/静的DIと所属アプリ |
| R | runtime | 実行設定/入口、Command target、Architecture実行単位属性 |
| T | tool | 依存/config/CLI、利用元Tooling、command/test。導入だけで本番runtimeを作らない |
| D | DB/ORM/validation/state | 型/model/field、操作と入出力、Runtime/Data Flow/Modelの該当関係 |
| S | service/resource | 明示設定/SDK使用、環境別identity、外部資源と操作 |
| P | 配置/CI/公開 | 宣言されたapp/service/job、build/deploy/配信関係 |
| C | CDN | providerの明示証拠、参照元/配信元/origin。関数として扱わない |
| E | emulator | Suite、service endpoint、local設定/接続、起動命令 |

### 4.2 言語・構文・schema（17件）

| Stack ID案 | 名称 | categoryId | 現状/profile | 検出・解析の根拠 | 説明の中心 / 関連先 |
| --- | --- | --- | --- | --- | --- |
| python | Python | programming-language | 構文あり/L | .py/.pyi、manifest、import/型/関数 | 汎用言語・Web/スクリプト / pip, uv, Django, FastAPI |
| java | Java | programming-language | 構文あり/L | .java、Maven/Gradle、package/import/class | JVM向け言語 / JVM, Spring, Maven |
| csharp | C# | programming-language | 構文あり/L | .cs、csproj、namespace/using | .NET向け言語 / .NET, ASP.NET Core, WPF |
| go | Go | programming-language | 構文あり/L | .go、go.mod/go.work、import | 並行処理・HTTP・CLI / Gin |
| rust | Rust | programming-language | 構文あり/L | .rs、Cargo.toml、use/mod | 所有権・system開発 / Cargo, Axum, Actix Web |
| ruby | Ruby | programming-language | 構文あり/L | .rb、Gemfile/gemspec、require | 動的言語・DSL / Rails |
| php | PHP | programming-language | 構文あり/L | .php、composer.json、namespace/use | server Web言語 / Composer, Laravel |
| c | C | programming-language | 構文あり/L | .c、compile設定/include。曖昧な.hは設定優先 | メモリ・system/組み込み / C++ |
| cpp | C++ | programming-language | 構文あり/L | .cpp/.cc/.cxx/.hpp等、compile_commands.json/include | 抽象化と資源管理 / C, Rust |
| swift | Swift | programming-language | 構文あり/L | .swift、Package.swift静的宣言/import | Apple等のアプリ向け言語 / Kotlin, Dart |
| kotlin | Kotlin | programming-language | 構文あり/L | .kt/.kts、Gradle静的宣言/import | JVM連携・アプリ開発 / Java, JVM, Gradle |
| scala | Scala | programming-language | 構文あり/L | .scala、build.sbt静的宣言/import | 関数型・OOP / Java, JVM |
| dart | Dart | programming-language | 構文あり/L | .dart、pubspec.yaml、import/export/part | clientアプリ向け言語 / Swift, Kotlin |
| sql | SQL | query-schema-language | schemaあり/Q | .sql、DDL、対象DBが明示された操作 | 検索・更新・DDLと方言 / PostgreSQL, MySQL, SQLite |
| graphql | GraphQL | query-schema-language | schemaあり/Q | .graphql/.gql、SDL、静的query/mutation/resolver | API型・問い合わせ仕様 / TypeScript, Zod |
| tsx | TSX | syntax-extension | grammar補完/L,U | .tsx、TypeScriptのjsx設定 | TypeScript内JSX、型検査と変換 / TypeScript, JSX, React |
| jsx | JSX | syntax-extension | grammar補完/L,U | .jsx、またはparserで確認したJSX構文 | JSの構文拡張。HTML/Reactとの違い / JavaScript, TSX, React |

### 4.3 アプリ・データの不足分（15件）

| Stack ID案 | 名称 | categoryId | 現状/profile | 検出・解析の根拠 | 説明の中心 / 関連先 |
| --- | --- | --- | --- | --- | --- |
| vue | Vue | ui-framework | script一部/U | vue import、.vue script/template/event/props | 反応性・component / Nuxt, Pinia, Vite |
| svelte | Svelte | ui-framework | script一部/U | svelte依存、.svelte、event/props/state | compilerを使うUI / SvelteKit, Vite |
| wpf | WPF | ui-framework | project判定/U,R | UseWPF、XAML x:Class/code-behind/event/Binding | Windows UI・XAML / .NET, C# |
| sveltekit | SvelteKit | fullstack-web-framework | route一部/F,U | @sveltejs/kit、+page/+layout/+server、load/actions | SvelteのWeb基盤 / Svelte, Vite |
| django | Django | fullstack-web-framework | route一部/F,D | PyPI django、path/re_path/include/model | Python Web/ORM/管理機能 / Python, PostgreSQL |
| ruby-on-rails | Ruby on Rails | fullstack-web-framework | route形式/F,D | Gem rails、routes/controller/Active Record | 規約・MVC・ORM / Ruby, PostgreSQL |
| laravel | Laravel | fullstack-web-framework | route形式/F,D | Composer laravel/framework、Route/controller/Eloquent | PHP Web基盤 / PHP, Composer, MySQL |
| express | Express | web-api-framework | route形式/F | npm express、Router/use/method、静的mount | Node HTTP/middleware / Node.js, Fastify, Hono |
| nestjs | NestJS | web-api-framework | decorator形式/F | @nestjs/core/common、Module/Controller/Injectable | DI/Module/HTTP / TypeScript, Express |
| fastapi | FastAPI | web-api-framework | decorator形式/F,D | fastapi、APIRouter/include_router、入出力型 | 型情報を使うAPI / Python, Pydantic |
| flask | Flask | web-api-framework | decorator形式/F | flask、route/Blueprint/register_blueprint | 小さなWeb中核と拡張 / Python, SQLAlchemy |
| aspnet-core | ASP.NET Core | web-api-framework | route形式/F | Web SDK/FrameworkReference、MapGet/controller属性 | .NET HTTP基盤 / .NET, C#, EF Core |
| gin | Gin | web-api-framework | route形式/F | github.com/gin-gonic/gin、Group/method | GoのHTTPルーター / Go |
| mongoose | Mongoose | orm | schemaあり/D | mongoose、Schema/model/CRUD | MongoDBのODM / MongoDB, Node.js |
| sequelize | Sequelize | orm | schemaあり/D | sequelize、define/Model.init/関連/CRUD | JSからRDB操作 / PostgreSQL, MySQL, SQLite |

### 4.4 基盤とエミュレーター（5件）

| Stack ID案 | 名称 | categoryId | 現状/profile | 検出・解析の根拠 | 説明の中心 / 関連先 |
| --- | --- | --- | --- | --- | --- |
| spring-framework | Spring Framework | framework | annotation形式/F,D | org.springframework座標、DI/Mapping/Bean | JVMのDI/Web基盤 / Java, JVM, Spring Boot |
| dotnet | .NET | runtime | project解析/R | csproj/TargetFramework/global.json、dotnet CLI | runtime/SDK/標準libraryを区別 / C#, WPF, ASP.NET Core |
| cloudflare-kv | Cloudflare Workers KV | key-value-store | 構成一部/S | Wrangler kv_namespaces、binding.get/put/delete | 分散KVと整合性 / Workers, Redis |
| firebase | Firebase | backend-platform | 特例検出/S | Firebase設定/SDK、project/app identity | backendサービス群 / Auth, Firestore, Storage, Hosting |
| firebase-emulator-suite | Firebase Local Emulator Suite | local-emulator | service一部/E | emulators設定、connect*Emulator、CLI emulators:* | ローカルサービス検証環境 / Firebase, Auth, Firestore, Storage |

### 4.5 主要技術（49件）

| Stack ID案 | 名称 | categoryId | 現状/profile | 検出・解析の根拠 | 説明の中心 / 関連先 |
| --- | --- | --- | --- | --- | --- |
| jvm | JVM | runtime | 新規/R | Java実行命令、JVM targetのbuild設定 | bytecode実行環境 / Java, Kotlin, Scala |
| bun | Bun | runtime | 新規/R,T | packageManager、bun.lock、bun CLI/API | JS/TS runtimeとtoolchain / Node.js, Deno |
| deno | Deno | runtime | 新規/R,T | deno.json/jsonc、imports/tasks、CLI/API | JS/TS runtimeと権限 / Node.js, Bun |
| yarn | Yarn | package-manager | 新規/T | packageManager、yarn.lock/.yarnrc.yml、workspaces | JS依存管理 / npm, pnpm |
| pip | pip | package-manager | 新規/T | pipコマンド/設定。requirementsのみでツール断定不可 | Python package導入 / Python, uv |
| uv | uv | package-manager | 新規/T | uv.lock、tool.uv、CLI | Python環境・依存管理 / Python, pip |
| cargo | Cargo | package-manager | 新規/T | Cargo.toml/lock/workspace、CLI | Rust依存・ビルド / Rust |
| composer | Composer | package-manager | 新規/T | composer.json/lock、scripts/autoload/require | PHP依存管理 / PHP, Laravel |
| nuget | NuGet | package-manager | 新規/T | PackageReference、Directory.Packages.props、NuGet設定 | .NET依存管理 / .NET, C# |
| angular | Angular | ui-framework | 新規/U,F | @angular/core、angular.json、Component/template/Router | Web UI統合基盤 / TypeScript |
| nuxt | Nuxt | fullstack-web-framework | manifest推定/F,U | nuxt依存/config、pages/server/api | VueのWeb基盤 / Vue, Vite |
| astro | Astro | fullstack-web-framework | manifest推定/F,U | astro依存/config、.astro frontmatter/pages/endpoint | content中心・islands / Vite, React, Vue |
| spring-boot | Spring Boot | framework | 新規/F,R | org.springframework.boot plugin/starter、main/annotation | 自動設定・起動支援 / Spring Framework, Java |
| fastify | Fastify | web-api-framework | route補完/F | fastify、register/route/schema/prefix | plugin/schema中心HTTP / Node.js, Express |
| axum | Axum | web-api-framework | route補完/F | crate axum、Router/route/nest/handler | Rustの型付きHTTP / Rust, Cargo |
| actix-web | Actix Web | web-api-framework | route補完/F | crate actix-web、App/service/route属性 | Rust Web基盤 / Rust, Cargo |
| bootstrap | Bootstrap | css-framework | 新規/U | bootstrap依存・解決済みCSS/JS参照。class名だけ不可 | 既成style・layout / CSS, Tailwind CSS |
| redux-toolkit | Redux Toolkit | state-management-library | 新規/U,D | @reduxjs/toolkit、slice/store/dispatch/selector | Redux状態更新 / React, Zustand |
| pinia | Pinia | state-management-library | 新規/U,D | pinia、defineStore/actions/state | Vueストア / Vue, Zustand |
| swr | SWR | server-state-library | 新規/U,D | swr、useSWR/key/fetcher/mutate | 取得dataのcache・再検証 / React, TanStack Query |
| pydantic | Pydantic | schema-validation-library | 新規/D | pydantic、BaseModel/Field/validator | Python型を使う検証 / Python, FastAPI, Zod |
| sqlalchemy | SQLAlchemy | orm | 新規/D | SQLAlchemy、Table/Declarative/Mapped/relationship/query | PythonのSQL表現・ORM / Python, PostgreSQL, SQL |
| entity-framework-core | Entity Framework Core | orm | 新規/D | Microsoft.EntityFrameworkCore、DbContext/DbSet/Fluent API | .NET model/DB操作 / .NET, SQL Server, SQLite |
| mui | MUI | ui-component-system | 新規/U | @mui/material等の明示mapping/import | React向けUI部品 / React, CSS |
| radix-ui | Radix UI | ui-component-system | 新規/U | 公式Radix package許可リスト、import/handler | UIプリミティブ / React, shadcn/ui |
| webpack | webpack | build-tool | 新規/T | webpack依存/config、entry/output、CLI | module bundle / Node.js, Vite |
| esbuild | esbuild | build-tool | 新規/T | esbuild依存、build API/CLI、entry/outdir | コード変換・bundle / TypeScript, Vite |
| maven | Maven | build-tool | 新規/T | pom.xml、modules/dependencies/plugin、mvn | Javaビルド/依存 / Java, Spring Boot |
| gradle | Gradle | build-tool | 新規/T | settings/build.gradle(.kts)、libs.versions.toml、静的task | build自動化 / Java, Kotlin |
| mariadb | MariaDB | relational-database | 新規/S | 専用driver/provider/image。mysql互換URLだけ不可 | MySQL系の独立RDB / MySQL, SQL |
| sql-server | Microsoft SQL Server | relational-database | 新規/S | driver/provider、sqlserver dialect、明示設定 | RDBとT-SQL / C#, EF Core, SQL |
| redis | Redis | key-value-store | 新規/S,D | ecosystem別SDK、endpoint、operation | data構造を持つstore / Workers KV, Node.js |
| cloud-firestore | Cloud Firestore | document-database | 新規/S,D | firebase/firestore、Admin API、collection/doc | document・同期・query / Firebase, MongoDB |
| supabase | Supabase | backend-platform | 新規/S,D | 公式SDK、supabase/config.toml、from/auth/storage | PostgreSQL中心backend / PostgreSQL, Firebase |
| clerk | Clerk | auth-service | 新規/S,D | @clerk公式SDK、provider/middleware/auth | 認証・user管理 / React, Next.js, Auth0 |
| auth0 | Auth0 | auth-service | 新規/S,D | auth0/@auth0公式SDK、domain/issuer/handler | ID連携・認証 / Clerk, Better Auth |
| jest | Jest | test-framework | 新規/T | jest依存/config/script、test/describeの所属 | JS test/mock / Vitest, TypeScript |
| pytest | pytest | test-framework | 新規/T | pytest依存/設定/command、fixture/test | Python test / Python, pip, uv |
| junit | JUnit | test-framework | 新規/T | org.junit座標、Test annotation、build task | JVM test / Java, Maven, Gradle |
| cypress | Cypress | e2e-test-framework | 新規/T | cypress依存/config/CLI/spec | E2E・component test / Playwright Test |
| gitlab | GitLab | development-platform | 新規/P | project設定/CI_SERVER_URL等。gitだけで推定不可 | repository/review / Git, GitHub, GitLab CI |
| gitlab-ci | GitLab CI/CD | ci-cd | 新規/P,T | .gitlab-ci.yml、local include、stages/needs/script | pipeline/runner / GitLab, GitHub Actions |
| docker-compose | Docker Compose | container-orchestration | 新規/P,T | compose設定、services/depends_on/ports、CLI | 複数container構成 / Docker, Kubernetes |
| kubernetes | Kubernetes | container-orchestration | 新規/P,T | apiVersion/kind、Deployment/Service/Ingress等 | cluster配置/service / Docker, Compose |
| netlify | Netlify | application-platform | 新規/P | netlify.toml、CLI/dependency、publish/functions/redirects | Web build/公開 / Vercel, Astro |
| github-pages | GitHub Pages | web-hosting | 新規/P | actions/deploy-pages等、明示publish設定 | 静的サイト公開 / GitHub, GitHub Actions |
| firebase-hosting | Firebase Hosting | web-hosting | 新規/P | firebase.json hosting/target/public/rewrite | Web資産公開・配信 / Firebase, Vite |
| nginx | NGINX | web-server | 新規/P | nginx.conf、server/location/proxy_pass/upstream | HTTP配信/proxy / Apache HTTP Server |
| apache-http-server | Apache HTTP Server | web-server | 新規/P | httpd/apache設定、VirtualHost/DocumentRoot/ProxyPass | HTTP server/module / NGINX, PHP |

### 4.6 CDN（8件）

| Stack ID案 | 名称 | categoryId | 現状/profile | 検出・解析の根拠 | 説明の中心 / 関連先 |
| --- | --- | --- | --- | --- | --- |
| cloudflare-cdn | Cloudflare CDN | cdn | 新規/C | IaCのproxied zone/record/cache設定。Workersだけ不可 | origin/cache/配信 / Workers, R2, 他CDN |
| amazon-cloudfront | Amazon CloudFront | cdn | 新規/C | Terraform/CloudFormation distribution/origin、明示URL | distribution/origin / S3, 他CDN |
| fastly-cdn | Fastly CDN | cdn | 新規/C | Fastly service IaC/export、backend/cache | 配信・purge / NGINX, 他CDN |
| google-cloud-cdn | Google Cloud CDN | cdn | 新規/C | backend bucket/serviceのenableCdn等 | load balancer/cache / Google Cloud Storage |
| akamai-ion | Akamai Ion | cdn | 新規/C | property/rule exportのIon product ID | Web配信・高速化 / 他CDN |
| bunny-cdn | bunny.net CDN | cdn | 新規/C | Pull Zone export/IaC、OriginUrl、明示URL | Pull Zone/origin / 他CDN |
| jsdelivr | jsDelivr | cdn | 新規/C | HTML/SFC/CSS/importのcdn.jsdelivr.net完全hostname | 公開package/OSS資産配信 / npm, UNPKG |
| unpkg | UNPKG | cdn | 新規/C | HTML/SFC/CSS/importのunpkg.com完全hostname | npmファイル配信 / npm, jsDelivr |

各CDNは少なくとも1つの明示設定/参照の検出経路とfixtureを実装する。IaC/HTML対応を先送りしてDictionaryのみで完了させない。provider固有schema/versionは公式資料で確定する。Akamai一般の証拠だけでIonにしない。

## 5. 説明と関連技術の編集契約

### 5.1 本文

summaryは役割を1文、descriptionは仕組み・使用場所・類似技術との違いを2〜4文。featuresは具体的機能3〜5件、useCasesは作業として3件前後、responsibilitiesは役割2〜3件を目安に、各行の説明の中心から個別に執筆する。同じひな形の語句置換で済ませない。

aliasesは正式名・一般的略称・旧称。vendor名を単一製品の判定トークンにしない。officialUrl/statusは各技術の公式資料で確認する。価格・特定version・根拠のない最速表現を基本説明に固定しない。

JSXとTSXは独立ページで相互比較する。Firebase Local Emulator Suiteは独立ページで、Suite・個別serviceの実体・本番サービスの違いを説明する。

### 5.2 既存Stackへの追記先

以下はrelatedStackIdsの追記先。技術的関係が説明できる組のみrelationshipsへkind/方向/labelを追加する。既存リンクも有効性を確認し維持する。

| 既存Stack | 新規の関連先 |
| --- | --- |
| HTML | JSX, Vue, Svelte, Angular |
| CSS | Bootstrap, Vue, Svelte |
| JavaScript | JSX, Vue, Svelte, Angular, Bun, Deno |
| TypeScript | TSX, JSX, Angular, NestJS, Bun, Deno |
| Node.js | Express, NestJS, Fastify, Bun, Deno |
| npm / pnpm | Yarn, jsDelivr, UNPKG |
| Next.js | Nuxt, SvelteKit, Astro, Clerk, Auth0 |
| Hono | Express, Fastify, NestJS |
| React | JSX, TSX, Vue, Svelte, Angular, Redux Toolkit, MUI, Radix UI |
| React DOM | JSX, TSX（構文とDOM反映の違い） |
| Tailwind CSS | Bootstrap |
| shadcn/ui | Radix UI, MUI（特定基盤を唯一必須と断定しない） |
| Zustand | Redux Toolkit, Pinia |
| TanStack Query | SWR |
| Zod | Pydantic |
| Drizzle ORM / Prisma ORM | Sequelize, SQLAlchemy, EF Core, SQL |
| PostgreSQL | SQL, SQLAlchemy, Sequelize, Supabase |
| MySQL | SQL, MariaDB, Sequelize |
| SQLite | SQL, SQLAlchemy, EF Core |
| Cloudflare D1 | SQL, Workers KV（モデル・整合性の比較） |
| MongoDB | Mongoose, Cloud Firestore |
| ObjectDB | Java, JVM |
| ObjectBox | Kotlin, Swift, Dart（公式bindingを再確認） |
| Amazon S3 | Amazon CloudFront |
| Cloudflare R2 | Cloudflare CDN |
| Backblaze B2 | Cloudflare CDN（組み合わせ条件を公式確認） |
| Google Cloud Storage | Google Cloud CDN, Firebase |
| Cloud Storage for Firebase | Firebase, Cloud Firestore, Firebase Local Emulator Suite |
| Firebase Authentication | Firebase, Firebase Local Emulator Suite, Clerk, Auth0 |
| Better Auth / Auth.js | Clerk, Auth0 |
| Vite | TSX, JSX, Vue, Svelte, Astro, webpack, esbuild |
| Vitest | Jest, Firebase Local Emulator Suite（統合テスト先） |
| Playwright Test | Cypress, Firebase Local Emulator Suite（検証環境） |
| Git | GitLab |
| GitHub | GitLab, GitHub Pages |
| GitHub Actions | GitLab CI/CD, GitHub Pages |
| Docker | Docker Compose, Kubernetes |
| Vercel | Netlify, Nuxt, Astro, SvelteKit |
| Cloudflare Workers | Workers KV, Cloudflare CDN, Bun, Deno |
| Cloudflare Pages | Netlify, GitHub Pages, Firebase Hosting, Cloudflare CDN |

React Three Fiber / Three.js / ESLint / Prettier / Biomeは今回の関連追加を必須としない。新規同士は台帳の関連先と、同カテゴリの代表比較先を設定。比較・統合が意味的に対称なら双方から辿れるようにする。

方向例: Nuxt→Vue、SvelteKit→Svelte、Spring Boot→Spring Frameworkはbuilt-on。Express→Node.js、Java→JVMはruns-on。Mongoose→MongoDBはstores-in。S3→CloudFrontはserved-by（採用する構成の説明を付ける）。CDN同士は比較リンク。既存React→Next.jsのbuilt-on等、今回接続する既存辺も方向を点検する。

## 6. Analyzer検出・解析設計

### 6.1 対応完了の定義

全94件に(1)根拠ファイル/範囲/条件と反例、(2)正規Stack IDとScopeとDictionaryリンク、(3)該当profileの解析結果/配置、(4)未解決・対応形式のcoverage、(5)宣言/設定/静的使用/観測の区別を用意する。

全Viewに架空ノードを足すことは対応ではない。CDNのData Model等は非該当。一方F/U/Dの入口・イベント・モデル等の必要な解析を、package名検出だけで完了扱いしない。

### 6.2 検出レジストリと識別子

- Dictionaryは説明の正本、検出条件はAnalyzerのregistryへ分離しstackIdで接続する。
- registry案: stackId、ecosystem別識別子、file/config/CLI条件、profile、解析adapter、Viewごとのrequired/not-applicableと理由、fixture ID。
- ecosystemはnpm/pypi/maven/nuget/cargo/composer/go/gem/dart等を区別。MavenはgroupId:artifactId、Goは完全module pathで照合。
- 既存packageNamesは当面npm互換を維持し、PyPI等の同名を混ぜない。Dictionaryにもecosystem付き識別子を表示する場合はschema/validator/UIを一緒に追加する。
- aliasは検索用が原則。正規化後の衝突を検査し、製品判定は完全識別子・解析済み構文で行う。公式namespaceでも対象package許可リストを定義する。
- 依存宣言はcanonical product1つに解決。umbrella製品の使用は別根拠。推移依存だけで直接使用にしない。

### 6.3 入力・parser

| 追加入力 | 対象範囲 |
| --- | --- |
| JS/runtime/tool | package.json、workspace、Yarn/Bun/Deno設定・lock、tool config静的部分 |
| Python | pyproject.toml、requirements限定構文、uv.lock、setup.cfg。setup.pyは実行しない |
| JVM | pom.xml、Gradle/settings/catalog、build.sbtの静的宣言。plugin/build scriptは実行しない |
| .NET | csproj/sln/slnx、Directory.Build.props、Directory.Packages.props、global.json、NuGet設定の非秘密部分、XAML |
| 他言語 | go.mod/go.work、Cargo.toml、composer.json、Gemfile/gemspec、pubspec.yaml、Package.swift静的宣言 |
| UI | .vue/.svelte/.astro/.html/.xamlの埋め込み構文・templateと元offset対応 |
| 配置/配信 | Compose/Kubernetes、GitLab CI、対象GitHub workflow、Netlify/Firebase、NGINX/Apache |
| CDN/IaC | 対象Terraform HCL/tf.json、CloudFormation YAML/JSON、provider property/zone exportの許可schema |

既存のローカル解析、秘密情報マスク、入力サイズ上限を維持する。`.env`、credentials、kubeconfig、Terraform stateは収集対象を広げない。ローカルincludeは選択root内・循環/深さ制限付き。remote include/packageを取得しない。

AST/XML/YAML/HCLによる安全な構文解析と元範囲の保持を優先。追加parser/WASMの実装・互換性・ライセンス・bundle負荷はP0で比較して確定。設定を実行せず、未評価式は未解決として残す。Bunのbinary lockは形式対応がない場合、manifest/CLI等の別の明示根拠を使う。

### 6.4 Scope・workspace・依存

- package.json固定のPackage/Script情報をecosystem/manifest path付き共通project/member/command表現へ拡張。既存IDは互換変換で維持する。
- npm/Yarn workspaces、Cargo workspace、Go work、Maven modules、Gradle include、.NET solution/project refs、uvの明示workspace等を読む。
- 単独manifestはpackage/app Scopeにはできるが、架空workspace-patternを生成しない。
- Package Dependencyは直接依存と明示project参照。lockはversion補助で、推移依存を直接辺に変えない。
- Module adapterはPython relative/import、JVM package/import、C# namespace/using/project ref、Go import/module、Rust mod/use、Ruby require、PHP use/autoload、C/C++ include、Swift import/package、Dart import/partを実装する。
- 曖昧なsymbol importはファイルへ無理に結ばない。macro include/overload等を完全コンパイラ相当と表示しない。構文拡張と基底言語でModuleFactを二重生成しない。

### 6.5 framework・データ

- get/route/modelという名前だけで製品判定せず、import/型/manifest由来を確認する。
- 各F/U/D行に、入口→handler→直接呼び出し→入出力/modelの意味のある最小fixtureを用意する。
- Vue/Svelte/Angular/Astro/WPFはtemplateとscript/code-behindの元位置を保持。静的event/props/Bindingと動的式を区別する。
- DIは登録と対象が静的に一致する範囲。runtime DI/reflectionを推測で接続しない。
- SQLAlchemy/EF Core/Pydantic/Firestoreはfield/型/関連/validation/CRUDを扱う。DBの名前しかない場合、断定的な永続化辺をData Flowに生成しない。
- TS compiler refinementはTS/JS系。別言語はadapterから共通IRへ変換し、同等の型推論を実装したと表示しない。
- Jest/pytest/JUnit/Cypressはtest suite/caseとして所属を識別し、本番入口と区別する。

### 6.6 TSX / JSXの独立対応

- Dictionaryはtsx / jsx。grammarを再利用しても表示・coverage・技術検出IDを分ける。
- .tsxはTypeScript+TSX、.jsxはJavaScript+JSXの証拠。TSXだけから別のJSX Usageまで機械的に増やさない。両形式がある場合は双方表示する。
- .js内JSXはparserで構文を確認した場合のみ。コメントや文字列のタグで検出しない。
- React採用には別のimport/runtime設定が必要。JSX=Reactという判定にしない。
- jsx設定だけなら「設定あり」、ソースがあれば「使用あり」。技術カード、ファイル、componentを区別する。

### 6.7 Firebase / Emulator

- Firebase本体、Authentication、Firestore、Storage、Hosting、Local Emulator Suiteは別canonical ID。
- firebase packageの所有者をFirebase本体へ移し、既存Auth側のpackageNamesとPRIMARY特例を同時に整合させる。Auth ID/URLは保持。
- firebase/auth、firebase/firestore等のsubpathを失う前に製品使用を解決する。firebase依存だけで全製品を追加しない。
- firebase-toolsの導入だけではemulator使用にしない。emulators設定/CLI/API接続を根拠にする。
- Suite設定からservice別構成を作れるが「実行中」としない。例: Auth Emulator · localhost:9099（接続設定）。
- identityにproduct/project/environment/endpoint/config occurrenceを保持し、localとproduction cloudを統合しない。
- connectAuthEmulator/connectFirestoreEmulator/connectStorageEmulator等のAPIを個別定義。Authだけlocalなら他サービスもlocalと推定しない。
- Commandはfirebase emulators:start→Suiteのstarts、emulators:exec→Suiteと後続test、--only→対象service。静的な命令解析であり実行しない。

### 6.8 CDN

- 各C行のschemaでprovider/distribution/zone/property/originを解析。ローカルに証拠が無い場合は未検出であり、network観測で推測しない。
- URL parserで完全hostname照合。偽装suffix、コメント、README、単なる文字列を除外。custom domainは構成対応がある場合のみproviderへ結ぶ。
- jsDelivr/UNPKGは参照元→CDN資産の使用/配信関係。未installのpackageをPackage Dependencyへ追加しない。
- CDN上のlibraryはpackage URL形式と公式製品mappingが確認できる場合のみ別Usage。
- R2/Workers/Hostingの存在だけから独立したCDN採用と推定しない。Akamai一般設定をIonと断定しない。
- 配信origin設定とrequest方向は別情報。CDN-origin関係を関数呼び出しの辺に転用しない。

## 7. Analyzerブロック配置

### 7.1 各タブ

| タブ | 配置と関係 |
| --- | --- |
| 1 Stack Map | Project→既知Scope→Stack Usage。言語/UI/ORMは実使用app/package内。build/test/CIは利用元packageのTooling、共通設定はProject Tooling。CDNは配信対象appの配信技術。対象不明ならProject配置設定Scopeに置き、実行appとしない |
| 2 Workspace Flow | 明示workspace/member/project-ref。設定→宣言→member。技術やCDNをmemberにしない。単独projectに架空patternを作らない |
| 3 Command Flow | User command→script/task→CLI→明示target。build/test/deploy/emulatorの用途を保持。共通laneと実際の並列branchを分離。未知commandは残す |
| 4 Package Dependency | 所有package→直接依存。ecosystem/dev/test scopeを明示。URL参照やDB接続をpackage依存へ変換しない |
| 5 Module Dependency | Directory/Package→Fileの既存空間構造。新言語importをadapterで解決。技術ブランドをファイル列へ混ぜない |
| 6 Runtime Flow | UI/event/route→handler→operation→resource。実行主体・使用元に所属。emulatorはlocal、CDNは明示した配信/HTTP関係だけ。静的可能性とtrace観測を区別 |
| 7 Function Call Flow | 解決できるcaller/calleeとhandler登録。CDN/package managerを架空関数にしない |
| 8 Data Flow | 入力→変換/validation/state/query→出力の証拠。CDN配信を架空model変換にしない。未解決を明示 |
| 9 Data Model | class/interface/struct/schema/table/document、field/関連。言語・ツール・CDN自体はmodelにしない |
| 10 Architecture Map | app内部のUI/API/domain、外部DB/auth/storage/CDN、開発用emulator/toolingを分離。配信/配置/ソース呼び出しのrelation classを区別 |

全技術を全タブへ出すわけではない。registryにrequired/not-applicableと理由を持たせ、必要な解析の未実装を非該当で隠さない。

### 7.2 所属・ID・2D/3D

- Dictionary CategoryはAnalyzerの実行単位ではない。CDNカテゴリを本番app内のsubsystemにしない。
- 現行のusage優先/declaration補助のScope方針を維持。source directoryだけでScopeへ昇格させない。
- 複数appで共通技術を使う場合Tab 1はScope別Usage、Tab 10の共有外部資源は安定identityがあれば1実体。この2つを混同しない。
- unknown endpoint/providerは未特定。曖昧な同名を統合しない。
- Tab 1はScope内を言語/アプリ/データ/Tooling/配信のpresentation順で安定配置。補助分類を架空Factにしない。
- Tab 10 2DではUI/API等は内部領域、DB/auth/storage/CDNは外側context帯。client→CDN→originという要求方向と、配信設定の辺を区別。
- Tab 10 3Dは同じID/親を使い、外部contextは内部構成の周囲へ。local emulatorは開発環境の領域。画面サイズで意味的親を変えない。
- Suite→個別emulatorは包含、app→endpointは使用。productionとの線は明示根拠がある場合だけ。
- 固定pixel位置ではなく既存packing/projectionに役割を入力する。検索/選択で意味layoutを再構築せず表示投影/cameraで対象を示す。
- 自動省略は表示だけで行い、検出件数・元関係・選択・経路を失わない。
- 通常/全画面でScope/selectionを保持。detail/toolbar実寸をラベル障害物にし、menuはfullscreen workspace内に置く。
- Fact/Semantic IRに役割を追加する場合、型/projector/detail/search/2D/3Dを同時更新し、既存camera/history/ID互換を維持する。

### 7.3 代表fixtureの期待配置

1. apps/webのReact TSX、services/apiのFastAPI/Pydantic、PostgreSQL: 別ScopeのUsage、Tab 10でWeb/APIは別app、DBは外部、根拠のあるHTTP/DB辺のみ。
2. JSX/TSX混在: TS/TSXとJS/JSXの独立Usage、Moduleは1ファイル1実体、componentは元ファイルへ。
3. Firebase Authだけlocal、Firestoreはcloud: Suite/Auth emulatorをlocal、Firestoreをcloudに。導入だけで両者を混ぜない。
4. S3+CloudFront: appの配信技術、Tab 10ではCDN/origin別実体。CDNをcalleeにしない。
5. HTMLからjsDelivr上Bootstrap参照: CDNとBootstrapのUsage、asset参照。package.jsonにない依存を作らない。
6. Maven multi-module+Spring Boot+JUnit: workspace member/直接依存/build-test command。JUnitは本番serviceでない。
7. Compose/Kubernetes: appへの明示対応を結合し、configごとに同一appを複製しない。未解決なら構成実体を保持。

## 8. Dictionary Mapのレスポンシブ計画

### 8.1 意味構造と幅

5グループ、中央幹と左右mirror、分類=四角/技術=円を維持。Mapの線は分類の親子関係だけで、技術同士の関係やAnalyzerの実行線は重ねない。

MapPageの外側にinline-size containerを設け、**Mapに使える幅W**で判定する。viewportだけでなくsidebar・拡大表示による幅変化に追従。以下は初期設計値で、全142件の実測検証で最終確定する。

| 利用可能幅W | レイアウト | 名称・余白・操作 |
| --- | --- | --- |
| 1200px以上 | 中央幹+左右2lane、既存group側を維持 | lane可読幅を確保、幹gap64〜84pxを目安に調整。文字を際限なく拡大しない |
| 1101〜1199px | 中間幅2lane | 長い名称を折返し、indentを調整。最小可読幅を満たさなければ切替閾値を修正 |
| 821〜1100px | 1列縦tree、mirror解除 | 5グループをorder順。見出し/余白の階層維持 |
| 621〜820px | 1列縦tree | 幹/indentを抑え名称へ幅を配分 |
| 320〜620px | mobile縦tree | 左右12〜16px、indent10〜12px目安で累積を抑制。全文折返し、touchは44px目安 |

min-width:0と折返しを使い、長い英語・日本語を行数固定やellipsisで隠さない。tooltipだけで名称を補わない。root見出し・幹・凡例を重複させない。左laneはCSS論理方向/connectorでmirrorし、文字をscaleX(-1)しない。

### 8.2 増量への対処

- 初回は全142技術を展開・到達可能にする。技術件数だけで自動的に削除しない。
- Category名の詳細リンクとは別に「技術一覧の開閉」ボタンと件数を置く。
- 「すべて折りたたむ/展開」と5グループへのジャンプを追加し、長いページを扱えるようにする。
- 開閉stateはCategory IDで共用し、2lane/1lane切替・resizeでユーザー操作を解除しない。閉じても名前/件数/開く操作を残す。
- 多数の小scroll領域を作らず、ページの縦scrollを主体にする。branch線は最後の表示項目の位置で止める。
- 左右の高さを揃えるために意味グループを並べ替えたり、短い側を引き伸ばしたりしない。
- 現行のdesktop/mobile二重treeを維持する場合、非表示側はdisplay:noneでAX/focusから外す。DOM IDはprefixで一意、stateは共通、二重イベントを避ける。
- Map内専用検索は今回の必須ではない。既存全体検索・全項目リンク・開閉・groupジャンプを完成させる。
- Categoriesも全52分類の関連/具体技術が辿れること、Stacksは142件のfilter/search/count/長名称が破綻しないことを同時確認する。

### 8.3 検証マトリクス

| 条件 | 合格基準 |
| --- | --- |
| viewport 320/360/390/430、768/820、1024/1100/1101、1280/1440/1920 | 横overflowなし。全文とconnectorが重ならず全項目操作可能 |
| container 620/621、820/821、1100/1101、1199/1200 | 境界前後でtree重複/消失なし。parent接続が正しい |
| 回転・sidebar・browser zoom200% | 実効幅へ再配置。focus/開閉の不意の喪失なし |
| 320 CSS px相当のreflow・文字拡大 | 読むための横scrollや技術名切捨てなし |
| タップ/Tab/Enter/Space | リンクと開閉が別動作。focus可視。閉じた子へTabが入らない |
| 全展開/全折畳み/個別開閉 | 件数一致、両layoutの状態一致。142件とストレス約300件で確認 |
| forced-colors/reduced-motion | marker/線/focusを識別でき、不要な拡大縮小animationなし |

実装時に各サイズのスクリーンショットとDOM実寸で確認。CSSに閾値を書いたことだけを検証済みにしない。実際のユーザーテストを行わずに実施済みと表示しない。

## 9. 実装段階と完了ゲート

以下は作成時の段階分け。実装・検証結果は冒頭リンクの最終記録を参照。

| 段階 | 作業 | 完了条件 |
| --- | --- | --- |
| P0 | 台帳/ID/公式資料/registry schema、fixture計画 | 94件にCategory/検出/配置/profile/反例。既存48件と衝突0 |
| P1 | 94本文、9Category、既存関連、Map参照 | 142/52件、全参照整合、公式URL/status確認 |
| P2 | ecosystem registry、入力parser、Scope/member/依存共通化 | npm回帰なし、各ecosystemの直接依存/所属fixture |
| P3 | TSX/JSX、多言語Module、U/F/D/R不足adapter | 該当Viewへ元位置付きの定義/入口/操作/model |
| P4 | Firebase製品分離/Suite、CDN/IaC、CI/配置adapter | local/cloud混同0、CDN8件検出、provider未特定の反例 |
| P5 | projector/detail/search/2D/3D、通常/全画面配置 | 第7章代表fixtureとprofile別配置 |
| P6 | Mapのcontainer/開閉/group移動、他Dictionary画面 | 第8章の寸法・操作検証 |
| P7 | 全体回帰、性能、現行docs更新 | 94件coverage・既存48件回帰、session契約維持 |

P3/P4は規模が大きいため言語/ecosystem/provider別の変更へ分割する。未実装を台帳から消さず、段階ごとの対応範囲を明示する。

## 10. テスト・受入条件

- Dictionary: 全142件/52分類、既存URL維持、ID一意、Map1回掲載、親子一致、参照先実在、package識別子衝突0。既存43/48固定testを計画値へ更新。
- 検出: 全94件にpositive/negative/scope fixture。コメント・曖昧alias・同名別ecosystem・推移依存だけで誤判定しない。
- 入力: malformed/dynamic/巨大/秘密/root外include/環境別設定。crashせずcoverageへ反映。
- 依存: root/member別、namespace、lock、direct/transitive、dev/test/runtime区分。
- 意味解析: 各U/F/Dの最小実例の入口・操作・型/field・元位置。名前だけ一致の誤解析を反例にする。
- 配置: Scope、external/context/local、選択/経路/identity維持。両端のある辺のみ。
- Renderer: 2D/3Dの同一対象・元関係、通常/全画面/狭幅のmenu/detail/label。
- 性能: 同じ既存大規模fixtureで解析時間/worker memory/初回Map/bundle/WASM/3D frame・heapを前後比較。必要なparserだけloadし、syntax treeを重複保持しない。
- 未成功の検証を完了扱いしない。productごとの未対応形式はregistry/coverageに残す。

fixture案: `src/analyzer/fixtures/stack-coverage/`へ自作最小fixtureをecosystem/provider別に置く。対応台帳に全94 IDとfixtureを列挙し、Dictionary対象集合との一致を検証する。内部処理の写しではなく、結果・所属・関係・反例をテストする。

## 11. 変更対象ファイルの予定

| 領域 | 予定ファイル |
| --- | --- |
| Dictionaryデータ | src/data/stacks.ts、categories.ts、map.ts、dictionaryGroups.ts |
| schema/識別子/validation | src/types/dictionary.ts、src/data/index.ts、validateDictionary.ts、対応test |
| Map UI | src/components/map/StackMap.tsx、src/pages/MapPage.tsx、src/styles.css |
| 他Dictionary UI | CategoryDetail/Table、StackDetail/Table、search、必要な識別子表示 |
| Analyzer入力/Fact | fileDiscovery、parsers、scan、types、moduleResolver、commandParser/Targets |
| 新adapter | Analyzer registry/manifest/provider/language adapter群。具体的分割はP0で確定 |
| Semantic | languages、grammarAssets、analyze、dataModels/Schemas/Flow、architecture |
| Analyzer表示 | projectors/Scope/packing、各renderer/detail/search/coverage、session互換 |
| 現行仕様 | docs/technical/dictionary.md、analyzer.md、semantic-analyzer.md、data分析/配置の関連仕様 |

## 12. 未確定事項と判断原則

未確定はparserライブラリ、provider schema版、具体的ファイル分割、レイアウトの最終寸法。**94件のDictionary追加とAnalyzer対応は対象から外さない。** 無制限な動的構成の完全解析は約束せず、各技術の明示形式を実装し、coverageとfixtureで対応範囲を示す。

CDN provider/SDK、Bun binary lock等は公式schemaを確認する。GitLab CI設定と実際のrepository所在は別主張。WPF/Angular/Vue/Svelte/Astroのtemplate解析をscript解析だけで済ませない。

計画そのものを実装済み知識として登録せず、検証済みの現行設計をtechnical docsへ反映した。Mapの既存memoryを現行container幅へ更新し、CI元範囲の再発防止だけを新規candidateとして保存した。

## 13. 参照資料

### ローカル

- [Dictionary型](../../src/types/dictionary.ts)、[Stacks](../../src/data/stacks.ts)、[Categories](../../src/data/categories.ts)、[Map](../../src/data/map.ts)、[表示グループ](../../src/data/dictionaryGroups.ts)
- [検証](../../src/data/validateDictionary.ts)、[Map描画](../../src/components/map/StackMap.tsx)、[CSS](../../src/styles.css)
- [入力](../../src/analyzer/fileDiscovery.ts)、[scan](../../src/analyzer/scan.ts)、[projectors](../../src/analyzer/projectors.ts)、[Module](../../src/analyzer/moduleResolver.ts)
- [Semantic言語](../../src/analyzer/semantic/languages.ts)、[Architecture](../../src/analyzer/semantic/architecture.ts)
- [Dictionary契約memory](../../agent-knowledge/entries/2026-08-29-dictionary-data-contract-e3526cf.md)、[Map mirror memory](../../agent-knowledge/entries/2026-08-30-dictionary-map-mirror-7c2d1a.md)。現行ソースを再確認、memoryは変更しない。

### 公式資料・候補選定の参考

- [Firebase Emulator Suite](https://firebase.google.com/docs/emulator-suite)、[設定](https://firebase.google.com/docs/emulator-suite/install_and_configure)
- [TypeScript JSX](https://www.typescriptlang.org/docs/handbook/jsx.html)、[React JSX解説](https://react.dev/learn/writing-markup-with-jsx)
- [Vue](https://vuejs.org/)、[Svelte](https://svelte.dev/)、[Spring](https://spring.io/projects/)、[Firebase](https://firebase.google.com/docs)
- [Cloudflare CDN](https://www.cloudflare.com/learning/cdn/what-is-a-cdn/)、[CloudFront](https://aws.amazon.com/documentation-overview/cloudfront/)、[Fastly](https://www.fastly.com/documentation/)
- [Google Cloud CDN](https://cloud.google.com/cdn)、[Akamai Ion](https://techdocs.akamai.com/ion/docs/welcome-ion)、[bunny CDN](https://bunny.net/cdn/)、[jsDelivr](https://www.jsdelivr.com/)、[UNPKG](https://unpkg.com/)
- [Container Queries](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries)
- [Stack Overflow 2025](https://survey.stackoverflow.co/2025/technology): 候補選定の補助。技術仕様は公式資料を根拠とする。

## 14. 実施記録

- [x] 後続の実装指示により着手。最終工程はサブエージェントなし。
- [x] 新94件・9分類と既存ID、対応fixture・registryを照合。
- [x] 採用した有限な検出・意味解析・配置・Map UIを実装。
- [x] 正式全体回帰・build・lint・型検査、代表画面確認を実施。
- [x] 現行technical docs・94件台帳・最終結果へ反映。
- [ ] 実機touch、実200%ズーム、精密browser worker heap/GPU FPS前後計測（未測定、実装残件とは分離）。
