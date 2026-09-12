# Dictionary / Analyzer 94件の採用形式・検証台帳

2026-09-12、単独実装完了時のsourceから作成。142 Stack /52 Category、新規94 /9。既存48 IDを維持。

これは有限な静的形式の受入記録であり、全API・全動的構文の対応表ではない。各行は実行可能fixtureとfamilyの意味・Scope・反例テストに接続する。対応View/非該当理由の正本はstackRegistry。新たに発見した不具合・不足はcompletion.test.ts等の正式回帰で補った。全体の実行結果、画面確認の幅と未測定項目は[最終確認結果](2026-09-12-dictionary-analyzer-final-review.md)を参照。旧外部94 JSONや停止checkpointの未完了値は本台帳より前の履歴である。

## 正式テストの読み方

familyの基本fixtureだけで完了扱いにせず、registration・data minimum/provenance・JSX value flow・build/runtime provenance・completionの追加ゲートも含めた。LのRuntimeは実main、UI/F/DのRuntimeはその製品に存在する入口/登録/操作を対象とする。CDNやツールから架空の関数・データモデルを作らない。

## Python（python）

- 分類: programming-language / profile: L
- 採用検出形式: pyproject.toml, requirements.txt, setup.cfg, py, pyi
- 意味要素: function, call, class, field, relative-import
- 必要View: stack, module, runtime, call, data-flow, data-model, architecture
- 基本fixture: coverage:python
- 検証: [ semantic/stackCoverage.test.ts ](../../src/analyzer/semantic/stackCoverage.test.ts)、[ compileHeaders.test.ts ](../../src/analyzer/compileHeaders.test.ts)、[ manifestAdapters.test.ts ](../../src/analyzer/manifestAdapters.test.ts)
- 境界: 動的importと実行時型は未解決

## Java（java）

- 分類: programming-language / profile: L
- 採用検出形式: pom.xml, build.gradle, java
- 意味要素: method, class, field, package-import
- 必要View: stack, module, runtime, call, data-flow, data-model, architecture
- 基本fixture: coverage:java
- 検証: [ semantic/stackCoverage.test.ts ](../../src/analyzer/semantic/stackCoverage.test.ts)、[ compileHeaders.test.ts ](../../src/analyzer/compileHeaders.test.ts)、[ manifestAdapters.test.ts ](../../src/analyzer/manifestAdapters.test.ts)
- 境界: overloadの完全な型解決は対象外

## C#（csharp）

- 分類: programming-language / profile: L
- 採用検出形式: *.csproj, cs
- 意味要素: method, class, field, namespace-import
- 必要View: stack, module, runtime, call, data-flow, data-model, architecture
- 基本fixture: coverage:csharp
- 検証: [ semantic/stackCoverage.test.ts ](../../src/analyzer/semantic/stackCoverage.test.ts)、[ compileHeaders.test.ts ](../../src/analyzer/compileHeaders.test.ts)、[ manifestAdapters.test.ts ](../../src/analyzer/manifestAdapters.test.ts)
- 境界: reflectionと実行時DIは未解決

## Go（go）

- 分類: programming-language / profile: L
- 採用検出形式: go.mod, go.work, go
- 意味要素: function, struct, field, module-import
- 必要View: stack, module, runtime, call, data-flow, data-model, architecture
- 基本fixture: coverage:go
- 検証: [ semantic/stackCoverage.test.ts ](../../src/analyzer/semantic/stackCoverage.test.ts)、[ compileHeaders.test.ts ](../../src/analyzer/compileHeaders.test.ts)、[ manifestAdapters.test.ts ](../../src/analyzer/manifestAdapters.test.ts)
- 境界: 動的dispatchは静的候補まで

## Rust（rust）

- 分類: programming-language / profile: L
- 採用検出形式: Cargo.toml, rs
- 意味要素: function, struct, field, mod-use
- 必要View: stack, module, runtime, call, data-flow, data-model, architecture
- 基本fixture: coverage:rust
- 検証: [ semantic/stackCoverage.test.ts ](../../src/analyzer/semantic/stackCoverage.test.ts)、[ compileHeaders.test.ts ](../../src/analyzer/compileHeaders.test.ts)、[ manifestAdapters.test.ts ](../../src/analyzer/manifestAdapters.test.ts)
- 境界: macro展開とtrait dispatchは未解決

## Ruby（ruby）

- 分類: programming-language / profile: L
- 採用検出形式: Gemfile, *.gemspec, rb
- 意味要素: method, class, field, require
- 必要View: stack, module, runtime, call, data-flow, data-model, architecture
- 基本fixture: coverage:ruby
- 検証: [ semantic/stackCoverage.test.ts ](../../src/analyzer/semantic/stackCoverage.test.ts)、[ compileHeaders.test.ts ](../../src/analyzer/compileHeaders.test.ts)、[ manifestAdapters.test.ts ](../../src/analyzer/manifestAdapters.test.ts)
- 境界: 動的requireとメタプログラミングは未解決

## PHP（php）

- 分類: programming-language / profile: L
- 採用検出形式: composer.json, php
- 意味要素: function, class, field, autoload
- 必要View: stack, module, runtime, call, data-flow, data-model, architecture
- 基本fixture: coverage:php
- 検証: [ semantic/stackCoverage.test.ts ](../../src/analyzer/semantic/stackCoverage.test.ts)、[ compileHeaders.test.ts ](../../src/analyzer/compileHeaders.test.ts)、[ manifestAdapters.test.ts ](../../src/analyzer/manifestAdapters.test.ts)
- 境界: 動的includeとclass名は未解決

## C（c）

- 分類: programming-language / profile: L
- 採用検出形式: compile_commands.json, c
- 意味要素: function, struct, field, include
- 必要View: stack, module, runtime, call, data-flow, data-model, architecture
- 基本fixture: coverage:c
- 検証: [ semantic/stackCoverage.test.ts ](../../src/analyzer/semantic/stackCoverage.test.ts)、[ compileHeaders.test.ts ](../../src/analyzer/compileHeaders.test.ts)、[ manifestAdapters.test.ts ](../../src/analyzer/manifestAdapters.test.ts)
- 境界: macro includeと曖昧な.hの言語は未解決

## C++（cpp）

- 分類: programming-language / profile: L
- 採用検出形式: compile_commands.json, cpp, cc, cxx, hpp, hxx, hh
- 意味要素: function, class, field, include
- 必要View: stack, module, runtime, call, data-flow, data-model, architecture
- 基本fixture: coverage:cpp
- 検証: [ semantic/stackCoverage.test.ts ](../../src/analyzer/semantic/stackCoverage.test.ts)、[ compileHeaders.test.ts ](../../src/analyzer/compileHeaders.test.ts)、[ manifestAdapters.test.ts ](../../src/analyzer/manifestAdapters.test.ts)
- 境界: template instantiationとmacro展開は対象外

## Swift（swift）

- 分類: programming-language / profile: L
- 採用検出形式: Package.swift, swift
- 意味要素: function, struct, field, package-import
- 必要View: stack, module, runtime, call, data-flow, data-model, architecture
- 基本fixture: coverage:swift
- 検証: [ semantic/stackCoverage.test.ts ](../../src/analyzer/semantic/stackCoverage.test.ts)、[ compileHeaders.test.ts ](../../src/analyzer/compileHeaders.test.ts)、[ manifestAdapters.test.ts ](../../src/analyzer/manifestAdapters.test.ts)
- 境界: 条件付きコンパイルの動的評価は対象外

## Kotlin（kotlin）

- 分類: programming-language / profile: L
- 採用検出形式: build.gradle.kts, kt, kts
- 意味要素: function, class, field, package-import
- 必要View: stack, module, runtime, call, data-flow, data-model, architecture
- 基本fixture: coverage:kotlin
- 検証: [ semantic/stackCoverage.test.ts ](../../src/analyzer/semantic/stackCoverage.test.ts)、[ compileHeaders.test.ts ](../../src/analyzer/compileHeaders.test.ts)、[ manifestAdapters.test.ts ](../../src/analyzer/manifestAdapters.test.ts)
- 境界: JVM以外のtargetをJVMと推定しない

## Scala（scala）

- 分類: programming-language / profile: L
- 採用検出形式: build.sbt, scala
- 意味要素: method, class, field, package-import
- 必要View: stack, module, runtime, call, data-flow, data-model, architecture
- 基本fixture: coverage:scala
- 検証: [ semantic/stackCoverage.test.ts ](../../src/analyzer/semantic/stackCoverage.test.ts)、[ compileHeaders.test.ts ](../../src/analyzer/compileHeaders.test.ts)、[ manifestAdapters.test.ts ](../../src/analyzer/manifestAdapters.test.ts)
- 境界: implicit解決とmacro展開は対象外

## Dart（dart）

