import { parse as parseToml } from 'smol-toml';
import { parseDocument } from 'yaml';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { parseJsonc } from './parsers';
import type { Ecosystem } from './stackRegistry';
import type { AnalyzerDependencyType } from './types';
import { sourceSyntax } from './sourceSyntax';
import { jsonLocations } from './jsonLocations';
import {directoryFor,localPath}from'./projectPaths';
export {directoryFor,localPath}from'./projectPaths';

export interface ManifestDependency { name: string; version: string; type: AnalyzerDependencyType; start: number; end: number; condition?: string }
export interface ManifestCommand { name: string; command: string; start: number; end: number; purpose?: string }
export interface ManifestProject {
  path: string; directory: string; name: string; ecosystem: Ecosystem;
  dependencies: ManifestDependency[]; commands: ManifestCommand[]; members: string[]; projectReferences: string[];
  tools: string[]; attributes: Record<string, string | boolean | string[]>; unresolved: string[];
  children?: ManifestProject[];
}
type ObjectValue = Record<string, unknown>;
export const objectValue = (value: unknown): ObjectValue => value && typeof value === 'object' && !Array.isArray(value) ? value as ObjectValue : {};
export const arrayValue = (value: unknown): unknown[] => value == null ? [] : Array.isArray(value) ? value : [value];
export const textValue = (value: unknown): string => typeof value === 'string' || typeof value === 'number' ? String(value) : typeof objectValue(value)['#text'] === 'string' ? String(objectValue(value)['#text']) : '';
export function parseStructuredConfig(path: string, source: string): ObjectValue {
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('外部entity / DTDは解析対象外');
  if (/\.(?:ya?ml)$/i.test(path)) {
    const document = parseDocument(source, { uniqueKeys: true, strict: true });
    if (document.errors.length) throw new Error(document.errors[0]!.message);
    return objectValue(document.toJS({ maxAliasCount: 50 }));
  }
  if (/\.toml$/i.test(path)) return objectValue(parseToml(source));
  if (/\.(?:xml|csproj|props|slnx|config)$/i.test(path) || /<Project\b|<project\b/.test(source)) {
    const validation = XMLValidator.validate(source); if (validation !== true) throw new Error(validation.err.msg);
    return objectValue(new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', processEntities: false, parseTagValue: false, trimValues: true, captureMetaData: true }).parse(source));
  }
  return objectValue(parseJsonc(source));
}
export function sourceRangeFor(source: string, value: string, from = 0): { start: number; end: number } {
  let index = source.indexOf(value, from);
  if (index >= 0 && value) return { start: index, end: index + value.length };
  const escaped = JSON.stringify(value).slice(1, -1); index = source.indexOf(escaped, from);
  if (index >= 0 && escaped) return { start: index, end: index + escaped.length };
  // A decoded JSON key may use unicode escapes. Resolve the actual token range.
  for (const match of source.slice(from).matchAll(/"(?:\\.|[^"\\])*"/g)) try { if (JSON.parse(match[0]) === value) return { start: from + match.index!, end: from + match.index! + match[0].length }; } catch { /* malformed literal stays unresolved */ }
  throw new Error(`元の範囲を特定できません: ${value.slice(0, 80)}`);
}
function xmlStart(node: ObjectValue): number { return (node as Record<symbol, { startIndex?: number }>)[XMLParser.getMetaDataSymbol() as symbol]?.startIndex ?? 0; }
function project(path: string, ecosystem: Ecosystem): ManifestProject {
  const directory = directoryFor(path);
  return { path, directory, ecosystem, name: directory === '.' ? ecosystem : directory.split('/').at(-1)!, dependencies: [], commands: [], members: [], projectReferences: [], tools: [], attributes: {}, unresolved: [] };
}
function addDependency(target: ManifestProject, source: string, name: string, version: unknown, type: AnalyzerDependencyType = 'dependency', condition?: string, suppliedRange?: { start: number; end: number }) {
  if (!name) return;
  const range = suppliedRange ?? sourceRangeFor(source, name);
  target.dependencies.push({ name, version: textValue(version) || '*', type, ...range, ...(condition ? { condition } : {}) });
}
function addCommand(target: ManifestProject, source: string, name: string, command: string, purpose?: string, suppliedRange?: { start: number; end: number }) {
  if (!command) return;
  target.commands.push({ name, command, ...(suppliedRange ?? sourceRangeFor(source, command)), ...(purpose ? { purpose } : {}) });
}
function requirement(target: ManifestProject, source: string, line: string, type: AnalyzerDependencyType = 'dependency') {
  const match = line.trim().match(/^([A-Za-z0-9][A-Za-z0-9_.-]*)(?:\[[^\]]+\])?\s*(.*)$/);
  if (!match) { if (line.trim() && !line.trim().startsWith('#')) target.unresolved.push(`未対応requirements: ${line.trim().slice(0, 120)}`); return; }
  const [version = '', condition] = match[2]!.split(';');
  addDependency(target, source, match[1]!, version.trim() || '*', type, condition?.trim());
}
function tableDependencies(target: ManifestProject, source: string, table: unknown, type: AnalyzerDependencyType, condition?: string) {
  for (const [alias, raw] of Object.entries(objectValue(table))) {
    const data = objectValue(raw); const name = textValue(data.package) || alias;
    addDependency(target, source, name, typeof raw === 'string' ? raw : data.version ?? data.git ?? data.path ?? '*', type, condition);
    if (data.path) target.projectReferences.push(String(data.path));
  }
}

