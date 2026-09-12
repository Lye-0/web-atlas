export type Ecosystem = 'npm' | 'pypi' | 'maven' | 'nuget' | 'cargo' | 'composer' | 'go' | 'gem' | 'dart' | 'swift' | 'native';
export type StackProfile = 'L' | 'Q' | 'U' | 'F' | 'R' | 'T' | 'D' | 'S' | 'P' | 'C' | 'E';
export type CoverageView = 'stack' | 'workspace' | 'command' | 'package' | 'module' | 'runtime' | 'call' | 'data-flow' | 'data-model' | 'architecture';
export interface StackSupport {
  stackId: string;
  profiles: StackProfile[];
  identifiers: Partial<Record<Ecosystem, string[]>>;
  sourceExtensions: string[];
  imports: Partial<Record<Ecosystem, string[]>>;
  configForms: string[];
  commandNames: string[];
  adapter: string;
  fixtureId: string;
  requiredPrimitives: string[];
  limitations: string[];
  views: Record<CoverageView, { requirement: 'required' | 'not-applicable'; reason: string }>;
  apiForms?: { module: string; symbol: string; service: string; endpointArguments: number[] }[];
}
const allViews: CoverageView[] = ['stack', 'workspace', 'command', 'package', 'module', 'runtime', 'call', 'data-flow', 'data-model', 'architecture'];
type Row = [id: string, profiles: string, identifiers: string, extensions: string, imports: string, configs: string, commands: string, views: string, primitives: string, limits: string];
const rows: Row[] = [
  ['python','L','','py pyi','pypi:','pyproject.toml requirements.txt setup.cfg','python python3','module runtime call data-flow data-model architecture','function call class field relative-import','動的importと実行時型は未解決'],
  ['java','L','','java','','pom.xml build.gradle','','module runtime call data-flow data-model architecture','method class field package-import','overloadの完全な型解決は対象外'],
  ['csharp','L','','cs','','*.csproj','','module runtime call data-flow data-model architecture','method class field namespace-import','reflectionと実行時DIは未解決'],
  ['go','L','','go','','go.mod go.work','go','module runtime call data-flow data-model architecture','function struct field module-import','動的dispatchは静的候補まで'],
  ['rust','L','','rs','','Cargo.toml','','module runtime call data-flow data-model architecture','function struct field mod-use','macro展開とtrait dispatchは未解決'],
  ['ruby','L','','rb','','Gemfile *.gemspec','ruby','module runtime call data-flow data-model architecture','method class field require','動的requireとメタプログラミングは未解決'],
  ['php','L','','php','','composer.json','php','module runtime call data-flow data-model architecture','function class field autoload','動的includeとclass名は未解決'],
  ['c','L','','c','','compile_commands.json','','module runtime call data-flow data-model architecture','function struct field include','macro includeと曖昧な.hの言語は未解決'],
  ['cpp','L','','cpp cc cxx hpp hxx hh','','compile_commands.json','','module runtime call data-flow data-model architecture','function class field include','template instantiationとmacro展開は対象外'],
  ['swift','L','','swift','','Package.swift','','module runtime call data-flow data-model architecture','function struct field package-import','条件付きコンパイルの動的評価は対象外'],
  ['kotlin','L','','kt kts','','build.gradle.kts','','module runtime call data-flow data-model architecture','function class field package-import','JVM以外のtargetをJVMと推定しない'],
  ['scala','L','','scala','','build.sbt','','module runtime call data-flow data-model architecture','method class field package-import','implicit解決とmacro展開は対象外'],
  ['dart','L','','dart','','pubspec.yaml','','module runtime call data-flow data-model architecture','function class field import-part','生成コードの取得と実行は行わない'],
  ['sql','Q','','sql','','','','module runtime data-flow data-model architecture','table column reference query mutation','方言固有の動的SQLは未解決'],
  ['graphql','Q','npm:graphql','graphql gql','','','','module runtime call data-flow data-model architecture','type field reference query mutation resolver','動的resolver登録は未解決'],
  ['tsx','LU','','tsx','','tsconfig.json','','module runtime call data-flow data-model architecture','component event props state typed-field','jsx変換設定だけはdeclaration；React利用は別証拠'],
  ['jsx','LU','','jsx','','','','module runtime call data-flow data-model architecture','component event props state','.js内はparser確認必須；TSXからJSXを追加しない'],
  ['vue','U','npm:vue','vue','npm:vue','','','module runtime call data-flow data-model architecture','template component event-handler props state','動的component名と式の実行結果は未解決'],
  ['svelte','U','npm:svelte','svelte','npm:svelte','','','module runtime call data-flow data-model architecture','template component event-handler props state','動的template式は未評価'],
  ['wpf','UR','','xaml','','UseWPF XAML','dotnet','module command runtime call data-flow data-model architecture','x-class code-behind event-handler binding runtime-entry','動的Binding pathとresource lookupは未解決'],
  ['sveltekit','FU','npm:@sveltejs/kit','','npm:@sveltejs/kit','svelte.config.js +page +layout +server','','module runtime call data-flow data-model architecture','page endpoint load action handler','動的route parameter値は未評価'],
  ['django','FD','pypi:django','','pypi:django','urls.py','','module runtime call data-flow data-model architecture','path include view model field query','動的urlpatterns生成は未解決'],
  ['ruby-on-rails','FD','gem:rails','','gem:rails','config/routes.rb','','module runtime call data-flow data-model architecture','route controller active-record field query','動的DSLと実DBスキーマ取得は対象外'],
  ['laravel','FD','composer:laravel/framework','','composer:Illuminate','routes/web.php','','module runtime call data-flow data-model architecture','route controller eloquent field query','runtimeコンテナ解決は未評価'],
  ['express','F','npm:express','','npm:express','','','module runtime call data-flow architecture','router mount middleware handler request-response','動的mount pathは未解決'],
  ['nestjs','F','npm:@nestjs/core,@nestjs/common','','npm:@nestjs/common,@nestjs/core','','','module runtime call data-flow data-model architecture','module controller injectable provider handler','reflectionと動的provider factoryは未解決'],
  ['fastapi','FD','pypi:fastapi','','pypi:fastapi','','','module runtime call data-flow data-model architecture','router include-router handler request response-model','動的依存解決は未評価'],
  ['flask','F','pypi:flask','','pypi:flask','','','module runtime call data-flow architecture','route blueprint register-blueprint handler','動的blueprint登録は未解決'],
  ['aspnet-core','F','nuget:Microsoft.AspNetCore.App','','nuget:Microsoft.AspNetCore','Microsoft.NET.Sdk.Web','','module runtime call data-flow data-model architecture','map-handler controller middleware request-response','runtime DIは静的登録の一致のみ'],
  ['gin','F','go:github.com/gin-gonic/gin','','go:github.com/gin-gonic/gin','','','module runtime call data-flow architecture','group route handler request-response','動的Group pathは未解決'],
  ['mongoose','D','npm:mongoose','','npm:mongoose','','','module runtime call data-flow data-model architecture','schema model field reference CRUD','動的Schema定義は未解決'],
  ['sequelize','D','npm:sequelize','','npm:sequelize','','','module runtime call data-flow data-model architecture','define model-init field association CRUD','v6の明示形式；v7専用APIは未対応'],
  ['spring-framework','FD','maven:org.springframework:spring-context,org.springframework:spring-web,org.springframework:spring-webmvc','','maven:org.springframework','','','module runtime call data-flow data-model architecture','bean inject mapping handler model','条件付きBeanの実行評価は対象外'],
  ['dotnet','R','','','','*.csproj global.json','dotnet','command runtime architecture','target-framework sdk entry','netstandardを実行アプリとしない'],
  ['cloudflare-kv','S','','','','wrangler:kv_namespaces','','runtime call data-flow architecture','namespace binding get put delete','unknown namespace IDは別occurrenceを維持'],
  ['firebase','S','npm:firebase,firebase-admin','','npm:firebase/app,firebase-admin/app','firebase.json .firebaserc','','runtime architecture','project app initialize','SDK導入だけで全serviceを使用扱いしない'],
  ['firebase-emulator-suite','E','','','npm:connectAuthEmulator,connectFirestoreEmulator,connectStorageEmulator','firebase:emulators','firebase','command runtime call data-flow architecture','suite service endpoint local-connect start exec only','設定は稼働観測ではない；環境はservice別'],
  ['jvm','R','','','','jvm-target','java','command runtime architecture','jvm-target java-entry','Java等のソースのみでは実行単位を作らない'],
  ['bun','RT','','','npm:bun','bun.lock bun.lockb bunfig.toml packageManager:bun','bun','workspace command package runtime architecture','runtime-entry command task workspace','binary lock内部は未解析'],
  ['deno','RT','','','npm:deno','deno.json deno.jsonc deno.lock','deno','workspace command package module runtime architecture','imports task runtime-entry','remote moduleは取得しない'],
  ['yarn','T','','','','yarn.lock .yarnrc.yml packageManager:yarn','yarn','workspace command package architecture','workspace dependency command','lockはversion補助で直接依存にしない'],
  ['pip','T','','','','pip.conf pip.ini','pip','command package architecture','install command requirement','requirementsだけではpipを採用と断定しない'],
  ['uv','T','','','','uv.lock tool.uv','uv','workspace command package architecture','workspace dependency command','lockの推移依存は直接辺にしない'],
  ['cargo','T','','','','Cargo.toml Cargo.lock','cargo','workspace command package architecture','workspace dependency build test','feature条件は未評価'],
  ['composer','T','','','','composer.json composer.lock','composer','command package module architecture','dependency autoload script','scriptは実行しない'],
  ['nuget','T','','','','PackageReference NuGet.Config Directory.Packages.props','nuget','workspace command package architecture','package-reference project-reference restore','PackageVersionだけでは依存を追加しない'],
  ['angular','UF','npm:@angular/core','','npm:@angular/core,@angular/router','angular.json','','module runtime call data-flow data-model architecture','component template event binding input route','動的DIとtemplate式の実行は未評価'],
  ['nuxt','FU','npm:nuxt','','npm:nuxt','nuxt.config app/pages server/api','','module runtime call data-flow data-model architecture','vue-template page endpoint handler','動的module追加は未解決'],
  ['astro','FU','npm:astro','astro','npm:astro','astro.config','','module runtime call data-flow data-model architecture','frontmatter template island page endpoint','動的componentの実体は未解決'],
  ['spring-boot','FR','maven:org.springframework.boot:spring-boot,org.springframework.boot:spring-boot-starter,org.springframework.boot:spring-boot-starter-web,org.springframework.boot:spring-boot-starter-webflux','','maven:org.springframework.boot','org.springframework.boot','java','module command runtime call data-flow data-model architecture','boot-main configuration mapping handler','自動設定の実行結果は推定しない'],
  ['fastify','F','npm:fastify','','npm:fastify','','','module runtime call data-flow data-model architecture','register prefix route schema handler','動的pluginの登録は未解決'],
  ['axum','F','cargo:axum','','cargo:axum','','','module runtime call data-flow data-model architecture','router route nest handler extractor','macroの完全展開は対象外'],
  ['actix-web','F','cargo:actix-web','','cargo:actix_web','','','module runtime call data-flow data-model architecture','app service route-attribute handler extractor','動的service構築は未解決'],
  ['bootstrap','U','npm:bootstrap','','npm:bootstrap','','','module runtime architecture','resolved-css-asset component-use','CSS class名だけでは製品を検出しない'],
  ['redux-toolkit','UD','npm:@reduxjs/toolkit','','npm:@reduxjs/toolkit','','','module runtime call data-flow data-model architecture','slice store dispatch selector state-field','動的reducer登録は未解決'],
  ['pinia','UD','npm:pinia','','npm:pinia','','','module runtime call data-flow data-model architecture','define-store state-field getter action','動的store識別子は未解決'],
  ['swr','UD','npm:swr','','npm:swr','','','module runtime call data-flow data-model architecture','key fetcher cache mutate result','動的key値は未評価'],
  ['pydantic','D','pypi:pydantic','','pypi:pydantic','','','module runtime call data-flow data-model architecture','base-model field validator validate serialize','動的create_modelは静的引数のみ'],
  ['sqlalchemy','D','pypi:sqlalchemy','','pypi:sqlalchemy','','','module runtime call data-flow data-model architecture','table declarative mapped relationship query','実DBreflectionは実行しない'],
  ['entity-framework-core','D','nuget:Microsoft.EntityFrameworkCore,Microsoft.EntityFrameworkCore.SqlServer,Microsoft.EntityFrameworkCore.Sqlite','','nuget:Microsoft.EntityFrameworkCore','','','module runtime call data-flow data-model architecture','db-context db-set fluent-field relation query save','動的Fluent APIは未評価'],
  ['mui','U','npm:@mui/material,@mui/icons-material','','npm:@mui/material,@mui/icons-material','','','module runtime call data-flow architecture','component-import component-use props event-handler','MUI suiteの別製品は対象に混ぜない'],
  ['radix-ui','U','npm:radix-ui','','npm:radix-ui','','','module runtime call data-flow architecture','primitive-import component-use props event-handler','内部helperと無関係なnamespaceは対象外'],
  ['webpack','T','npm:webpack','','npm:webpack','webpack.config','webpack','command package module architecture','entry output build-command','実行されるplugin設定は未評価'],
  ['esbuild','T','npm:esbuild','','npm:esbuild','','esbuild','command package module architecture','build-api entry output cli','型検査を実装したとは表示しない'],
  ['maven','T','','','','pom.xml','mvn mvnw','workspace command package architecture','module dependency plugin build-test','dependencyManagementはversion補助'],
  ['gradle','T','','','','build.gradle build.gradle.kts settings.gradle settings.gradle.kts libs.versions.toml','gradle gradlew','workspace command package architecture','include dependency catalog task','動的build scriptは実行しない'],
  ['mariadb','S','npm:mariadb|pypi:mariadb|maven:org.mariadb.jdbc:mariadb-java-client','','npm:mariadb|pypi:mariadb','','','runtime call data-flow architecture','provider endpoint query','driverだけで接続先をMariaDBと断定しない'],
  ['sql-server','S','npm:mssql|nuget:Microsoft.Data.SqlClient','','npm:mssql|nuget:Microsoft.Data.SqlClient','','','runtime call data-flow architecture','provider endpoint query','接続文字列の秘密は保存しない'],
  ['redis','SD','npm:redis,ioredis|pypi:redis|go:github.com/redis/go-redis/v9|cargo:redis|gem:redis','','npm:redis,ioredis|pypi:redis|go:github.com/redis/go-redis/v9|cargo:redis|gem:redis','','','runtime call data-flow data-model architecture','client endpoint key operation value','動的keyとunknown endpointを統合しない'],
  ['cloud-firestore','SD','npm:@google-cloud/firestore','','npm:firebase/firestore,firebase-admin/firestore,@google-cloud/firestore','','','runtime call data-flow data-model architecture','collection document field query write','SDK導入だけではcollectionを作らない'],
  ['supabase','SD','npm:@supabase/supabase-js|pypi:supabase','','npm:@supabase/supabase-js|pypi:supabase','supabase/config.toml','','runtime call data-flow data-model architecture','client from field query auth storage','project identity不明は別実体'],
  ['clerk','SD','npm:@clerk/nextjs,@clerk/clerk-react,@clerk/react,@clerk/backend,@clerk/express','','npm:@clerk/nextjs,@clerk/clerk-react,@clerk/react,@clerk/backend,@clerk/express','','','runtime call data-flow architecture','provider middleware auth user','tokenや秘密鍵を取得しない'],
  ['auth0','SD','npm:auth0,@auth0/auth0-react,@auth0/nextjs-auth0,@auth0/auth0-spa-js,express-openid-connect','','npm:auth0,@auth0/auth0-react,@auth0/nextjs-auth0,@auth0/auth0-spa-js,express-openid-connect','','','runtime call data-flow architecture','domain issuer handler session user','業務権限を推定しない'],
  ['jest','T','npm:jest,@jest/globals','','npm:@jest/globals','jest.config','jest','command package runtime call architecture','test-suite test-case assertion command','testグローバルは設定Scope内のみ'],
  ['pytest','T','pypi:pytest','','pypi:pytest','pytest.ini tool.pytest','pytest','command package runtime call architecture','test-suite test-case fixture command','一般関数を本番entryへ昇格しない'],
  ['junit','T','maven:org.junit.jupiter:junit-jupiter,org.junit.jupiter:junit-jupiter-api,junit:junit','','maven:org.junit','','','command package runtime call architecture','test-suite test-annotation assertion build-task','世代ごとの明示annotationのみ'],
  ['cypress','T','npm:cypress','','npm:cypress','cypress.config','cypress','command package runtime call architecture','spec suite test-case browser-operation','test実行を観測したとは表示しない'],
  ['gitlab','P','','','','CI_SERVER_URL gitlab-project','','architecture','repository-provider','CIファイルだけでrepository所在を証明しない'],
  ['gitlab-ci','PT','','','','.gitlab-ci.yml','gitlab-runner','workspace command architecture','local-include job stages needs script','remote include取得禁止；local循環とroot外を拒否'],
  ['docker-compose','PT','','','','compose.yaml compose.yml docker-compose.yml docker-compose.yaml','docker-compose','command runtime architecture','service image build port depends-on','宣言と実行中を区別；曖昧なapp対応は未解決'],
  ['kubernetes','PT','','','','apiVersion:kind','kubectl','command runtime architecture','deployment service ingress selector','secretとkubeconfigを収集しない'],
  ['netlify','P','npm:netlify-cli','','','netlify.toml','netlify','command runtime architecture','build publish function redirect','動的build式は未評価'],
  ['github-pages','P','','','','actions/deploy-pages','','command architecture','workflow job artifact publish','repositoryだけでは公開を推定しない'],
  ['firebase-hosting','P','','','','firebase:hosting','firebase','command runtime architecture','target public rewrite deploy','App Hostingと同一扱いしない'],
  ['nginx','P','','','','nginx.conf','nginx','runtime architecture','server location proxy-pass upstream','includeはlocal root内のみ'],
  ['apache-http-server','P','','','','httpd.conf apache2.conf','httpd apache2','runtime architecture','virtual-host document-root proxy-pass','動的moduleの実行は対象外'],
  ['cloudflare-cdn','C','','','','cloudflare_dns_record:proxied cloudflare_record:proxied cloudflare_ruleset:http_request_cache_settings','','runtime architecture','zone record origin cache','WorkersやR2だけではCDNを検出しない'],
  ['amazon-cloudfront','C','','','','aws_cloudfront_distribution AWS::CloudFront::Distribution','','runtime architecture','distribution origin behavior','動的Refは未解決；関数callにしない'],
  ['fastly-cdn','C','','','','fastly_service_vcl','','runtime architecture','service backend cache','ComputeだけではCDN製品を推定しない'],
  ['google-cloud-cdn','C','','','','google_compute_backend_bucket:enable_cdn google_compute_backend_service:enable_cdn','','runtime architecture','backend origin cache','enable_cdn=trueの明示のみ'],
  ['akamai-ion','C','','','','productId:prd_Fresca productId:prd_SPM','','runtime architecture','property product origin rule','一般Akamaiや他productIdはIonにしない'],
  ['bunny-cdn','C','','','','bunnynet_pullzone bunnynet_pullzone_hostname','','runtime architecture','pull-zone origin cdn-domain','OriginUrl以外のoriginをURLと推定しない'],
  ['jsdelivr','C','','','','cdn.jsdelivr.net','','runtime architecture','source-asset cdn-url origin-package','完全hostnameと解析済みasset参照のみ'],
  ['unpkg','C','','','','unpkg.com','','runtime architecture','source-asset cdn-url origin-package','コメント・任意文字列・偽装suffixは除外'],
];