- 分類: programming-language / profile: L
- 採用検出形式: pubspec.yaml, dart
- 意味要素: function, class, field, import-part
- 必要View: stack, module, runtime, call, data-flow, data-model, architecture
- 基本fixture: coverage:dart
- 検証: [ semantic/stackCoverage.test.ts ](../../src/analyzer/semantic/stackCoverage.test.ts)、[ compileHeaders.test.ts ](../../src/analyzer/compileHeaders.test.ts)、[ manifestAdapters.test.ts ](../../src/analyzer/manifestAdapters.test.ts)
- 境界: 生成コードの取得と実行は行わない

## SQL（sql）

- 分類: query-schema-language / profile: Q
- 採用検出形式: sql
- 意味要素: table, column, reference, query, mutation
- 必要View: stack, module, runtime, data-flow, data-model, architecture
- 基本fixture: coverage:sql
- 検証: [ semantic/queryCoverage.test.ts ](../../src/analyzer/semantic/queryCoverage.test.ts)
- 境界: 方言固有の動的SQLは未解決

## GraphQL（graphql）

- 分類: query-schema-language / profile: Q
- 採用検出形式: graphql, gql, graphql
- 意味要素: type, field, reference, query, mutation, resolver
- 必要View: stack, package, module, runtime, call, data-flow, data-model, architecture
- 基本fixture: coverage:graphql
- 検証: [ semantic/queryCoverage.test.ts ](../../src/analyzer/semantic/queryCoverage.test.ts)
- 境界: 動的resolver登録は未解決

## TSX（tsx）

- 分類: syntax-extension / profile: L/U
- 採用検出形式: tsconfig.json, tsx
- 意味要素: component, event, props, state, typed-field
- 必要View: stack, module, runtime, call, data-flow, data-model, architecture
- 基本fixture: coverage:tsx
- 検証: [ semantic/uiCoverage.test.ts ](../../src/analyzer/semantic/uiCoverage.test.ts)、[ semantic/jsxValueFlow.test.ts ](../../src/analyzer/semantic/jsxValueFlow.test.ts)、[ semantic/frameworkMinimum.test.ts ](../../src/analyzer/semantic/frameworkMinimum.test.ts)
- 境界: jsx変換設定だけはdeclaration；React利用は別証拠

## JSX（jsx）

- 分類: syntax-extension / profile: L/U
- 採用検出形式: jsx
- 意味要素: component, event, props, state
- 必要View: stack, module, runtime, call, data-flow, data-model, architecture
- 基本fixture: coverage:jsx
- 検証: [ semantic/uiCoverage.test.ts ](../../src/analyzer/semantic/uiCoverage.test.ts)、[ semantic/jsxValueFlow.test.ts ](../../src/analyzer/semantic/jsxValueFlow.test.ts)、[ semantic/frameworkMinimum.test.ts ](../../src/analyzer/semantic/frameworkMinimum.test.ts)
- 境界: .js内はparser確認必須；TSXからJSXを追加しない

## Vue（vue）

- 分類: ui-framework / profile: U
- 採用検出形式: vue, vue
- 意味要素: template, component, event-handler, props, state
- 必要View: stack, package, module, runtime, call, data-flow, data-model, architecture
- 基本fixture: coverage:vue
- 検証: [ semantic/uiCoverage.test.ts ](../../src/analyzer/semantic/uiCoverage.test.ts)、[ semantic/jsxValueFlow.test.ts ](../../src/analyzer/semantic/jsxValueFlow.test.ts)、[ semantic/frameworkMinimum.test.ts ](../../src/analyzer/semantic/frameworkMinimum.test.ts)
- 境界: 動的component名と式の実行結果は未解決

## Svelte（svelte）

- 分類: ui-framework / profile: U
- 採用検出形式: svelte, svelte
- 意味要素: template, component, event-handler, props, state
- 必要View: stack, package, module, runtime, call, data-flow, data-model, architecture
- 基本fixture: coverage:svelte
- 検証: [ semantic/uiCoverage.test.ts ](../../src/analyzer/semantic/uiCoverage.test.ts)、[ semantic/jsxValueFlow.test.ts ](../../src/analyzer/semantic/jsxValueFlow.test.ts)、[ semantic/frameworkMinimum.test.ts ](../../src/analyzer/semantic/frameworkMinimum.test.ts)
- 境界: 動的template式は未評価

## WPF（wpf）

- 分類: ui-framework / profile: U/R
- 採用検出形式: UseWPF, XAML, xaml
- 意味要素: x-class, code-behind, event-handler, binding, runtime-entry
- 必要View: stack, command, module, runtime, call, data-flow, data-model, architecture
- 基本fixture: coverage:wpf
- 検証: [ semantic/uiCoverage.test.ts ](../../src/analyzer/semantic/uiCoverage.test.ts)、[ semantic/jsxValueFlow.test.ts ](../../src/analyzer/semantic/jsxValueFlow.test.ts)、[ semantic/frameworkMinimum.test.ts ](../../src/analyzer/semantic/frameworkMinimum.test.ts)、[ semantic/completion.test.ts ](../../src/analyzer/semantic/completion.test.ts)
- 境界: 動的Binding pathとresource lookupは未解決

## SvelteKit（sveltekit）

- 分類: fullstack-web-framework / profile: F/U
- 採用検出形式: svelte.config.js, +page, +layout, +server, @sveltejs/kit
- 意味要素: page, endpoint, load, action, handler, template, event-handler, props, state-binding
- 必要View: stack, package, module, runtime, call, data-flow, data-model, architecture
- 基本fixture: coverage:sveltekit
- 検証: [ semantic/uiCoverage.test.ts ](../../src/analyzer/semantic/uiCoverage.test.ts)、[ semantic/jsxValueFlow.test.ts ](../../src/analyzer/semantic/jsxValueFlow.test.ts)、[ semantic/frameworkMinimum.test.ts ](../../src/analyzer/semantic/frameworkMinimum.test.ts)
- 境界: 動的route parameter値は未評価

## Django（django）

- 分類: fullstack-web-framework / profile: F/D
- 採用検出形式: urls.py, django
- 意味要素: path, include, view, model, field, query
- 必要View: stack, package, module, runtime, call, data-flow, data-model, architecture
- 基本fixture: coverage:django
- 検証: [ semantic/frameworkCoverage.test.ts ](../../src/analyzer/semantic/frameworkCoverage.test.ts)、[ semantic/frameworkMinimum.test.ts ](../../src/analyzer/semantic/frameworkMinimum.test.ts)、[ semantic/frameworkProvenance.test.ts ](../../src/analyzer/semantic/frameworkProvenance.test.ts)、[ semantic/routerRegistration.test.ts ](../../src/analyzer/semantic/routerRegistration.test.ts)、[ semantic/nativeRegistration.test.ts ](../../src/analyzer/semantic/nativeRegistration.test.ts)、[ semantic/completion.test.ts ](../../src/analyzer/semantic/completion.test.ts)
- 境界: 動的urlpatterns生成は未解決

## Ruby on Rails（ruby-on-rails）

- 分類: fullstack-web-framework / profile: F/D
- 採用検出形式: config/routes.rb, rails
- 意味要素: route, controller, active-record, field, query
- 必要View: stack, package, module, runtime, call, data-flow, data-model, architecture
- 基本fixture: coverage:ruby-on-rails
- 検証: [ semantic/frameworkCoverage.test.ts ](../../src/analyzer/semantic/frameworkCoverage.test.ts)、[ semantic/frameworkMinimum.test.ts ](../../src/analyzer/semantic/frameworkMinimum.test.ts)、[ semantic/frameworkProvenance.test.ts ](../../src/analyzer/semantic/frameworkProvenance.test.ts)、[ semantic/routerRegistration.test.ts ](../../src/analyzer/semantic/routerRegistration.test.ts)、[ semantic/nativeRegistration.test.ts ](../../src/analyzer/semantic/nativeRegistration.test.ts)、[ semantic/completion.test.ts ](../../src/analyzer/semantic/completion.test.ts)
- 境界: 動的DSLと実DBスキーマ取得は対象外

## Laravel（laravel）

- 分類: fullstack-web-framework / profile: F/D
- 採用検出形式: routes/web.php, laravel/framework
- 意味要素: route, controller, eloquent, field, query
- 必要View: stack, package, module, runtime, call, data-flow, data-model, architecture
- 基本fixture: coverage:laravel
- 検証: [ semantic/frameworkCoverage.test.ts ](../../src/analyzer/semantic/frameworkCoverage.test.ts)、[ semantic/frameworkMinimum.test.ts ](../../src/analyzer/semantic/frameworkMinimum.test.ts)、[ semantic/frameworkProvenance.test.ts ](../../src/analyzer/semantic/frameworkProvenance.test.ts)、[ semantic/routerRegistration.test.ts ](../../src/analyzer/semantic/routerRegistration.test.ts)、[ semantic/nativeRegistration.test.ts ](../../src/analyzer/semantic/nativeRegistration.test.ts)
- 境界: runtimeコンテナ解決は未評価

## Express（express）