/** Delimited static configuration blocks; strings and comments cannot close a block. */
export function staticBlocks(source: string): Array<{ type: string; labels: string[]; start: number; end: number; bodyStart: number; body: string }> {
  const blocks: ReturnType<typeof staticBlocks> = [];
  let quote = '', escaped = false, comment = '', depth = 0, start = 0;
  const stack: Array<{ header: string; start: number; bodyStart: number; depth: number }> = [];
  for (let i = 0; i < source.length; i++) {
    const c = source[i]!; const next = source[i + 1];
    if (comment === 'line') { if (c === '\n') { comment = ''; start = i + 1; } continue; }
    if (comment === 'block') { if (c === '*' && next === '/') { comment = ''; i++; } continue; }
    if (quote) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === quote) quote = ''; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '#' || c === '/' && next === '/') { comment = 'line'; continue; }
    if (c === '/' && next === '*') { comment = 'block'; i++; continue; }
    if (c === '{') { stack.push({ header: source.slice(start, i).trim(), start, bodyStart: i + 1, depth }); depth++; start = i + 1; }
    else if (c === '}') {
      const open = stack.pop(); if (!open) throw new Error('対応する開始braceがありません'); depth--;
      const header = open.header.match(/([\w.-]+)\s*((?:"[^"\n]*"\s*)*|\([^{}]*\))$/);
      if (header) blocks.push({ type: header[1]!, labels: [...header[2]!.matchAll(/"([^"\n]*)"/g)].map(match => match[1]!), start: open.start, end: i + 1, bodyStart: open.bodyStart, body: source.slice(open.bodyStart, i) });
      start = i + 1;
    } else if (c === '\n' || c === ';') start = i + 1;
  }
  if (quote || comment === 'block' || depth) throw new Error('未完了の文字列/comment/brace');
  return blocks;
}

export function parseManifest(path: string, source: string, sources: ReadonlyMap<string, string>): ManifestProject | undefined {
  const name = path.split('/').at(-1)!.toLowerCase();
  if(name==='compile_commands.json'){
    const data=parseJsonc(source);if(!Array.isArray(data))return;const result=project(path,'native');const directories=[...new Set(data.flatMap(raw=>{const item=objectValue(raw);const directory=localPath(result.directory,textValue(item.directory)||'.');return directory&&typeof item.file==='string'?[directory]:[];}))];
    if(directories.length===1){result.directory=directories[0]!;result.name=result.directory==='.'?'Native project':result.directory.split('/').at(-1)!;result.attributes.configScope='compilation-database';}else result.unresolved.push('compilation databaseのproject directoryが複数または未解決');return result;
  }
  if (name === 'package.json') {
    const data = parseStructuredConfig(path, source); const result = project(path, 'npm'); result.name = textValue(data.name) || result.name;
    const locations=jsonLocations(source);
    for (const [field, type] of [['dependencies', 'dependency'], ['devDependencies', 'devDependency'], ['peerDependencies', 'peerDependency'], ['optionalDependencies', 'optionalDependency']] as const) for(const[dependency,version]of Object.entries(objectValue(data[field])))addDependency(result,source,dependency,version,type,undefined,locations.get(JSON.stringify([field,dependency]))?.key);
    for (const [key, command] of Object.entries(objectValue(data.scripts))) addCommand(result, source, key, textValue(command),undefined,locations.get(JSON.stringify(['scripts',key]))?.value);
    result.members = arrayValue(Array.isArray(data.workspaces) ? data.workspaces : objectValue(data.workspaces).packages).map(textValue).filter(Boolean);
    const manager = textValue(data.packageManager).split('@')[0]; if (manager) result.tools.push(manager);
    return result;
  }
  if (name === 'pyproject.toml' || /^requirements[^/]*\.txt$/.test(name) || name === 'setup.cfg') {
    const result = project(path, 'pypi');
    if (name === 'pyproject.toml') {
      const data = parseStructuredConfig(path, source); const proj = objectValue(data.project); const tool = objectValue(data.tool);
      result.name = textValue(proj.name) || result.name;
      arrayValue(proj.dependencies).map(textValue).filter(Boolean).forEach(line => requirement(result, source, line));
      for (const [group, dependencies] of Object.entries(objectValue(proj['optional-dependencies']))) arrayValue(dependencies).map(textValue).forEach(line => requirement(result, source, line, /test|dev/.test(group) ? 'devDependency' : 'optionalDependency'));
      for (const dependencies of Object.values(objectValue(data['dependency-groups']))) arrayValue(dependencies).filter(value => typeof value === 'string').forEach(line => requirement(result, source, String(line), 'devDependency'));
      const poetry = objectValue(tool.poetry); tableDependencies(result, source, poetry.dependencies, 'dependency'); result.dependencies = result.dependencies.filter(dep => dep.name !== 'python');
      for (const [key, value] of Object.entries(objectValue(proj.scripts))) addCommand(result, source, key, textValue(value), 'entry-point');
      if (tool.uv) { result.tools.push('uv'); result.members = arrayValue(objectValue(objectValue(tool.uv).workspace).members).map(textValue).filter(Boolean); }
      if (tool.pytest){result.tools.push('pytest');const options=objectValue(objectValue(tool.pytest).ini_options);result.attributes.pytestTestpaths=arrayValue(options.testpaths).map(textValue).filter(Boolean);result.attributes.pytestPythonFiles=arrayValue(options.python_files).map(textValue).filter(Boolean);}
    } else if (name === 'setup.cfg') {
      const match = source.match(/(?:^|\n)install_requires\s*=([^]*?)(?=\n\S|$)/); match?.[1]?.split('\n').forEach(line => requirement(result, source, line));
      result.name = source.match(/(?:^|\n)name\s*=\s*([^\n]+)/)?.[1]?.trim() || result.name;
    } else for (const line of source.split(/\r?\n/)) { if (/^\s*(?:#|$)/.test(line)) continue; if (/^\s*-/.test(line)) { result.unresolved.push(`requirements include/option: ${line.trim()}`); continue; } requirement(result, source, line.replace(/\s+#.*$/, '')); }
    return result;
  }
  if (name === 'cargo.toml') {
    const data = parseStructuredConfig(path, source); const result = project(path, 'cargo'); result.name = textValue(objectValue(data.package).name) || result.name; result.tools.push('cargo');
    tableDependencies(result, source, data.dependencies, 'dependency'); tableDependencies(result, source, data['dev-dependencies'], 'devDependency'); tableDependencies(result, source, data['build-dependencies'], 'devDependency', 'build');
    for (const [condition, raw] of Object.entries(objectValue(data.target))) tableDependencies(result, source, objectValue(raw).dependencies, 'dependency', condition);
    result.members = arrayValue(objectValue(data.workspace).members).map(textValue).filter(Boolean); result.attributes.workspaceRoot = Boolean(data.workspace);
    return result;
  }
  if (name === 'composer.json') {
    const data = parseStructuredConfig(path, source); const result = project(path, 'composer'); result.name = textValue(data.name) || result.name; result.tools.push('composer');
    tableDependencies(result, source, data.require, 'dependency'); tableDependencies(result, source, data['require-dev'], 'devDependency');
    result.dependencies = result.dependencies.filter(dep => dep.name.includes('/'));
    for (const [key, value] of Object.entries(objectValue(data.scripts))) arrayValue(value).map(textValue).forEach((command, index) => addCommand(result, source, `${key}${index ? `:${index}` : ''}`, command));
    result.attributes.autoload = JSON.stringify(objectValue(data.autoload)); return result;
  }
  if (name === 'go.mod' || name === 'go.work') {
    const result = project(path, 'go'); result.name = source.match(/^module\s+(\S+)/m)?.[1] || result.name;
    result.attributes.modulePath = result.name;
    if (name === 'go.mod') {
      const blocks = [...source.matchAll(/\brequire\s*\(([\s\S]*?)\)/g)].map(match => match[1]!);
      const lines = [...blocks.flatMap(block => block.split('\n')), ...[...source.matchAll(/^require\s+([^\n(]+)/gm)].map(match => match[1]!)];
      for (const line of lines) { if (/\/\/\s*indirect\b/.test(line)) continue; const match = line.trim().match(/^(\S+)\s+(v\S+)/); if (match) addDependency(result, source, match[1]!, match[2]); }
      for (const match of source.matchAll(/^\s*(?:replace\s+)?(\S+)\s*(?:v\S+\s*)?=>\s+(\.\.?\/[^\s]+)/gm)) result.projectReferences.push(match[2]!);
    } else { const block = source.match(/\buse\s*\(([\s\S]*?)\)/)?.[1] ?? ''; result.members = [...block.split('\n'), ...[...source.matchAll(/^use\s+([^\n(]+)/gm)].map(match => match[1]!)].map(value => value.replace(/\/\/.*$/, '').trim().replace(/^"|"$/g, '')).filter(Boolean); }
    return result;
  }
  if (name === 'pom.xml') {
    const data = objectValue(parseStructuredConfig(path, source).project); const result = project(path, 'maven'); result.name = textValue(data.artifactId) || result.name; result.tools.push('maven'); result.attributes.jvmTarget = true;
    const properties = objectValue(data.properties); const managed = arrayValue(objectValue(objectValue(data.dependencyManagement).dependencies).dependency).map(objectValue);
    const resolve = (value: string): string => value.replace(/\$\{([^}]+)\}/g, (token, key: string) => textValue(properties[key]) || token);
    for (const raw of arrayValue(objectValue(data.dependencies).dependency)) {
      const dep = objectValue(raw); const coordinate = `${textValue(dep.groupId)}:${textValue(dep.artifactId)}`;
      const managedDep = managed.find(item => `${textValue(item.groupId)}:${textValue(item.artifactId)}` === coordinate);
      addDependency(result, source, coordinate, resolve(textValue(dep.version) || textValue(managedDep?.version) || '*'), textValue(dep.scope) === 'test' ? 'devDependency' : 'dependency', textValue(dep.scope), sourceRangeFor(source, textValue(dep.artifactId), xmlStart(dep)));
    }
    result.members = arrayValue(objectValue(data.modules).module).map(textValue).filter(Boolean);
    for (const raw of arrayValue(objectValue(objectValue(data.build).plugins).plugin)) { const plugin = objectValue(raw); if (textValue(plugin.groupId) === 'org.springframework.boot') result.tools.push('spring-boot'); }
    return result;
  }
  if (/^(?:build|settings)\.gradle(?:\.kts)?$/.test(name) || name === 'build.sbt') {
    const result = project(path, 'maven'); if (name !== 'build.sbt') result.tools.push('gradle');
    const blocks = staticBlocks(source);
    const code = sourceSyntax(source, 'kotlin').code;
    const dependencyBlocks = blocks.filter(block => block.type === 'dependencies' && !blocks.some(parent => parent !== block && parent.start < block.start && parent.end > block.end && ['project', 'subprojects', 'allprojects'].includes(parent.type)));
    const characters: string[] = source.split('').map(c => c === '\n' || c === '\r' ? c : ' ');
    for (const block of dependencyBlocks) for (let index = block.bodyStart; index < block.end - 1; index++) characters[index] = source[index]!;
    const active = characters.join('');
    for (const match of active.matchAll(/\b(implementation|api|compileOnly|runtimeOnly|testImplementation|testRuntimeOnly|annotationProcessor)\s*(?:\(\s*)?["']([^"']+)["']/g)) {
      const parts = match[2]!.split(':'); if (parts.length < 2) continue;
      if (!code.slice(match.index!, match.index! + match[1]!.length).trim()) continue;
      addDependency(result, source, parts.slice(0, 2).join(':'), parts[2] || '*', /test|annotation/i.test(match[1]!) ? 'devDependency' : 'dependency', undefined, { start: match.index!, end: match.index! + match[0].length });
    }
    const catalogPath = localPath(result.directory, 'gradle/libs.versions.toml'); const catalogText = catalogPath ? sources.get(catalogPath) : undefined;
    if (catalogText) {
      const catalog = parseStructuredConfig(catalogPath!, catalogText); const libraries = objectValue(catalog.libraries);
      for (const match of active.matchAll(/\b(implementation|api|testImplementation)\s*\(\s*libs\.([\w.]+)\s*\)/g)) {
        if (!code.slice(match.index!, match.index! + match[1]!.length).trim()) continue;
        const alias = Object.keys(libraries).find(key => key.replace(/[-_]/g, '.') === match[2]); const library = alias ? objectValue(libraries[alias]) : {};
        const coordinate = textValue(library.module) || (library.group && library.name ? `${textValue(library.group)}:${textValue(library.name)}` : '');
        if (coordinate) addDependency(result, source, coordinate, textValue(library.version) || textValue(objectValue(catalog.versions)[textValue(objectValue(library.version).ref)]) || '*', match[1] === 'testImplementation' ? 'devDependency' : 'dependency', undefined, { start: match.index!, end: match.index! + match[0].length });
        else result.unresolved.push(`未解決catalog alias: libs.${match[2]}`);
      }
    }
    for (const match of source.matchAll(/\binclude\s*\(?\s*([^\n)]+)/g)) for (const label of match[1]!.matchAll(/["']([^"']+)["']/g)) result.members.push(label[1]!.replace(/^:/, '').replaceAll(':', '/'));
    for (const match of active.matchAll(/\bproject\s*\(\s*["']([^"']+)["']/g)) result.projectReferences.push(match[1]!.replace(/^:/, '').replaceAll(':', '/'));
    for (const match of source.matchAll(/\btasks\.(?:register|create)(?:<[^>]+>)?\(\s*["']([^"']+)["']/g)) if (code.slice(match.index!, match.index! + 5).trim()) addCommand(result, source, match[1]!, `gradle ${match[1]}`, 'build-task', { start: match.index!, end: match.index! + match[0].length });
    if (/\b(?:java|jvmToolchain|jvmTarget|kotlin\s*\(\s*["']jvm)\b/.test(source) || name === 'build.sbt') result.attributes.jvmTarget = true;
    if (/["']org\.springframework\.boot["']/.test(source)) result.tools.push('spring-boot');
    if (name === 'build.sbt') for (const match of source.matchAll(/["']([^"']+)["']\s*%%?\s*["']([^"']+)["']\s*%\s*["']([^"']+)["']/g)) addDependency(result, source, `${match[1]}:${match[2]}`, match[3], 'dependency', undefined, { start: match.index!, end: match.index! + match[0].length });
    for (const block of blocks.filter(block => ['project','subprojects','allprojects'].includes(block.type))) {
      if (block.type !== 'project' || !block.labels[0]) { result.unresolved.push(`${block.type}の動的project選択は未評価`); continue; }
      const target = localPath(result.directory, block.labels[0].replace(/^:/, '').replaceAll(':', '/')); if (!target) continue;
      const padded = source.slice(0, block.bodyStart).replace(/[^\r\n]/g, ' ') + block.body + source.slice(block.end - 1).replace(/[^\r\n]/g, ' ');
      const child = parseManifest(path, padded, sources); if (child) { child.directory = target; child.name = target.split('/').at(-1)!; child.attributes.configScope = block.labels[0]; result.children = [...(result.children ?? []), child]; result.members.push(target); }
    }
    return result;
  }
  if (name.endsWith('.csproj')) {
    const data = objectValue(parseStructuredConfig(path, source).Project); const result = project(path, 'nuget'); result.name = name.slice(0, -7); result.tools.push('dotnet');
    const properties:ObjectValue={};const applied=new Set<string>();
    const applyProperties=(configPath:string,config:ObjectValue)=>{if(applied.has(configPath)||applied.size>=12){result.unresolved.push(`MSBuild importの循環または展開上限: ${configPath}`);return;}applied.add(configPath);
      const declarations=[...arrayValue(config.Import).map(objectValue).map(value=>({kind:'import',value})),...arrayValue(config.PropertyGroup).map(objectValue).map(value=>({kind:'properties',value}))].sort((a,b)=>xmlStart(a.value)-xmlStart(b.value));
      for(const declaration of declarations){if(declaration.kind==='import'){const imported=declaration.value;const value=textValue(imported['@_Project']);const target=!imported['@_Condition']&&!value.includes('$(')?localPath(directoryFor(configPath),value):undefined;if(!target||!sources.has(target)){result.unresolved.push(`MSBuild Importは静的に未解決: ${value}`);continue;}applyProperties(target,objectValue(parseStructuredConfig(target,sources.get(target)!).Project));continue;}
        const group=declaration.value;if(group['@_Condition']){result.unresolved.push(`MSBuild PropertyGroup条件は未評価: ${textValue(group['@_Condition'])}`);for(const key of Object.keys(group))if(!key.startsWith('@_'))delete properties[key];continue;}for(const[key,value]of Object.entries(group)){if(key.startsWith('@_'))continue;const property=objectValue(value);if(property['@_Condition']){result.unresolved.push(`MSBuild property条件は未評価: ${key}`);delete properties[key];continue;}const literal=textValue(value);if(literal.includes('$(')){result.unresolved.push(`MSBuild property展開は未評価: ${key}`);delete properties[key];continue;}properties[key]=literal;}}
    };
    const sharedProps=[...sources.keys()].filter(item=>item.split('/').at(-1)==='Directory.Build.props'&&(directoryFor(item)==='.'||path.startsWith(directoryFor(item)+'/'))).sort((a,b)=>b.length-a.length)[0];
    if(sharedProps){applyProperties(sharedProps,objectValue(parseStructuredConfig(sharedProps,sources.get(sharedProps)!).Project));result.attributes.sharedPropsPath=sharedProps;}applyProperties(path,data);
    result.attributes.targetFramework = textValue(properties.TargetFramework || properties.TargetFrameworks); result.attributes.outputType = textValue(properties.OutputType);
    if(textValue(properties.NuGetLockFilePath))result.attributes.lockPath=textValue(properties.NuGetLockFilePath);
    result.attributes.useWpf = !objectValue(properties.UseWPF)['@_Condition'] && textValue(properties.UseWPF).toLowerCase() === 'true'; result.attributes.webSdk = textValue(data['@_Sdk']) === 'Microsoft.NET.Sdk.Web';
    const sdkConfig=[...sources.keys()].filter(item=>item.split('/').at(-1)==='global.json'&&(directoryFor(item)==='.'||path.startsWith(directoryFor(item)+'/'))).sort((a,b)=>b.length-a.length)[0];if(sdkConfig){const sdk=objectValue(objectValue(parseJsonc(sources.get(sdkConfig)!)).sdk);if(textValue(sdk.version)){result.attributes.sdkVersion=textValue(sdk.version);result.attributes.sdkConfigPath=sdkConfig;result.attributes.sdkRollForward=textValue(sdk.rollForward);}}
    const centralPath = [...sources.keys()].filter(item => item.endsWith('Directory.Packages.props') && (directoryFor(item) === '.' || path.startsWith(`${directoryFor(item)}/`))).sort((a, b) => b.length - a.length)[0];
    const central = centralPath ? objectValue(parseStructuredConfig(centralPath, sources.get(centralPath)!).Project) : {};
    const versions = arrayValue(central.ItemGroup).flatMap(group => arrayValue(objectValue(group).PackageVersion)).map(objectValue);
    for (const group of arrayValue(data.ItemGroup).map(objectValue)) {
      for (const reference of arrayValue(group.PackageReference).map(objectValue)) {
        const packageName = textValue(reference['@_Include']); const version = textValue(reference['@_Version'] || reference.Version || versions.find(item => textValue(item['@_Include']).toLowerCase() === packageName.toLowerCase())?.['@_Version']);
        addDependency(result, source, packageName, version || '*', /test|xunit|nunit/i.test(packageName) ? 'devDependency' : 'dependency', [textValue(group['@_Condition']), textValue(reference['@_Condition'])].filter(Boolean).join(' && ') || undefined, sourceRangeFor(source, packageName, xmlStart(reference)));
      }
      for (const reference of arrayValue(group.ProjectReference).map(objectValue)) result.projectReferences.push(textValue(reference['@_Include']));
      for (const reference of arrayValue(group.FrameworkReference).map(objectValue)) if (textValue(reference['@_Include']) === 'Microsoft.AspNetCore.App') { if (group['@_Condition'] || reference['@_Condition']) result.unresolved.push('条件付きASP.NET Core FrameworkReference'); else result.tools.push('aspnet-core'); }
    }
    if (result.dependencies.length) result.tools.push('nuget'); if (result.attributes.useWpf) result.tools.push('wpf'); if (result.attributes.webSdk) result.tools.push('aspnet-core'); return result;
  }
  if (name.endsWith('.sln') || name.endsWith('.slnx')) {
    const result = project(path, 'nuget'); result.tools.push('dotnet'); result.attributes.solution = true;
    result.members = name.endsWith('.slnx') ? arrayValue(objectValue(parseStructuredConfig(path, source).Solution).Project).map(item => textValue(objectValue(item)['@_Path']))
      : [...source.matchAll(/Project\([^\n]*?=\s*"[^"]*",\s*"([^"\n]+\.csproj)"/g)].map(match => match[1]!);
    return result;
  }
  if (name === 'gemfile' || name.endsWith('.gemspec')) {
    const result = project(path, 'gem');
    const code = sourceSyntax(source, 'ruby').code; const groups: string[] = [];
    let offset = 0;
    for (const line of source.split(/(?<=\n)/)) {
      const group = line.match(/^\s*group\s+([^]*?)\s+do\b/); if (group && code.slice(offset, offset + line.length).trim()) groups.push(group[1]!);
      const match = line.match(/^\s*(?:gem|\w+\.add_(development_)?dependency)\s+["']([^"']+)["'](?:\s*,\s*["']([^"']+)["'])?/);
      if (match && code.slice(offset, offset + line.length).trim()) addDependency(result, source, match[2]!, match[3] || '*', match[1] || groups.some(group => /\b(?:development|test)\b/.test(group)) ? 'devDependency' : 'dependency', groups.length ? groups.join(' / ') : undefined, { start: offset + match.index!, end: offset + match.index! + match[0].length });
      if (/^\s*end\s*(?:#.*)?$/.test(line.trim())) groups.pop(); offset += line.length;
    }
    return result;
  }
  if (name === 'pubspec.yaml') { const data = parseStructuredConfig(path, source); const result = project(path, 'dart'); result.name = textValue(data.name) || result.name; tableDependencies(result, source, data.dependencies, 'dependency'); tableDependencies(result, source, data.dev_dependencies, 'devDependency'); return result; }
  if (name === 'package.swift') {
    const result = project(path, 'swift'); result.name = source.match(/\bname:\s*"([^"]+)"/)?.[1] || result.name;
    const code=sourceSyntax(source,'swift').code;result.attributes.swiftTargets=[...source.matchAll(/\.(?:target|executableTarget|testTarget)\s*\(\s*name\s*:\s*"([^"]+)"/g)].filter(match=>code.slice(match.index!,match.index!+4).trim()).map(match=>match[1]!);
    for (const match of source.matchAll(/\.package\s*\(\s*url:\s*"([^"]+)"\s*,\s*(?:from|exact):\s*"([^"]+)"/g)) addDependency(result, source, match[1]!, match[2]);
    for (const match of source.matchAll(/\.package\s*\(\s*path:\s*"([^"]+)"/g)) result.projectReferences.push(match[1]!);
    return result;
  }
  if (name === 'deno.json' || name === 'deno.jsonc') {
    const data = parseStructuredConfig(path, source); const result = project(path, 'npm'); result.tools.push('deno'); result.attributes.runtime = 'deno'; result.name = textValue(data.name) || (result.directory==='.'?'Deno project':result.directory.split('/').at(-1)!);
    for (const [alias, value] of Object.entries(objectValue(data.imports))) {
      const specifier = textValue(value); const match = specifier.match(/^npm:((?:@[^/]+\/)?[^@/]+)(?:@([^/]+))?/); if (match) addDependency(result, source, match[1]!, match[2] || '*'); else if (/^\.\.?\//.test(specifier)) result.projectReferences.push(specifier); else result.unresolved.push(`remote import未取得: ${alias}`);
    }
    result.attributes.lockDisabled=data.lock===false;const lockPath=typeof data.lock==='string'?data.lock:textValue(objectValue(data.lock).path);if(lockPath)result.attributes.lockPath=lockPath;
    for (const [key, value] of Object.entries(objectValue(data.tasks))) addCommand(result, source, key, textValue(value)); result.members = arrayValue(data.workspace).map(textValue).filter(Boolean); return result;
  }
  return undefined;
}
