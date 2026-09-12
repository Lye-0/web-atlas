import { describe, expect, it } from 'vitest';
import { parseManifest, localPath, parseStructuredConfig, staticBlocks } from './manifestAdapters';
import { scanProjectFiles } from './scan';
import type { AnalyzerSourceFile } from './types';
import { registeredStackForDependency, stackRegistry } from './stackRegistry';
import { expandedStacks } from '../data/expandedStacks';
import { applicationStacks } from '../data/applicationStacks';
import { platformStacks } from '../data/platformStacks';
import { deliveryStacks } from '../data/deliveryStacks';

export const fixtureFiles = (sources: Record<string, string>): AnalyzerSourceFile[] => Object.entries(sources).map(([relativePath, source]) => ({ relativePath, name: relativePath.split('/').at(-1)!, extension: '.' + relativePath.split('.').at(-1), size: source.length, readText: async () => source }));

describe('ecosystem manifest contracts', () => {
  it('applies MSBuild imports in document order and selects only exact shared configuration names',()=>{const source='<Project><PropertyGroup><UseWPF>false</UseWPF></PropertyGroup><Import Project="config/Directory.Build.props"/></Project>';const sources=new Map(Object.entries({'global.json':'{"sdk":{"version":"10.0.100"}}','app/backup-global.json':'{"sdk":{"version":"999"}}','app/NotDirectory.Build.props':'<Project><PropertyGroup><TargetFramework>fake</TargetFramework></PropertyGroup></Project>','app/config/Directory.Build.props':'<Project><PropertyGroup><UseWPF>true</UseWPF></PropertyGroup></Project>','app/app.csproj':source}));const result=parseManifest('app/app.csproj',source,sources)!;expect(result.attributes).toMatchObject({useWpf:true,sdkVersion:'10.0.100',targetFramework:''});});
  it('inherits static .NET build properties, preserves project overrides and keeps SDK selection separate',()=>{
    const sources=new Map(Object.entries({'Directory.Build.props':'<Project><PropertyGroup><TargetFramework>net10.0-windows</TargetFramework><UseWPF>true</UseWPF></PropertyGroup><PropertyGroup Condition="unknown"><OutputType>WinExe</OutputType></PropertyGroup></Project>','global.json':'{"sdk":{"version":"10.0.100","rollForward":"latestPatch"}}','apps/api/api.csproj':'<Project Sdk="Microsoft.NET.Sdk.Web"><PropertyGroup><UseWPF>false</UseWPF><TargetFramework>net10.0</TargetFramework></PropertyGroup></Project>','apps/desktop/app.csproj':'<Project Sdk="Microsoft.NET.Sdk"/>'}));
    const api=parseManifest('apps/api/api.csproj',sources.get('apps/api/api.csproj')!,sources)!;expect(api.attributes).toMatchObject({targetFramework:'net10.0',useWpf:false,webSdk:true,sdkVersion:'10.0.100',sdkConfigPath:'global.json',outputType:''});expect(api.tools).not.toContain('wpf');expect(api.unresolved.some(reason=>reason.includes('条件'))).toBe(true);const desktop=parseManifest('apps/desktop/app.csproj',sources.get('apps/desktop/app.csproj')!,sources)!;expect(desktop.attributes.useWpf).toBe(true);expect(desktop.tools).toContain('wpf');
  });
  it('registers all 94 planned products with an explicit view contract and limitations', () => {
    const ids = [...expandedStacks, ...applicationStacks, ...platformStacks, ...deliveryStacks].map(stack => stack.id).sort();
    expect(stackRegistry.map(entry => entry.stackId).sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(94);
    for (const entry of stackRegistry) { expect(Object.keys(entry.views)).toHaveLength(10); expect(entry.views.stack.requirement).toBe('required'); expect(entry.requiredPrimitives.length).toBeGreaterThan(0); expect(entry.limitations.length).toBeGreaterThan(0); }
  });
  it('normalizes identities only according to their own ecosystem', () => {
    expect(registeredStackForDependency('pypi', 'SQLAlchemy')?.stackId).toBe('sqlalchemy');
    expect(registeredStackForDependency('nuget', 'microsoft.entityframeworkcore')?.stackId).toBe('entity-framework-core');
    expect(registeredStackForDependency('npm', 'SQLAlchemy')).toBeUndefined();
    expect(registeredStackForDependency('nuget', 'Microsoft-EntityFrameworkCore')).toBeUndefined();
    expect(registeredStackForDependency('maven', 'other:spring-web')).toBeUndefined();
    expect(registeredStackForDependency('npm', '@radix-ui/private-helper')).toBeUndefined();
  });
  it.each([
    ['pyproject.toml', '[project]\nname="api"\ndependencies=["FastAPI>=0.100", "pydantic>=2"]', 'pypi', ['FastAPI','pydantic']],
    ['Cargo.toml', '[package]\nname="api"\nversion="0.1.0"\n[dependencies]\naxum="0.8"\n[dev-dependencies]\nserde="1"', 'cargo', ['axum','serde']],
    ['composer.json', '{"name":"team/api","require":{"php":"^8","laravel/framework":"^12"}}', 'composer', ['laravel/framework']],
    ['go.mod', 'module example.com/api\nrequire (\n github.com/gin-gonic/gin v1.10.0\n example.com/transitive v1.0.0 // indirect\n)', 'go', ['github.com/gin-gonic/gin']],
    ['Gemfile', 'gem "rails", "~> 8"\n# gem "bogus"', 'gem', ['rails']],
    ['pubspec.yaml', 'name: app\ndependencies:\n  http: ^1.0\n', 'dart', ['http']],
    ['Package.swift', 'let package = Package(name: "Client", dependencies: [.package(url: "https://example.com/Library.git", from: "1.0.0")])', 'swift', ['https://example.com/Library.git']],
    ['pom.xml', '<project><artifactId>api</artifactId><dependencies><dependency><groupId>org.springframework</groupId><artifactId>spring-web</artifactId><version>6</version></dependency></dependencies><dependencyManagement><dependencies><dependency><groupId>example</groupId><artifactId>unused</artifactId><version>1</version></dependency></dependencies></dependencyManagement></project>', 'maven', ['org.springframework:spring-web']],
    ['api.csproj', '<Project Sdk="Microsoft.NET.Sdk"><ItemGroup><PackageReference Include="Microsoft.EntityFrameworkCore" Version="10"/><FrameworkReference Include="Microsoft.AspNetCore.App"/></ItemGroup></Project>', 'nuget', ['Microsoft.EntityFrameworkCore']],
  ])('reads explicit direct dependencies from %s', (path, source, ecosystem, expected) => {
    const parsed = parseManifest(path, source, new Map([[path, source]]))!;
    expect(parsed.ecosystem).toBe(ecosystem); expect(parsed.dependencies.map(dep => dep.name)).toEqual(expected);
    expect(parsed.dependencies.every(dep => dep.end > dep.start)).toBe(true);
    if (ecosystem === 'nuget') { expect(parsed.tools).toContain('aspnet-core'); expect(parsed.attributes.webSdk).toBe(false); }
  });
  it('resolves only used Gradle catalog aliases and central NuGet versions', () => {
    const sources = new Map([['gradle/libs.versions.toml', '[versions]\nspring="6.2"\n[libraries]\nspring-web={module="org.springframework:spring-web",version.ref="spring"}\nunused={module="org.junit.jupiter:junit-jupiter",version="5"}'], ['Directory.Packages.props','<Project><ItemGroup><PackageVersion Include="Example.Core" Version="4"/><PackageVersion Include="Unused" Version="7"/></ItemGroup></Project>']]);
    const gradle = parseManifest('build.gradle.kts','dependencies { implementation(libs.spring.web) }', sources)!;
    expect(gradle.dependencies.map(dep => [dep.name,dep.version])).toEqual([['org.springframework:spring-web','6.2']]);
    const nuget = parseManifest('api.csproj','<Project><ItemGroup><PackageReference Include="Example.Core"/></ItemGroup></Project>',sources)!;
    expect(nuget.dependencies.map(dep => [dep.name,dep.version])).toEqual([['Example.Core','4']]);
  });
  it('retains the actual Maven occurrence and escaped source token instead of fabricated offsets', () => {
    const described='{"description":"react app","dependencies":{"react":"19"}}';const actualDependency=parseManifest('package.json',described,new Map())!.dependencies[0]!;
    expect(actualDependency.start).toBe(described.lastIndexOf('react'));
    const pom = '<project><dependencyManagement><dependencies><dependency><groupId>x</groupId><artifactId>same</artifactId><version>9</version></dependency></dependencies></dependencyManagement><dependencies><dependency><groupId>x</groupId><artifactId>same</artifactId></dependency></dependencies></project>';
    const result = parseManifest('pom.xml',pom,new Map())!; const dep = result.dependencies[0]!;
    expect(pom.slice(dep.start,dep.end)).toBe('same'); expect(dep.start).toBe(pom.lastIndexOf('same')); expect(dep.version).toBe('9');
    const json = '{"dependencies":{"react":"19"},"scripts":{"say":"echo \\"quoted\\""}}';
    const command = parseManifest('package.json',json,new Map())!.commands[0]!;
    expect(json.slice(command.start,command.end)).toBe(String.raw`echo \"quoted\"`);
    const escaped = String.raw`{"dependencies":{"re\u0061ct":"19"}}`;
    const parsed = parseManifest('package.json',escaped,new Map())!; const actual = parsed.dependencies[0]!;
    expect(actual.name).toBe('react'); expect(escaped.slice(actual.start,actual.end)).toBe('"re\\u0061ct"');
  });
  it('does not read commented Gradle dependencies or flatten named project blocks into root', () => {
    const source = `dependencies {
      // implementation("wrong:comment:1")
      /* implementation("wrong:block:1") */
      implementation("real:root:1")
    }
    project(":api") { dependencies { implementation("real:api:2") } }`;
    const result = parseManifest('build.gradle.kts',source,new Map())!;
    expect(result.dependencies.map(dep=>dep.name)).toEqual(['real:root']);
    expect(result.children?.[0]?.directory).toBe('api'); expect(result.children?.[0]?.dependencies.map(dep=>dep.name)).toEqual(['real:api']);
    const dep=result.children![0]!.dependencies[0]!; expect(source.slice(dep.start,dep.end)).toContain('real:api:2');
  });
  it('preserves MSBuild conditions and Gemfile test groups', () => {
    const source = `<Project><PropertyGroup Condition="'$(Configuration)' == 'Debug'"><UseWPF>true</UseWPF></PropertyGroup><ItemGroup Condition="'$(TargetFramework)' == 'net10.0'"><PackageReference Include="Example.Core" Version="1"/></ItemGroup></Project>`;
    const result = parseManifest('app.csproj',source,new Map())!;
    expect(result.attributes.useWpf).toBe(false); expect(result.tools).not.toContain('wpf'); expect(result.dependencies[0]!.condition).toContain('TargetFramework'); expect(result.unresolved.some(value=>value.includes('Configuration'))).toBe(true);
    const gems = parseManifest('Gemfile', 'gem "rails"\ngroup :development, :test do\n  gem "rspec"\nend\ngem "pg"\n', new Map())!;
    expect(gems.dependencies.map(dep=>[dep.name,dep.type])).toEqual([['rails','dependency'],['rspec','devDependency'],['pg','dependency']]);
  });
  it('keeps standalone polyglot projects, direct dependency owners, and explicit members separate', async () => {
    const store = await scanProjectFiles(fixtureFiles({
      'apps/web/package.json': '{"name":"web","dependencies":{"vue":"3"}}',
      'services/api/pyproject.toml':'[project]\nname="api"\ndependencies=["fastapi", "pydantic"]',
      'services/api/main.py':'from fastapi import FastAPI\nfrom .models import User\napp = FastAPI()\ndef read():\n return User()',
      'services/api/models.py':'class User:\n name: str',
    }));
    const projects = store.facts.filter(fact => fact.kind === 'workspace-package');
    expect(projects.map(project => project.packagePath).sort()).toEqual(['apps/web','services/api']);
    expect(store.facts.some(fact => fact.kind === 'workspace-pattern')).toBe(false);
    const dep = store.facts.find(fact => fact.kind === 'external-package' && fact.packageName === 'fastapi')!;
    const api = projects.find(project => project.packagePath === 'services/api')!;
    expect(store.relations.some(edge => edge.sourceId === api.id && edge.targetId === dep.id && edge.kind === 'depends-on')).toBe(true);
    expect(store.facts.some(fact => fact.kind === 'module-dependency' && fact.sourcePath.endsWith('main.py') && fact.targetPath.endsWith('models.py'))).toBe(true);
    expect(store.facts.some(fact => fact.kind === 'technology' && fact.dictionaryStackId === 'fastapi')).toBe(true);
  });
  it('rejects external entities, excessive YAML aliases, malformed blocks, and escaping paths', () => {
    expect(() => parseStructuredConfig('project.xml','<!DOCTYPE x [<!ENTITY y SYSTEM "file:///secret">]><project/>')).toThrow();
    expect(() => parseStructuredConfig('x.yaml','a: 1\na: 2')).toThrow();
    expect(() => staticBlocks('resource "x" "y" { origin = "unterminated')).toThrow();
    expect(localPath('apps/api', '../../../secret')).toBeUndefined();
    expect(localPath('.', 'https://example.com/source')).toBeUndefined();
  });
});