- 分類: web-api-framework / profile: F
- 採用検出形式: express
- 意味要素: router, mount, middleware, handler, request-response
- 必要View: stack, package, module, runtime, call, data-flow, architecture
- 基本fixture: coverage:express
- 検証: [ semantic/frameworkCoverage.test.ts ](../../src/analyzer/semantic/frameworkCoverage.test.ts)、[ semantic/frameworkMinimum.test.ts ](../../src/analyzer/semantic/frameworkMinimum.test.ts)、[ semantic/frameworkProvenance.test.ts ](../../src/analyzer/semantic/frameworkProvenance.test.ts)、[ semantic/routerRegistration.test.ts ](../../src/analyzer/semantic/routerRegistration.test.ts)、[ semantic/nativeRegistration.test.ts ](../../src/analyzer/semantic/nativeRegistration.test.ts)
- 境界: 動的mount pathは未解決

## NestJS（nestjs）

- 分類: web-api-framework / profile: F
- 採用検出形式: @nestjs/core, @nestjs/common
- 意味要素: module, controller, injectable, provider, handler
- 必要View: stack, package, module, runtime, call, data-flow, data-model, architecture
- 基本fixture: coverage:nestjs
- 検証: [ semantic/frameworkCoverage.test.ts ](../../src/analyzer/semantic/frameworkCoverage.test.ts)、[ semantic/frameworkMinimum.test.ts ](../../src/analyzer/semantic/frameworkMinimum.test.ts)、[ semantic/frameworkProvenance.test.ts ](../../src/analyzer/semantic/frameworkProvenance.test.ts)、[ semantic/routerRegistration.test.ts ](../../src/analyzer/semantic/routerRegistration.test.ts)、[ semantic/nativeRegistration.test.ts ](../../src/analyzer/semantic/nativeRegistration.test.ts)
- 境界: reflectionと動的provider factoryは未解決

## FastAPI（fastapi）

- 分類: web-api-framework / profile: F/D
- 採用検出形式: fastapi
- 意味要素: router, include-router, handler, request, response-model
- 必要View: stack, package, module, runtime, call, data-flow, data-model, architecture
- 基本fixture: coverage:fastapi
- 検証: [ semantic/frameworkCoverage.test.ts ](../../src/analyzer/semantic/frameworkCoverage.test.ts)、[ semantic/frameworkMinimum.test.ts ](../../src/analyzer/semantic/frameworkMinimum.test.ts)、[ semantic/frameworkProvenance.test.ts ](../../src/analyzer/semantic/frameworkProvenance.test.ts)、[ semantic/routerRegistration.test.ts ](../../src/analyzer/semantic/routerRegistration.test.ts)、[ semantic/nativeRegistration.test.ts ](../../src/analyzer/semantic/nativeRegistration.test.ts)
- 境界: 動的依存解決は未評価

## Flask（flask）

- 分類: web-api-framework / profile: F
- 採用検出形式: flask
- 意味要素: route, blueprint, register-blueprint, handler
- 必要View: stack, package, module, runtime, call, data-flow, architecture
- 基本fixture: coverage:flask
- 検証: [ semantic/frameworkCoverage.test.ts ](../../src/analyzer/semantic/frameworkCoverage.test.ts)、[ semantic/frameworkMinimum.test.ts ](../../src/analyzer/semantic/frameworkMinimum.test.ts)、[ semantic/frameworkProvenance.test.ts ](../../src/analyzer/semantic/frameworkProvenance.test.ts)、[ semantic/routerRegistration.test.ts ](../../src/analyzer/semantic/routerRegistration.test.ts)、[ semantic/nativeRegistration.test.ts ](../../src/analyzer/semantic/nativeRegistration.test.ts)
- 境界: 動的blueprint登録は未解決

## ASP.NET Core（aspnet-core）

- 分類: web-api-framework / profile: F
- 採用検出形式: Microsoft.NET.Sdk.Web, FrameworkReference:Microsoft.AspNetCore.App, Microsoft.AspNetCore.App
- 意味要素: map-handler, controller, middleware, request-response
- 必要View: stack, package, module, runtime, call, data-flow, data-model, architecture
- 基本fixture: coverage:aspnet-core
- 検証: [ semantic/frameworkCoverage.test.ts ](../../src/analyzer/semantic/frameworkCoverage.test.ts)、[ semantic/frameworkMinimum.test.ts ](../../src/analyzer/semantic/frameworkMinimum.test.ts)、[ semantic/frameworkProvenance.test.ts ](../../src/analyzer/semantic/frameworkProvenance.test.ts)、[ semantic/routerRegistration.test.ts ](../../src/analyzer/semantic/routerRegistration.test.ts)、[ semantic/nativeRegistration.test.ts ](../../src/analyzer/semantic/nativeRegistration.test.ts)、[ semantic/completion.test.ts ](../../src/analyzer/semantic/completion.test.ts)
- 境界: runtime DIは静的登録の一致のみ

## Gin（gin）

- 分類: web-api-framework / profile: F
- 採用検出形式: github.com/gin-gonic/gin
- 意味要素: group, route, handler, request-response
- 必要View: stack, package, module, runtime, call, data-flow, architecture
- 基本fixture: coverage:gin
- 検証: [ semantic/frameworkCoverage.test.ts ](../../src/analyzer/semantic/frameworkCoverage.test.ts)、[ semantic/frameworkMinimum.test.ts ](../../src/analyzer/semantic/frameworkMinimum.test.ts)、[ semantic/frameworkProvenance.test.ts ](../../src/analyzer/semantic/frameworkProvenance.test.ts)、[ semantic/routerRegistration.test.ts ](../../src/analyzer/semantic/routerRegistration.test.ts)、[ semantic/nativeRegistration.test.ts ](../../src/analyzer/semantic/nativeRegistration.test.ts)
- 境界: 動的Group pathは未解決

## Mongoose（mongoose）

- 分類: orm / profile: D
- 採用検出形式: mongoose
- 意味要素: schema, model, field, reference, CRUD
- 必要View: stack, package, module, runtime, call, data-flow, data-model, architecture
- 基本fixture: coverage:mongoose
- 検証: [ semantic/dataCoverage.test.ts ](../../src/analyzer/semantic/dataCoverage.test.ts)、[ semantic/dataMinimum.test.ts ](../../src/analyzer/semantic/dataMinimum.test.ts)、[ semantic/dataProvenance.test.ts ](../../src/analyzer/semantic/dataProvenance.test.ts)
- 境界: 動的Schema定義は未解決

## Sequelize（sequelize）

- 分類: orm / profile: D
- 採用検出形式: sequelize
- 意味要素: define, model-init, field, association, CRUD
- 必要View: stack, package, module, runtime, call, data-flow, data-model, architecture
- 基本fixture: coverage:sequelize
- 検証: [ semantic/dataCoverage.test.ts ](../../src/analyzer/semantic/dataCoverage.test.ts)、[ semantic/dataMinimum.test.ts ](../../src/analyzer/semantic/dataMinimum.test.ts)、[ semantic/dataProvenance.test.ts ](../../src/analyzer/semantic/dataProvenance.test.ts)
- 境界: v6の明示形式；v7専用APIは未対応

## Spring Framework（spring-framework）

- 分類: framework / profile: F/D
- 採用検出形式: org.springframework:spring-context, org.springframework:spring-web, org.springframework:spring-webmvc
- 意味要素: bean, inject, mapping, handler, model
- 必要View: stack, package, module, runtime, call, data-flow, data-model, architecture
- 基本fixture: coverage:spring-framework
- 検証: [ semantic/frameworkCoverage.test.ts ](../../src/analyzer/semantic/frameworkCoverage.test.ts)、[ semantic/frameworkMinimum.test.ts ](../../src/analyzer/semantic/frameworkMinimum.test.ts)、[ semantic/frameworkProvenance.test.ts ](../../src/analyzer/semantic/frameworkProvenance.test.ts)、[ semantic/routerRegistration.test.ts ](../../src/analyzer/semantic/routerRegistration.test.ts)、[ semantic/nativeRegistration.test.ts ](../../src/analyzer/semantic/nativeRegistration.test.ts)
- 境界: 条件付きBeanの実行評価は対象外

## .NET（dotnet）

- 分類: runtime / profile: R
- 採用検出形式: *.csproj, global.json
- 意味要素: target-framework, sdk, entry
- 必要View: stack, command, runtime, architecture
- 基本fixture: coverage:dotnet
- 検証: [ toolCoverage.test.ts ](../../src/analyzer/toolCoverage.test.ts)、[ expandedCommands.test.ts ](../../src/analyzer/expandedCommands.test.ts)、[ runtimeToolProvenance.test.ts ](../../src/analyzer/runtimeToolProvenance.test.ts)、[ buildAdapters.test.ts ](../../src/analyzer/buildAdapters.test.ts)
- 境界: netstandardを実行アプリとしない

## Cloudflare Workers KV（cloudflare-kv）