function pairs(value: string): Partial<Record<Ecosystem, string[]>> {
  return Object.fromEntries(value.split('|').filter(Boolean).map(part => { const at = part.indexOf(':'); return [part.slice(0, at), part.slice(at + 1).split(',').filter(Boolean)]; }));
}
export const stackRegistry: StackSupport[] = rows.map(([stackId, profiles, identifiers, extensions, imports, configs, commands, required, primitives, limits]) => {
  const requiredViews = new Set(['stack', ...required.split(' '), ...(identifiers ? ['package'] : [])]);
  return { stackId, profiles: profiles.split('') as StackProfile[], identifiers: pairs(identifiers), imports: pairs(imports), sourceExtensions: extensions.split(' ').filter(Boolean),
    configForms: configs.split(' ').filter(Boolean), commandNames: commands.split(' ').filter(Boolean), adapter: `stack:${stackId}`, fixtureId: `coverage:${stackId}`,
    requiredPrimitives: primitives.split(' '), limitations: [limits],
    views: Object.fromEntries(allViews.map(view => [view, requiredViews.has(view)
      ? { requirement: 'required', reason: `${stackId}: ${primitives}` }
      : { requirement: 'not-applicable', reason: view === 'workspace' ? 'この製品自体はworkspace memberの宣言形式を持たない' : view === 'data-model' ? 'この製品自体のブランドからmodelを生成しない。明示された利用側の型は言語adapterが扱う' : view === 'call' ? '配信・配置・ツールの宣言を関数として扱わない' : `${stackId}の対応形式に${view}の独立した実体はない。利用側のソースはその言語adapterで扱う` }])) as StackSupport['views'] };
});
const radixPublicPrimitives = ['accordion','alert-dialog','aspect-ratio','avatar','checkbox','collapsible','context-menu','dialog','dropdown-menu','form','hover-card','label','menubar','navigation-menu','popover','progress','radio-group','scroll-area','select','separator','slider','slot','switch','tabs','toast','toggle','toggle-group','toolbar','tooltip'];
const radix = stackRegistry.find(entry => entry.stackId === 'radix-ui')!;
radix.identifiers.npm = ['radix-ui', ...radixPublicPrimitives.map(name => `@radix-ui/react-${name}`)];
radix.imports.npm = [...radix.identifiers.npm];
const emulator = stackRegistry.find(entry => entry.stackId === 'firebase-emulator-suite')!;
emulator.imports = {};
emulator.apiForms = [
  { module: 'firebase/auth', symbol: 'connectAuthEmulator', service: 'auth', endpointArguments: [1] },
  { module: 'firebase/firestore', symbol: 'connectFirestoreEmulator', service: 'firestore', endpointArguments: [1, 2] },
  { module: 'firebase/storage', symbol: 'connectStorageEmulator', service: 'storage', endpointArguments: [1, 2] },
];
for (const id of ['sveltekit','nuxt','astro']) stackRegistry.find(entry => entry.stackId === id)!.requiredPrimitives.push('template', 'event-handler', 'props', 'state-binding');
stackRegistry.find(entry => entry.stackId === 'gitlab-ci')!.views.workspace = { requirement: 'not-applicable', reason: 'pipelineのinclude/jobはCommand/Architectureの構成。workspace memberではない' };
stackRegistry.find(entry => entry.stackId === 'aspnet-core')!.configForms.push('FrameworkReference:Microsoft.AspNetCore.App');
for(const id of ['clerk','auth0']){const support=stackRegistry.find(entry=>entry.stackId===id)!;support.views['data-model']={requirement:'required',reason:'利用側User/Session型とfieldを言語adapterが保持し、認証操作の入力/出力へ結ぶ。ブランドmodelは生成しない'};support.requiredPrimitives.push('application-user-session-field','typed-auth-input-output');}

export function normalizeIdentifier(ecosystem: Ecosystem, value: string): string {
  const trimmed = value.trim();
  return ecosystem === 'pypi' ? trimmed.toLowerCase().replace(/[-_.]+/g, '-') : ecosystem === 'nuget' ? trimmed.toLowerCase() : trimmed;
}
export function registeredStackForDependency(ecosystem: Ecosystem, name: string): StackSupport | undefined {
  const value = normalizeIdentifier(ecosystem, name);
  return stackRegistry.find(entry => entry.identifiers[ecosystem]?.some(id => normalizeIdentifier(ecosystem, id) === value));
}
export const stackSupportById = new Map(stackRegistry.map(entry => [entry.stackId, entry]));
