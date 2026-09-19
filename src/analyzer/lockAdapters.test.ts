import{describe,expect,it}from'vitest';
import{lockVersions}from'./lockAdapters';
import{scanProjectFiles}from'./scan';
import type{AnalyzerSourceFile}from'./types';
const files=(sources:Record<string,string>):AnalyzerSourceFile[]=>Object.entries(sources).map(([relativePath,source])=>({relativePath,name:relativePath.split('/').at(-1)!,extension:'.'+relativePath.split('.').at(-1),size:source.length,readText:async()=>source}));
describe('lock resolution metadata',()=>{
  it.each(['1.2.3','1.2.3-alpha.1','1.2.3+build.7','1.2.3-alpha.1+build.7'])('preserves valid combined SemVer parts in Cargo and Bun: %s',version=>{expect(lockVersions('Cargo.lock',`version=4\n[[package]]\nname="example"\nversion="${version}"`)[0]).toMatchObject({version});expect(lockVersions('bun.lock',JSON.stringify({lockfileVersion:1,packages:{example:[`example@${version}`]}}))[0]).toMatchObject({version});});
  it('selects Cargo and uv dependency records through their actual owner and source identity',async()=>{
    const cargo=await scanProjectFiles(files({'Cargo.toml':'[package]\nname="app"\nversion="0.1.0"\n[dependencies]\naxum="0.8"','Cargo.lock':'version=4\n[[package]]\nname="app"\nversion="0.1.0"\ndependencies=["axum 0.8.0"]\n[[package]]\nname="axum"\nversion="0.7.0"\nsource="registry+https://github.com/rust-lang/crates.io-index"\n[[package]]\nname="axum"\nversion="0.8.0"\nsource="registry+https://github.com/rust-lang/crates.io-index"'}));expect(cargo.relations.find(edge=>edge.kind==='depends-on')?.metadata.resolvedVersion).toBe('0.8.0');
    const uv=await scanProjectFiles(files({'pyproject.toml':'[project]\nname="app"\ndependencies=["pydantic"]','uv.lock':'version=1\n[[package]]\nname="app"\nversion="0.1.0"\nsource={editable="."}\ndependencies=[{name="pydantic",version="2.12.0rc1",source={registry="https://pypi.org/simple"}}]\n[[package]]\nname="pydantic"\nversion="2.12.0rc1"\nsource={registry="https://pypi.org/simple"}\n[[package]]\nname="pydantic"\nversion="2.12.0rc1"\nsource={registry="https://private.example/simple"}'}));expect(uv.relations.find(edge=>edge.kind==='depends-on')?.metadata.resolvedVersion).toBe('2.12.0rc1');
  });
  it('loads explicitly selected custom Deno/NuGet lock paths and preserves framework-specific resolutions',async()=>{
    const deno=await scanProjectFiles(files({'deno.json':'{"imports":{"graphql":"npm:graphql@^17"},"lock":{"path":"locks/dependencies.data"}}','locks/dependencies.data':'{"version":"5","specifiers":{"npm:graphql@^17":"17.0.2"}}'}));expect(deno.relations.find(edge=>edge.kind==='depends-on')?.metadata).toMatchObject({resolvedVersion:'17.0.2',lockPath:'locks/dependencies.data'});
    const nuget=await scanProjectFiles(files({'app.csproj':'<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFrameworks>net9.0;net10.0</TargetFrameworks><NuGetLockFilePath>locks/packages.data</NuGetLockFilePath></PropertyGroup><ItemGroup><PackageReference Include="Example" Version="*"/></ItemGroup></Project>','locks/packages.data':'{"version":2,"dependencies":{"net9.0":{"Example":{"type":"Direct","resolved":"9.0.1"}},"net10.0":{"Example":{"type":"Direct","resolved":"10.0.1"}}}}'}));const relation=nuget.relations.find(edge=>edge.kind==='depends-on')!;expect(relation.metadata.resolvedVersion).toBeUndefined();expect(relation.metadata.resolvedVersions).toEqual(['9.0.1','10.0.1']);expect(JSON.parse(String(relation.metadata.lockResolutions)).map((row:{framework:string})=>row.framework)).toEqual(['net9.0','net10.0']);expect(relation.evidenceIds.length).toBe(3);
  });
  it('retains Composer development versions and reports unsupported formats without assigning them',async()=>{expect(lockVersions('composer.lock','{"packages":[{"name":"example/pkg","version":"dev-main"}]}')[0]?.version).toBe('dev-main');const store=await scanProjectFiles(files({'pyproject.toml':'[project]\nname="app"\ndependencies=["example"]','uv.lock':'version=1\n[[package]]\nname="example"\nversion="unrecognized-version"'}));expect(store.relations.every(edge=>!edge.metadata.resolvedVersion)).toBe(true);expect(store.warnings.some(warning=>warning.message.includes('version表現'))).toBe(true);});
  it('cites live YAML/TOML records when comments contain matching names or follow headers',()=>{
    const yarn='# react@npm:^19\n__metadata:\n  version: 10\n"react@npm:^19":\n  version: 19.2.0\n  resolution: "react@npm:19.2.0"';const record=lockVersions('yarn.lock',yarn)[0]!;expect(yarn.slice(record.start,record.end)).toBe('19.2.0');
    const uv='version=1\n[[package]] # first\nname="fastapi"\nversion="0.120.0"\n[[package]]\nname="unused"\nversion="1.0.0"';const first=lockVersions('uv.lock',uv)[0]!;expect(uv.slice(first.start,first.end)).toContain('0.120.0');expect(uv.slice(first.start,first.end)).not.toContain('unused');
    const composer='{"_readme":["laravel/framework old note"],"packages":[{"name":"laravel/framework","version":"v12.0.0"}]}';const php=lockVersions('composer.lock',composer)[0]!;expect(composer.slice(php.start,php.end)).toBe('{"name":"laravel/framework","version":"v12.0.0"}');
  });
  it('does not inherit a root lock across an independently declared child project',async()=>{
    const store=await scanProjectFiles(files({'package.json':'{"name":"root","dependencies":{"react":"^19"}}','child/package.json':'{"name":"child","dependencies":{"react":"^18"}}','bun.lock':'{"lockfileVersion":1,"packages":{"react":["react@19.2.0", "", {}]}}'}));
    expect(store.relations.filter(edge=>edge.kind==='depends-on'&&edge.sourceId==='package:child').every(edge=>!edge.metadata.resolvedVersion)).toBe(true);
  });
  it.each([
    ['yarn.lock','"react@^19":\n  version "19.2.0"\n  resolved "https://example.com/react.tgz"','npm','react'],
    ['yarn.lock','__metadata:\n  version: 10\n"react@npm:^19":\n  version: 19.2.0\n  resolution: "react@npm:19.2.0"','npm','react'],
    ['bun.lock','{"lockfileVersion":1,"packages":{"react":["react@19.2.0", "", {}]},}','npm','react'],
    ['deno.lock','{"version":"5","specifiers":{"npm:react@^19":"19.2.0"},"npm":{"react@19.2.0":{}}}','npm','react'],
    ['Cargo.lock','version = 4\n[[package]]\nname="axum"\nversion="0.8.0"','cargo','axum'],
    ['uv.lock','version=1\n[[package]]\nname="fastapi"\nversion="0.120.0"\nsource={registry="https://pypi.org/simple"}','pypi','fastapi'],
    ['composer.lock','{"packages":[{"name":"laravel/framework","version":"v12.0.0"}],"packages-dev":[]}','composer','laravel/framework'],
    ['packages.lock.json','{"version":2,"dependencies":{"net10.0":{"Microsoft.EntityFrameworkCore":{"type":"Direct","resolved":"10.0.0"}}}}','nuget','Microsoft.EntityFrameworkCore'],
  ])('reads explicit name/version in %s', (path,source,ecosystem,name)=>{const record=lockVersions(path,source).find(record=>record.name===name)!;expect(record.ecosystem).toBe(ecosystem);expect(record.start).toBeGreaterThanOrEqual(0);expect(record.end).toBeLessThanOrEqual(source.length);expect(source.slice(record.start,record.end)).not.toBe('');});
  it('supplements direct edges without promoting transitive entries or changing dev scope',async()=>{
    const store=await scanProjectFiles(files({'package.json':'{"name":"app","devDependencies":{"react":"^19"}}','yarn.lock':'"react@^19":\n  version "19.2.0"\n"transitive@^1":\n  version "1.0.0"\n'}));
    const edge=store.relations.find(edge=>edge.kind==='depends-on')!;expect(edge.metadata).toMatchObject({dependencyType:'devDependency',resolvedVersion:'19.2.0',lockPath:'yarn.lock'});
    expect(store.facts.some(fact=>fact.kind==='external-package'&&fact.packageName==='transitive')).toBe(false);
  });
  it('keeps duplicate versions, Yarn virtual/workspace and unsupported lock versions unresolved',async()=>{
    expect(lockVersions('yarn.lock','__metadata:\n  version: 10\n"local@workspace:*":\n  version: 0.0.0-use.local\n  resolution: "local@workspace:packages/local"')).toHaveLength(0);
    expect(()=>lockVersions('packages.lock.json','{"version":3}')).toThrow('未対応');
    const store=await scanProjectFiles(files({'pyproject.toml':'[project]\nname="api"\ndependencies=["fastapi"]','uv.lock':'version=1\n[[package]]\nname="fastapi"\nversion="0.119.0"\n[[package]]\nname="fastapi"\nversion="0.120.0"'}));
    expect(store.relations.filter(edge=>edge.kind==='depends-on').every(edge=>!edge.metadata.resolvedVersion)).toBe(true);expect(store.warnings.some(item=>item.message.includes('複数'))).toBe(true);
  });
  it('respects disabled Deno locks',async()=>{
    const store=await scanProjectFiles(files({'deno.json':'{"imports":{"react":"npm:react@^19"},"lock":false}','deno.lock':'{"version":"5","specifiers":{"npm:react@^19":"19.2.0"}}'}));expect(store.relations.every(edge=>!edge.metadata.resolvedVersion)).toBe(true);
  });
});