- 分類: key-value-store / profile: S
- 採用検出形式: wrangler:kv_namespaces
- 意味要素: namespace, binding, get, put, delete
- 必要View: stack, runtime, call, data-flow, architecture
- 基本fixture: coverage:cloudflare-kv
- 検証: [ providerCoverage.test.ts ](../../src/analyzer/providerCoverage.test.ts)、[ providerProvenance.test.ts ](../../src/analyzer/providerProvenance.test.ts)、[ providerAdapters.test.ts ](../../src/analyzer/providerAdapters.test.ts)、[ semantic/completion.test.ts ](../../src/analyzer/semantic/completion.test.ts)
- 境界: unknown namespace IDは別occurrenceを維持

## Firebase（firebase）

- 分類: backend-platform / profile: S
- 採用検出形式: firebase.json, .firebaserc, firebase, firebase-admin
- 意味要素: project, app, initialize
- 必要View: stack, package, runtime, architecture
- 基本fixture: coverage:firebase
- 検証: [ providerCoverage.test.ts ](../../src/analyzer/providerCoverage.test.ts)、[ providerProvenance.test.ts ](../../src/analyzer/providerProvenance.test.ts)、[ providerAdapters.test.ts ](../../src/analyzer/providerAdapters.test.ts)
- 境界: SDK導入だけで全serviceを使用扱いしない

## Firebase Local Emulator Suite（firebase-emulator-suite）

- 分類: local-emulator / profile: E
- 採用検出形式: firebase:emulators
- 意味要素: suite, service, endpoint, local-connect, start, exec, only
- 必要View: stack, command, runtime, call, data-flow, architecture
- 基本fixture: coverage:firebase-emulator-suite
- 検証: [ providerCoverage.test.ts ](../../src/analyzer/providerCoverage.test.ts)、[ providerProvenance.test.ts ](../../src/analyzer/providerProvenance.test.ts)、[ providerAdapters.test.ts ](../../src/analyzer/providerAdapters.test.ts)
- 境界: 設定は稼働観測ではない；環境はservice別

## JVM（jvm）

- 分類: runtime / profile: R
- 採用検出形式: jvm-target
- 意味要素: jvm-target, java-entry
- 必要View: stack, command, runtime, architecture
- 基本fixture: coverage:jvm
- 検証: [ toolCoverage.test.ts ](../../src/analyzer/toolCoverage.test.ts)、[ expandedCommands.test.ts ](../../src/analyzer/expandedCommands.test.ts)、[ runtimeToolProvenance.test.ts ](../../src/analyzer/runtimeToolProvenance.test.ts)、[ buildAdapters.test.ts ](../../src/analyzer/buildAdapters.test.ts)
- 境界: Java等のソースのみでは実行単位を作らない

## Bun（bun）

- 分類: runtime / profile: R/T
- 採用検出形式: bun.lock, bun.lockb, bunfig.toml, packageManager:bun
- 意味要素: runtime-entry, command, task, workspace
- 必要View: stack, workspace, command, package, runtime, architecture
- 基本fixture: coverage:bun
- 検証: [ toolCoverage.test.ts ](../../src/analyzer/toolCoverage.test.ts)、[ expandedCommands.test.ts ](../../src/analyzer/expandedCommands.test.ts)、[ runtimeToolProvenance.test.ts ](../../src/analyzer/runtimeToolProvenance.test.ts)、[ buildAdapters.test.ts ](../../src/analyzer/buildAdapters.test.ts)
- 境界: binary lock内部は未解析

## Deno（deno）

- 分類: runtime / profile: R/T
- 採用検出形式: deno.json, deno.jsonc, deno.lock
- 意味要素: imports, task, runtime-entry
- 必要View: stack, workspace, command, package, module, runtime, architecture
- 基本fixture: coverage:deno
- 検証: [ toolCoverage.test.ts ](../../src/analyzer/toolCoverage.test.ts)、[ expandedCommands.test.ts ](../../src/analyzer/expandedCommands.test.ts)、[ runtimeToolProvenance.test.ts ](../../src/analyzer/runtimeToolProvenance.test.ts)、[ buildAdapters.test.ts ](../../src/analyzer/buildAdapters.test.ts)
- 境界: remote moduleは取得しない

## Yarn（yarn）

- 分類: package-manager / profile: T
- 採用検出形式: yarn.lock, .yarnrc.yml, packageManager:yarn
- 意味要素: workspace, dependency, command
- 必要View: stack, workspace, command, package, architecture
- 基本fixture: coverage:yarn
- 検証: [ toolCoverage.test.ts ](../../src/analyzer/toolCoverage.test.ts)、[ expandedCommands.test.ts ](../../src/analyzer/expandedCommands.test.ts)、[ runtimeToolProvenance.test.ts ](../../src/analyzer/runtimeToolProvenance.test.ts)、[ buildAdapters.test.ts ](../../src/analyzer/buildAdapters.test.ts)
- 境界: lockはversion補助で直接依存にしない

## pip（pip）

- 分類: package-manager / profile: T
- 採用検出形式: pip.conf, pip.ini
- 意味要素: install, command, requirement
- 必要View: stack, command, package, architecture
- 基本fixture: coverage:pip
- 検証: [ toolCoverage.test.ts ](../../src/analyzer/toolCoverage.test.ts)、[ expandedCommands.test.ts ](../../src/analyzer/expandedCommands.test.ts)、[ runtimeToolProvenance.test.ts ](../../src/analyzer/runtimeToolProvenance.test.ts)、[ buildAdapters.test.ts ](../../src/analyzer/buildAdapters.test.ts)
- 境界: requirementsだけではpipを採用と断定しない

## uv（uv）

- 分類: package-manager / profile: T
- 採用検出形式: uv.lock, tool.uv
- 意味要素: workspace, dependency, command
- 必要View: stack, workspace, command, package, architecture
- 基本fixture: coverage:uv
- 検証: [ toolCoverage.test.ts ](../../src/analyzer/toolCoverage.test.ts)、[ expandedCommands.test.ts ](../../src/analyzer/expandedCommands.test.ts)、[ runtimeToolProvenance.test.ts ](../../src/analyzer/runtimeToolProvenance.test.ts)、[ buildAdapters.test.ts ](../../src/analyzer/buildAdapters.test.ts)
- 境界: lockの推移依存は直接辺にしない

## Cargo（cargo）

- 分類: package-manager / profile: T
- 採用検出形式: Cargo.toml, Cargo.lock
- 意味要素: workspace, dependency, build, test
- 必要View: stack, workspace, command, package, architecture
- 基本fixture: coverage:cargo
- 検証: [ toolCoverage.test.ts ](../../src/analyzer/toolCoverage.test.ts)、[ expandedCommands.test.ts ](../../src/analyzer/expandedCommands.test.ts)、[ runtimeToolProvenance.test.ts ](../../src/analyzer/runtimeToolProvenance.test.ts)、[ buildAdapters.test.ts ](../../src/analyzer/buildAdapters.test.ts)
- 境界: feature条件は未評価

## Composer（composer）

- 分類: package-manager / profile: T
- 採用検出形式: composer.json, composer.lock
- 意味要素: dependency, autoload, script
- 必要View: stack, command, package, module, architecture
- 基本fixture: coverage:composer
- 検証: [ toolCoverage.test.ts ](../../src/analyzer/toolCoverage.test.ts)、[ expandedCommands.test.ts ](../../src/analyzer/expandedCommands.test.ts)、[ runtimeToolProvenance.test.ts ](../../src/analyzer/runtimeToolProvenance.test.ts)、[ buildAdapters.test.ts ](../../src/analyzer/buildAdapters.test.ts)
- 境界: scriptは実行しない

## NuGet（nuget）

- 分類: package-manager / profile: T
- 採用検出形式: PackageReference, NuGet.Config, Directory.Packages.props
- 意味要素: package-reference, project-reference, restore
- 必要View: stack, workspace, command, package, architecture
- 基本fixture: coverage:nuget
- 検証: [ toolCoverage.test.ts ](../../src/analyzer/toolCoverage.test.ts)、[ expandedCommands.test.ts ](../../src/analyzer/expandedCommands.test.ts)、[ runtimeToolProvenance.test.ts ](../../src/analyzer/runtimeToolProvenance.test.ts)、[ buildAdapters.test.ts ](../../src/analyzer/buildAdapters.test.ts)
- 境界: PackageVersionだけでは依存を追加しない

## Angular（angular）

- 分類: ui-framework / profile: U/F
- 採用検出形式: angular.json, @angular/core
- 意味要素: component, template, event, binding, input, route
- 必要View: stack, package, module, runtime, call, data-flow, data-model, architecture
- 基本fixture: coverage:angular
- 検証: [ semantic/uiCoverage.test.ts ](../../src/analyzer/semantic/uiCoverage.test.ts)、[ semantic/jsxValueFlow.test.ts ](../../src/analyzer/semantic/jsxValueFlow.test.ts)、[ semantic/frameworkMinimum.test.ts ](../../src/analyzer/semantic/frameworkMinimum.test.ts)
- 境界: 動的DIとtemplate式の実行は未評価

## Nuxt（nuxt）

- 分類: fullstack-web-framework / profile: F/U
- 採用検出形式: nuxt.config, app/pages, server/api, nuxt
- 意味要素: vue-template, page, endpoint, handler, template, event-handler, props, state-binding
- 必要View: stack, package, module, runtime, call, data-flow, data-model, architecture
- 基本fixture: coverage:nuxt
- 検証: [ semantic/uiCoverage.test.ts ](../../src/analyzer/semantic/uiCoverage.test.ts)、[ semantic/jsxValueFlow.test.ts ](../../src/analyzer/semantic/jsxValueFlow.test.ts)、[ semantic/frameworkMinimum.test.ts ](../../src/analyzer/semantic/frameworkMinimum.test.ts)
- 境界: 動的module追加は未解決

## Astro（astro）

- 分類: fullstack-web-framework / profile: F/U
- 採用検出形式: astro.config, astro, astro
- 意味要素: frontmatter, template, island, page, endpoint, template, event-handler, props, state-binding
- 必要View: stack, package, module, runtime, call, data-flow, data-model, architecture
- 基本fixture: coverage:astro
- 検証: [ semantic/uiCoverage.test.ts ](../../src/analyzer/semantic/uiCoverage.test.ts)、[ semantic/jsxValueFlow.test.ts ](../../src/analyzer/semantic/jsxValueFlow.test.ts)、[ semantic/frameworkMinimum.test.ts ](../../src/analyzer/semantic/frameworkMinimum.test.ts)
- 境界: 動的componentの実体は未解決

## Spring Boot（spring-boot）

- 分類: framework / profile: F/R
- 採用検出形式: org.springframework.boot, org.springframework.boot:spring-boot, org.springframework.boot:spring-boot-starter, org.springframework.boot:spring-boot-starter-web, org.springframework.boot:spring-boot-starter-webflux
- 意味要素: boot-main, configuration, mapping, handler
- 必要View: stack, command, package, module, runtime, call, data-flow, data-model, architecture
- 基本fixture: coverage:spring-boot
- 検証: [ semantic/frameworkCoverage.test.ts ](../../src/analyzer/semantic/frameworkCoverage.test.ts)、[ semantic/frameworkMinimum.test.ts ](../../src/analyzer/semantic/frameworkMinimum.test.ts)、[ semantic/frameworkProvenance.test.ts ](../../src/analyzer/semantic/frameworkProvenance.test.ts)、[ semantic/routerRegistration.test.ts ](../../src/analyzer/semantic/routerRegistration.test.ts)、[ semantic/nativeRegistration.test.ts ](../../src/analyzer/semantic/nativeRegistration.test.ts)、[ semantic/completion.test.ts ](../../src/analyzer/semantic/completion.test.ts)
- 境界: 自動設定の実行結果は推定しない

## Fastify（fastify）

- 分類: web-api-framework / profile: F
- 採用検出形式: fastify
- 意味要素: register, prefix, route, schema, handler
- 必要View: stack, package, module, runtime, call, data-flow, data-model, architecture
- 基本fixture: coverage:fastify
- 検証: [ semantic/frameworkCoverage.test.ts ](../../src/analyzer/semantic/frameworkCoverage.test.ts)、[ semantic/frameworkMinimum.test.ts ](../../src/analyzer/semantic/frameworkMinimum.test.ts)、[ semantic/frameworkProvenance.test.ts ](../../src/analyzer/semantic/frameworkProvenance.test.ts)、[ semantic/routerRegistration.test.ts ](../../src/analyzer/semantic/routerRegistration.test.ts)、[ semantic/nativeRegistration.test.ts ](../../src/analyzer/semantic/nativeRegistration.test.ts)、[ semantic/completion.test.ts ](../../src/analyzer/semantic/completion.test.ts)
- 境界: 動的pluginの登録は未解決

## Axum（axum）

- 分類: web-api-framework / profile: F
- 採用検出形式: axum
- 意味要素: router, route, nest, handler, extractor
- 必要View: stack, package, module, runtime, call, data-flow, data-model, architecture
- 基本fixture: coverage:axum
- 検証: [ semantic/frameworkCoverage.test.ts ](../../src/analyzer/semantic/frameworkCoverage.test.ts)、[ semantic/frameworkMinimum.test.ts ](../../src/analyzer/semantic/frameworkMinimum.test.ts)、[ semantic/frameworkProvenance.test.ts ](../../src/analyzer/semantic/frameworkProvenance.test.ts)、[ semantic/routerRegistration.test.ts ](../../src/analyzer/semantic/routerRegistration.test.ts)、[ semantic/nativeRegistration.test.ts ](../../src/analyzer/semantic/nativeRegistration.test.ts)、[ semantic/completion.test.ts ](../../src/analyzer/semantic/completion.test.ts)
- 境界: macroの完全展開は対象外

## Actix Web（actix-web）

- 分類: web-api-framework / profile: F
- 採用検出形式: actix-web
- 意味要素: app, service, route-attribute, handler, extractor
- 必要View: stack, package, module, runtime, call, data-flow, data-model, architecture
- 基本fixture: coverage:actix-web
- 検証: [ semantic/frameworkCoverage.test.ts ](../../src/analyzer/semantic/frameworkCoverage.test.ts)、[ semantic/frameworkMinimum.test.ts ](../../src/analyzer/semantic/frameworkMinimum.test.ts)、[ semantic/frameworkProvenance.test.ts ](../../src/analyzer/semantic/frameworkProvenance.test.ts)、[ semantic/routerRegistration.test.ts ](../../src/analyzer/semantic/routerRegistration.test.ts)、[ semantic/nativeRegistration.test.ts ](../../src/analyzer/semantic/nativeRegistration.test.ts)
- 境界: 動的service構築は未解決

## Bootstrap（bootstrap）

- 分類: css-framework / profile: U
- 採用検出形式: bootstrap
- 意味要素: resolved-css-asset, component-use
- 必要View: stack, package, module, runtime, architecture
- 基本fixture: coverage:bootstrap
- 検証: [ semantic/uiCoverage.test.ts ](../../src/analyzer/semantic/uiCoverage.test.ts)、[ semantic/jsxValueFlow.test.ts ](../../src/analyzer/semantic/jsxValueFlow.test.ts)、[ semantic/frameworkMinimum.test.ts ](../../src/analyzer/semantic/frameworkMinimum.test.ts)
- 境界: CSS class名だけでは製品を検出しない

## Redux Toolkit（redux-toolkit）

- 分類: state-management-library / profile: U/D
- 採用検出形式: @reduxjs/toolkit
- 意味要素: slice, store, dispatch, selector, state-field
- 必要View: stack, package, module, runtime, call, data-flow, data-model, architecture
- 基本fixture: coverage:redux-toolkit
- 検証: [ semantic/dataCoverage.test.ts ](../../src/analyzer/semantic/dataCoverage.test.ts)、[ semantic/dataMinimum.test.ts ](../../src/analyzer/semantic/dataMinimum.test.ts)、[ semantic/dataProvenance.test.ts ](../../src/analyzer/semantic/dataProvenance.test.ts)
- 境界: 動的reducer登録は未解決

## Pinia（pinia）

- 分類: state-management-library / profile: U/D
- 採用検出形式: pinia
- 意味要素: define-store, state-field, getter, action
- 必要View: stack, package, module, runtime, call, data-flow, data-model, architecture
- 基本fixture: coverage:pinia
- 検証: [ semantic/dataCoverage.test.ts ](../../src/analyzer/semantic/dataCoverage.test.ts)、[ semantic/dataMinimum.test.ts ](../../src/analyzer/semantic/dataMinimum.test.ts)、[ semantic/dataProvenance.test.ts ](../../src/analyzer/semantic/dataProvenance.test.ts)
- 境界: 動的store識別子は未解決

## SWR（swr）

- 分類: server-state-library / profile: U/D
- 採用検出形式: swr
- 意味要素: key, fetcher, cache, mutate, result
- 必要View: stack, package, module, runtime, call, data-flow, data-model, architecture
- 基本fixture: coverage:swr
- 検証: [ semantic/dataCoverage.test.ts ](../../src/analyzer/semantic/dataCoverage.test.ts)、[ semantic/dataMinimum.test.ts ](../../src/analyzer/semantic/dataMinimum.test.ts)、[ semantic/dataProvenance.test.ts ](../../src/analyzer/semantic/dataProvenance.test.ts)
- 境界: 動的key値は未評価

## Pydantic（pydantic）

- 分類: schema-validation-library / profile: D
- 採用検出形式: pydantic
- 意味要素: base-model, field, validator, validate, serialize
- 必要View: stack, package, module, runtime, call, data-flow, data-model, architecture
- 基本fixture: coverage:pydantic
- 検証: [ semantic/dataCoverage.test.ts ](../../src/analyzer/semantic/dataCoverage.test.ts)、[ semantic/dataMinimum.test.ts ](../../src/analyzer/semantic/dataMinimum.test.ts)、[ semantic/dataProvenance.test.ts ](../../src/analyzer/semantic/dataProvenance.test.ts)
- 境界: 動的create_modelは静的引数のみ

## SQLAlchemy（sqlalchemy）

- 分類: orm / profile: D
- 採用検出形式: sqlalchemy
- 意味要素: table, declarative, mapped, relationship, query
- 必要View: stack, package, module, runtime, call, data-flow, data-model, architecture
- 基本fixture: coverage:sqlalchemy
- 検証: [ semantic/dataCoverage.test.ts ](../../src/analyzer/semantic/dataCoverage.test.ts)、[ semantic/dataMinimum.test.ts ](../../src/analyzer/semantic/dataMinimum.test.ts)、[ semantic/dataProvenance.test.ts ](../../src/analyzer/semantic/dataProvenance.test.ts)
- 境界: 実DBreflectionは実行しない

## Entity Framework Core（entity-framework-core）

- 分類: orm / profile: D
- 採用検出形式: Microsoft.EntityFrameworkCore, Microsoft.EntityFrameworkCore.SqlServer, Microsoft.EntityFrameworkCore.Sqlite
- 意味要素: db-context, db-set, fluent-field, relation, query, save
- 必要View: stack, package, module, runtime, call, data-flow, data-model, architecture
- 基本fixture: coverage:entity-framework-core
- 検証: [ semantic/dataCoverage.test.ts ](../../src/analyzer/semantic/dataCoverage.test.ts)、[ semantic/dataMinimum.test.ts ](../../src/analyzer/semantic/dataMinimum.test.ts)、[ semantic/dataProvenance.test.ts ](../../src/analyzer/semantic/dataProvenance.test.ts)
- 境界: 動的Fluent APIは未評価

## MUI (Material UI)（mui）

- 分類: ui-component-system / profile: U
- 採用検出形式: @mui/material, @mui/icons-material
- 意味要素: component-import, component-use, props, event-handler
- 必要View: stack, package, module, runtime, call, data-flow, architecture
- 基本fixture: coverage:mui
- 検証: [ semantic/uiCoverage.test.ts ](../../src/analyzer/semantic/uiCoverage.test.ts)、[ semantic/jsxValueFlow.test.ts ](../../src/analyzer/semantic/jsxValueFlow.test.ts)、[ semantic/frameworkMinimum.test.ts ](../../src/analyzer/semantic/frameworkMinimum.test.ts)
- 境界: MUI suiteの別製品は対象に混ぜない

## Radix UI（radix-ui）

- 分類: ui-component-system / profile: U
- 採用検出形式: radix-ui, @radix-ui/react-accordion, @radix-ui/react-alert-dialog, @radix-ui/react-aspect-ratio, @radix-ui/react-avatar, @radix-ui/react-checkbox, @radix-ui/react-collapsible, @radix-ui/react-context-menu, @radix-ui/react-dialog, @radix-ui/react-dropdown-menu, @radix-ui/react-form, @radix-ui/react-hover-card, @radix-ui/react-label, @radix-ui/react-menubar, @radix-ui/react-navigation-menu, @radix-ui/react-popover, @radix-ui/react-progress, @radix-ui/react-radio-group, @radix-ui/react-scroll-area, @radix-ui/react-select, @radix-ui/react-separator, @radix-ui/react-slider, @radix-ui/react-slot, @radix-ui/react-switch, @radix-ui/react-tabs, @radix-ui/react-toast, @radix-ui/react-toggle, @radix-ui/react-toggle-group, @radix-ui/react-toolbar, @radix-ui/react-tooltip
- 意味要素: primitive-import, component-use, props, event-handler
- 必要View: stack, package, module, runtime, call, data-flow, architecture
- 基本fixture: coverage:radix-ui
- 検証: [ semantic/uiCoverage.test.ts ](../../src/analyzer/semantic/uiCoverage.test.ts)、[ semantic/jsxValueFlow.test.ts ](../../src/analyzer/semantic/jsxValueFlow.test.ts)、[ semantic/frameworkMinimum.test.ts ](../../src/analyzer/semantic/frameworkMinimum.test.ts)
- 境界: 内部helperと無関係なnamespaceは対象外

## webpack（webpack）

- 分類: build-tool / profile: T
- 採用検出形式: webpack.config, webpack
- 意味要素: entry, output, build-command
- 必要View: stack, command, package, module, architecture
- 基本fixture: coverage:webpack
- 検証: [ toolCoverage.test.ts ](../../src/analyzer/toolCoverage.test.ts)、[ expandedCommands.test.ts ](../../src/analyzer/expandedCommands.test.ts)、[ runtimeToolProvenance.test.ts ](../../src/analyzer/runtimeToolProvenance.test.ts)、[ buildAdapters.test.ts ](../../src/analyzer/buildAdapters.test.ts)
- 境界: 実行されるplugin設定は未評価

## esbuild（esbuild）

- 分類: build-tool / profile: T
- 採用検出形式: esbuild
- 意味要素: build-api, entry, output, cli
- 必要View: stack, command, package, module, architecture
- 基本fixture: coverage:esbuild
- 検証: [ toolCoverage.test.ts ](../../src/analyzer/toolCoverage.test.ts)、[ expandedCommands.test.ts ](../../src/analyzer/expandedCommands.test.ts)、[ runtimeToolProvenance.test.ts ](../../src/analyzer/runtimeToolProvenance.test.ts)、[ buildAdapters.test.ts ](../../src/analyzer/buildAdapters.test.ts)
- 境界: 型検査を実装したとは表示しない

## Maven（maven）

- 分類: build-tool / profile: T
- 採用検出形式: pom.xml
- 意味要素: module, dependency, plugin, build-test
- 必要View: stack, workspace, command, package, architecture
- 基本fixture: coverage:maven
- 検証: [ toolCoverage.test.ts ](../../src/analyzer/toolCoverage.test.ts)、[ expandedCommands.test.ts ](../../src/analyzer/expandedCommands.test.ts)、[ runtimeToolProvenance.test.ts ](../../src/analyzer/runtimeToolProvenance.test.ts)、[ buildAdapters.test.ts ](../../src/analyzer/buildAdapters.test.ts)
- 境界: dependencyManagementはversion補助

## Gradle（gradle）

- 分類: build-tool / profile: T
- 採用検出形式: build.gradle, build.gradle.kts, settings.gradle, settings.gradle.kts, libs.versions.toml
- 意味要素: include, dependency, catalog, task
- 必要View: stack, workspace, command, package, architecture
- 基本fixture: coverage:gradle
- 検証: [ toolCoverage.test.ts ](../../src/analyzer/toolCoverage.test.ts)、[ expandedCommands.test.ts ](../../src/analyzer/expandedCommands.test.ts)、[ runtimeToolProvenance.test.ts ](../../src/analyzer/runtimeToolProvenance.test.ts)、[ buildAdapters.test.ts ](../../src/analyzer/buildAdapters.test.ts)
- 境界: 動的build scriptは実行しない

## MariaDB（mariadb）

- 分類: relational-database / profile: S
- 採用検出形式: mariadb, mariadb, org.mariadb.jdbc:mariadb-java-client
- 意味要素: provider, endpoint, query
- 必要View: stack, package, runtime, call, data-flow, architecture
- 基本fixture: coverage:mariadb
- 検証: [ providerCoverage.test.ts ](../../src/analyzer/providerCoverage.test.ts)、[ providerProvenance.test.ts ](../../src/analyzer/providerProvenance.test.ts)、[ providerAdapters.test.ts ](../../src/analyzer/providerAdapters.test.ts)
- 境界: driverだけで接続先をMariaDBと断定しない

## Microsoft SQL Server（sql-server）

- 分類: relational-database / profile: S
- 採用検出形式: mssql, Microsoft.Data.SqlClient
- 意味要素: provider, endpoint, query
- 必要View: stack, package, runtime, call, data-flow, architecture
- 基本fixture: coverage:sql-server
- 検証: [ providerCoverage.test.ts ](../../src/analyzer/providerCoverage.test.ts)、[ providerProvenance.test.ts ](../../src/analyzer/providerProvenance.test.ts)、[ providerAdapters.test.ts ](../../src/analyzer/providerAdapters.test.ts)
- 境界: 接続文字列の秘密は保存しない

## Redis（redis）

- 分類: key-value-store / profile: S/D
- 採用検出形式: redis, ioredis, redis, github.com/redis/go-redis/v9, redis, redis
- 意味要素: client, endpoint, key, operation, value
- 必要View: stack, package, runtime, call, data-flow, data-model, architecture
- 基本fixture: coverage:redis
- 検証: [ semantic/dataCoverage.test.ts ](../../src/analyzer/semantic/dataCoverage.test.ts)、[ semantic/dataMinimum.test.ts ](../../src/analyzer/semantic/dataMinimum.test.ts)、[ semantic/dataProvenance.test.ts ](../../src/analyzer/semantic/dataProvenance.test.ts)
- 境界: 動的keyとunknown endpointを統合しない

## Cloud Firestore（cloud-firestore）

- 分類: document-database / profile: S/D
- 採用検出形式: @google-cloud/firestore
- 意味要素: collection, document, field, query, write
- 必要View: stack, package, runtime, call, data-flow, data-model, architecture
- 基本fixture: coverage:cloud-firestore
- 検証: [ semantic/dataCoverage.test.ts ](../../src/analyzer/semantic/dataCoverage.test.ts)、[ semantic/dataMinimum.test.ts ](../../src/analyzer/semantic/dataMinimum.test.ts)、[ semantic/dataProvenance.test.ts ](../../src/analyzer/semantic/dataProvenance.test.ts)
- 境界: SDK導入だけではcollectionを作らない

## Supabase（supabase）

- 分類: backend-platform / profile: S/D
- 採用検出形式: supabase/config.toml, @supabase/supabase-js, supabase
- 意味要素: client, from, field, query, auth, storage
- 必要View: stack, package, runtime, call, data-flow, data-model, architecture
- 基本fixture: coverage:supabase
- 検証: [ semantic/dataCoverage.test.ts ](../../src/analyzer/semantic/dataCoverage.test.ts)、[ semantic/dataMinimum.test.ts ](../../src/analyzer/semantic/dataMinimum.test.ts)、[ semantic/dataProvenance.test.ts ](../../src/analyzer/semantic/dataProvenance.test.ts)
- 境界: project identity不明は別実体

## Clerk（clerk）

- 分類: auth-service / profile: S/D
- 採用検出形式: @clerk/nextjs, @clerk/clerk-react, @clerk/react, @clerk/backend, @clerk/express
- 意味要素: provider, middleware, auth, user, application-user-session-field, typed-auth-input-output
- 必要View: stack, package, runtime, call, data-flow, data-model, architecture
- 基本fixture: coverage:clerk
- 検証: [ semantic/dataCoverage.test.ts ](../../src/analyzer/semantic/dataCoverage.test.ts)、[ semantic/dataMinimum.test.ts ](../../src/analyzer/semantic/dataMinimum.test.ts)、[ semantic/dataProvenance.test.ts ](../../src/analyzer/semantic/dataProvenance.test.ts)、[ semantic/completion.test.ts ](../../src/analyzer/semantic/completion.test.ts)
- 境界: tokenや秘密鍵を取得しない

## Auth0（auth0）

- 分類: auth-service / profile: S/D
- 採用検出形式: auth0, @auth0/auth0-react, @auth0/nextjs-auth0, @auth0/auth0-spa-js, express-openid-connect
- 意味要素: domain, issuer, handler, session, user, application-user-session-field, typed-auth-input-output
- 必要View: stack, package, runtime, call, data-flow, data-model, architecture
- 基本fixture: coverage:auth0
- 検証: [ semantic/dataCoverage.test.ts ](../../src/analyzer/semantic/dataCoverage.test.ts)、[ semantic/dataMinimum.test.ts ](../../src/analyzer/semantic/dataMinimum.test.ts)、[ semantic/dataProvenance.test.ts ](../../src/analyzer/semantic/dataProvenance.test.ts)、[ semantic/completion.test.ts ](../../src/analyzer/semantic/completion.test.ts)
- 境界: 業務権限を推定しない

## Jest（jest）

- 分類: test-framework / profile: T
- 採用検出形式: jest.config, jest, @jest/globals
- 意味要素: test-suite, test-case, assertion, command
- 必要View: stack, command, package, runtime, call, architecture
- 基本fixture: coverage:jest
- 検証: [ toolCoverage.test.ts ](../../src/analyzer/toolCoverage.test.ts)、[ expandedCommands.test.ts ](../../src/analyzer/expandedCommands.test.ts)、[ runtimeToolProvenance.test.ts ](../../src/analyzer/runtimeToolProvenance.test.ts)、[ buildAdapters.test.ts ](../../src/analyzer/buildAdapters.test.ts)
- 境界: testグローバルは設定Scope内のみ

## pytest（pytest）

- 分類: test-framework / profile: T
- 採用検出形式: pytest.ini, tool.pytest, pytest
- 意味要素: test-suite, test-case, fixture, command
- 必要View: stack, command, package, runtime, call, architecture
- 基本fixture: coverage:pytest
- 検証: [ toolCoverage.test.ts ](../../src/analyzer/toolCoverage.test.ts)、[ expandedCommands.test.ts ](../../src/analyzer/expandedCommands.test.ts)、[ runtimeToolProvenance.test.ts ](../../src/analyzer/runtimeToolProvenance.test.ts)、[ buildAdapters.test.ts ](../../src/analyzer/buildAdapters.test.ts)、[ semantic/completion.test.ts ](../../src/analyzer/semantic/completion.test.ts)
- 境界: 一般関数を本番entryへ昇格しない

## JUnit（junit）

- 分類: test-framework / profile: T
- 採用検出形式: org.junit.jupiter:junit-jupiter, org.junit.jupiter:junit-jupiter-api, junit:junit
- 意味要素: test-suite, test-annotation, assertion, build-task
- 必要View: stack, command, package, runtime, call, architecture
- 基本fixture: coverage:junit
- 検証: [ toolCoverage.test.ts ](../../src/analyzer/toolCoverage.test.ts)、[ expandedCommands.test.ts ](../../src/analyzer/expandedCommands.test.ts)、[ runtimeToolProvenance.test.ts ](../../src/analyzer/runtimeToolProvenance.test.ts)、[ buildAdapters.test.ts ](../../src/analyzer/buildAdapters.test.ts)
- 境界: 世代ごとの明示annotationのみ

## Cypress（cypress）

- 分類: e2e-test-framework / profile: T
- 採用検出形式: cypress.config, cypress
- 意味要素: spec, suite, test-case, browser-operation
- 必要View: stack, command, package, runtime, call, architecture
- 基本fixture: coverage:cypress
- 検証: [ toolCoverage.test.ts ](../../src/analyzer/toolCoverage.test.ts)、[ expandedCommands.test.ts ](../../src/analyzer/expandedCommands.test.ts)、[ runtimeToolProvenance.test.ts ](../../src/analyzer/runtimeToolProvenance.test.ts)、[ buildAdapters.test.ts ](../../src/analyzer/buildAdapters.test.ts)
- 境界: test実行を観測したとは表示しない

## GitLab（gitlab）

- 分類: development-platform / profile: P
- 採用検出形式: CI_SERVER_URL, gitlab-project
- 意味要素: repository-provider
- 必要View: stack, architecture
- 基本fixture: coverage:gitlab
- 検証: [ providerCoverage.test.ts ](../../src/analyzer/providerCoverage.test.ts)、[ providerProvenance.test.ts ](../../src/analyzer/providerProvenance.test.ts)、[ providerAdapters.test.ts ](../../src/analyzer/providerAdapters.test.ts)
- 境界: CIファイルだけでrepository所在を証明しない

## GitLab CI/CD（gitlab-ci）

- 分類: ci-cd / profile: P/T
- 採用検出形式: .gitlab-ci.yml
- 意味要素: local-include, job, stages, needs, script
- 必要View: stack, command, architecture
- 基本fixture: coverage:gitlab-ci
- 検証: [ providerCoverage.test.ts ](../../src/analyzer/providerCoverage.test.ts)、[ providerProvenance.test.ts ](../../src/analyzer/providerProvenance.test.ts)、[ providerAdapters.test.ts ](../../src/analyzer/providerAdapters.test.ts)
- 境界: remote include取得禁止；local循環とroot外を拒否

## Docker Compose（docker-compose）

- 分類: container-orchestration / profile: P/T
- 採用検出形式: compose.yaml, compose.yml, docker-compose.yml, docker-compose.yaml
- 意味要素: service, image, build, port, depends-on
- 必要View: stack, command, runtime, architecture
- 基本fixture: coverage:docker-compose
- 検証: [ providerCoverage.test.ts ](../../src/analyzer/providerCoverage.test.ts)、[ providerProvenance.test.ts ](../../src/analyzer/providerProvenance.test.ts)、[ providerAdapters.test.ts ](../../src/analyzer/providerAdapters.test.ts)
- 境界: 宣言と実行中を区別；曖昧なapp対応は未解決

## Kubernetes（kubernetes）

- 分類: container-orchestration / profile: P/T
- 採用検出形式: apiVersion:kind
- 意味要素: deployment, service, ingress, selector
- 必要View: stack, command, runtime, architecture
- 基本fixture: coverage:kubernetes
- 検証: [ providerCoverage.test.ts ](../../src/analyzer/providerCoverage.test.ts)、[ providerProvenance.test.ts ](../../src/analyzer/providerProvenance.test.ts)、[ providerAdapters.test.ts ](../../src/analyzer/providerAdapters.test.ts)、[ semantic/completion.test.ts ](../../src/analyzer/semantic/completion.test.ts)
- 境界: secretとkubeconfigを収集しない

## Netlify（netlify）

- 分類: application-platform / profile: P
- 採用検出形式: netlify.toml, netlify-cli
- 意味要素: build, publish, function, redirect
- 必要View: stack, command, package, runtime, architecture
- 基本fixture: coverage:netlify
- 検証: [ providerCoverage.test.ts ](../../src/analyzer/providerCoverage.test.ts)、[ providerProvenance.test.ts ](../../src/analyzer/providerProvenance.test.ts)、[ providerAdapters.test.ts ](../../src/analyzer/providerAdapters.test.ts)、[ semantic/completion.test.ts ](../../src/analyzer/semantic/completion.test.ts)
- 境界: 動的build式は未評価

## GitHub Pages（github-pages）

- 分類: web-hosting / profile: P
- 採用検出形式: actions/deploy-pages
- 意味要素: workflow, job, artifact, publish
- 必要View: stack, command, architecture
- 基本fixture: coverage:github-pages
- 検証: [ providerCoverage.test.ts ](../../src/analyzer/providerCoverage.test.ts)、[ providerProvenance.test.ts ](../../src/analyzer/providerProvenance.test.ts)、[ providerAdapters.test.ts ](../../src/analyzer/providerAdapters.test.ts)、[ semantic/completion.test.ts ](../../src/analyzer/semantic/completion.test.ts)
- 境界: repositoryだけでは公開を推定しない

## Firebase Hosting（firebase-hosting）

- 分類: web-hosting / profile: P
- 採用検出形式: firebase:hosting
- 意味要素: target, public, rewrite, deploy
- 必要View: stack, command, runtime, architecture
- 基本fixture: coverage:firebase-hosting
- 検証: [ providerCoverage.test.ts ](../../src/analyzer/providerCoverage.test.ts)、[ providerProvenance.test.ts ](../../src/analyzer/providerProvenance.test.ts)、[ providerAdapters.test.ts ](../../src/analyzer/providerAdapters.test.ts)、[ semantic/completion.test.ts ](../../src/analyzer/semantic/completion.test.ts)
- 境界: App Hostingと同一扱いしない

## NGINX（nginx）

- 分類: web-server / profile: P
- 採用検出形式: nginx.conf
- 意味要素: server, location, proxy-pass, upstream
- 必要View: stack, runtime, architecture
- 基本fixture: coverage:nginx
- 検証: [ providerCoverage.test.ts ](../../src/analyzer/providerCoverage.test.ts)、[ providerProvenance.test.ts ](../../src/analyzer/providerProvenance.test.ts)、[ providerAdapters.test.ts ](../../src/analyzer/providerAdapters.test.ts)、[ semantic/completion.test.ts ](../../src/analyzer/semantic/completion.test.ts)
- 境界: includeはlocal root内のみ

## Apache HTTP Server（apache-http-server）

- 分類: web-server / profile: P
- 採用検出形式: httpd.conf, apache2.conf
- 意味要素: virtual-host, document-root, proxy-pass
- 必要View: stack, runtime, architecture
- 基本fixture: coverage:apache-http-server
- 検証: [ providerCoverage.test.ts ](../../src/analyzer/providerCoverage.test.ts)、[ providerProvenance.test.ts ](../../src/analyzer/providerProvenance.test.ts)、[ providerAdapters.test.ts ](../../src/analyzer/providerAdapters.test.ts)、[ semantic/completion.test.ts ](../../src/analyzer/semantic/completion.test.ts)
- 境界: 動的moduleの実行は対象外

## Cloudflare CDN（cloudflare-cdn）

- 分類: cdn / profile: C
- 採用検出形式: cloudflare_dns_record:proxied, cloudflare_record:proxied, cloudflare_ruleset:http_request_cache_settings
- 意味要素: zone, record, origin, cache
- 必要View: stack, runtime, architecture
- 基本fixture: coverage:cloudflare-cdn
- 検証: [ providerCoverage.test.ts ](../../src/analyzer/providerCoverage.test.ts)、[ providerProvenance.test.ts ](../../src/analyzer/providerProvenance.test.ts)、[ providerAdapters.test.ts ](../../src/analyzer/providerAdapters.test.ts)、[ semantic/completion.test.ts ](../../src/analyzer/semantic/completion.test.ts)
- 境界: WorkersやR2だけではCDNを検出しない

## Amazon CloudFront（amazon-cloudfront）

- 分類: cdn / profile: C
- 採用検出形式: aws_cloudfront_distribution, AWS::CloudFront::Distribution
- 意味要素: distribution, origin, behavior
- 必要View: stack, runtime, architecture
- 基本fixture: coverage:amazon-cloudfront
- 検証: [ providerCoverage.test.ts ](../../src/analyzer/providerCoverage.test.ts)、[ providerProvenance.test.ts ](../../src/analyzer/providerProvenance.test.ts)、[ providerAdapters.test.ts ](../../src/analyzer/providerAdapters.test.ts)、[ semantic/completion.test.ts ](../../src/analyzer/semantic/completion.test.ts)
- 境界: 動的Refは未解決；関数callにしない

## Fastly CDN（fastly-cdn）

- 分類: cdn / profile: C
- 採用検出形式: fastly_service_vcl
- 意味要素: service, backend, cache
- 必要View: stack, runtime, architecture
- 基本fixture: coverage:fastly-cdn
- 検証: [ providerCoverage.test.ts ](../../src/analyzer/providerCoverage.test.ts)、[ providerProvenance.test.ts ](../../src/analyzer/providerProvenance.test.ts)、[ providerAdapters.test.ts ](../../src/analyzer/providerAdapters.test.ts)、[ semantic/completion.test.ts ](../../src/analyzer/semantic/completion.test.ts)
- 境界: ComputeだけではCDN製品を推定しない

## Google Cloud CDN（google-cloud-cdn）

- 分類: cdn / profile: C
- 採用検出形式: google_compute_backend_bucket:enable_cdn, google_compute_backend_service:enable_cdn
- 意味要素: backend, origin, cache
- 必要View: stack, runtime, architecture
- 基本fixture: coverage:google-cloud-cdn
- 検証: [ providerCoverage.test.ts ](../../src/analyzer/providerCoverage.test.ts)、[ providerProvenance.test.ts ](../../src/analyzer/providerProvenance.test.ts)、[ providerAdapters.test.ts ](../../src/analyzer/providerAdapters.test.ts)、[ semantic/completion.test.ts ](../../src/analyzer/semantic/completion.test.ts)
- 境界: enable_cdn=trueの明示のみ

## Akamai Ion（akamai-ion）

- 分類: cdn / profile: C
- 採用検出形式: productId:prd_Fresca, productId:prd_SPM
- 意味要素: property, product, origin, rule
- 必要View: stack, runtime, architecture
- 基本fixture: coverage:akamai-ion
- 検証: [ providerCoverage.test.ts ](../../src/analyzer/providerCoverage.test.ts)、[ providerProvenance.test.ts ](../../src/analyzer/providerProvenance.test.ts)、[ providerAdapters.test.ts ](../../src/analyzer/providerAdapters.test.ts)、[ semantic/completion.test.ts ](../../src/analyzer/semantic/completion.test.ts)
- 境界: 一般Akamaiや他productIdはIonにしない

## bunny.net CDN（bunny-cdn）

- 分類: cdn / profile: C
- 採用検出形式: bunnynet_pullzone, bunnynet_pullzone_hostname
- 意味要素: pull-zone, origin, cdn-domain
- 必要View: stack, runtime, architecture
- 基本fixture: coverage:bunny-cdn
- 検証: [ providerCoverage.test.ts ](../../src/analyzer/providerCoverage.test.ts)、[ providerProvenance.test.ts ](../../src/analyzer/providerProvenance.test.ts)、[ providerAdapters.test.ts ](../../src/analyzer/providerAdapters.test.ts)、[ semantic/completion.test.ts ](../../src/analyzer/semantic/completion.test.ts)
- 境界: OriginUrl以外のoriginをURLと推定しない

## jsDelivr（jsdelivr）

- 分類: cdn / profile: C
- 採用検出形式: cdn.jsdelivr.net
- 意味要素: source-asset, cdn-url, origin-package
- 必要View: stack, runtime, architecture
- 基本fixture: coverage:jsdelivr
- 検証: [ providerCoverage.test.ts ](../../src/analyzer/providerCoverage.test.ts)、[ providerProvenance.test.ts ](../../src/analyzer/providerProvenance.test.ts)、[ providerAdapters.test.ts ](../../src/analyzer/providerAdapters.test.ts)
- 境界: 完全hostnameと解析済みasset参照のみ

## UNPKG（unpkg）

- 分類: cdn / profile: C
- 採用検出形式: unpkg.com
- 意味要素: source-asset, cdn-url, origin-package
- 必要View: stack, runtime, architecture
- 基本fixture: coverage:unpkg
- 検証: [ providerCoverage.test.ts ](../../src/analyzer/providerCoverage.test.ts)、[ providerProvenance.test.ts ](../../src/analyzer/providerProvenance.test.ts)、[ providerAdapters.test.ts ](../../src/analyzer/providerAdapters.test.ts)
- 境界: コメント・任意文字列・偽装suffixは除外

