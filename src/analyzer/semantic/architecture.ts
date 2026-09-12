import { findJsonPropertyValueRange, parseJsonc, stripJsonComments } from '../parsers';
import { architectureSyntax } from './architectureSyntax';
import { architectureToml } from './architectureToml';
import { architectureRole } from './architectureRole';
import { uniqueArchitectureEvidence } from './architectureEvidence';
import type { ArchitectureCodeUsage, ArchitectureIdentity, ArchitectureRequest, ArchitectureTechnology } from './architectureMetadata';
import { populateArchitectureUsage } from './architectureUsage';
import { architectureResourceIdentity } from './architectureIdentity';
import { architectureFirstArgument } from './architectureArguments';
import { parseManifest,type ManifestProject } from '../manifestAdapters';
import { responsibility, semanticLanguage } from './languages';
import type { SemanticAnalysis, SemanticConfidence, SemanticEdge, SemanticEvidence, SemanticGraph, SemanticInput, SemanticNode } from './types';

export type ArchitectureKind = 'application' | 'component' | 'shared-code' | 'code-package' | 'resource' | 'external-service' | 'external-program' | 'unresolved';
export interface ArchitectureRole { label: string; confidence: SemanticConfidence; reason: string; evidence: SemanticEvidence[] }
export interface ArchitectureEntity {
  kind: ArchitectureKind; parentId?: string; ownerPath?: string; entryPaths: string[];
  roles: ArchitectureRole[]; environments: string[]; context: string[];
  memberIds: string[]; files: string[]; technologyNames: string[]; auxiliary: boolean;
  identity?: ArchitectureIdentity; codeUsage?: ArchitectureCodeUsage; technologies?: ArchitectureTechnology[]; request?: ArchitectureRequest;
  configurationVariants?: { environment: string; name?: string; entryPath?: string; inherited: string[]; evidence: SemanticEvidence[] }[];
}
export interface ArchitectureModel extends SemanticGraph { environments: string[]; limitations: string[] }
const id = (...parts: string[]) => `architecture:${JSON.stringify(parts)}`;
const directory = (path: string) => path.split('/').slice(0, -1).join('/');
const within = (path: string, dir: string) => !dir || path === dir || path.startsWith(`${dir}/`);
export function architecturePath(base: string, relative: string) {
  const result: string[] = [];
  for (const part of `${base}/${relative}`.replaceAll('\\', '/').split('/')) {
    if (part === '..') result.pop(); else if (part && part !== '.') result.push(part);
  }
  return result.join('/');
}
const auxiliary = (path: string) => /(?:^|\/)(?:__tests__|__mocks__|__fixtures__|tests?|specs?|mocks?|fixtures?|samples?|examples?|generated)(?:\/|\.)|\.(?:test|spec|mock|fixture|generated|g)\.|\.Tests(?:\/|\.)/i.test(path);
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const string = (value: unknown) => typeof value === 'string' ? value : '';
const strings = (value: unknown) => Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
const unique = <T,>(values: T[]) => [...new Set(values)];
function assetRouteMatches(routes: string[], endpoint: string) {
  const pathname = endpoint.split(/[?#]/)[0]!;
  const matches = (pattern: string) => new RegExp(`^${pattern.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`).test(pathname);
  return !routes.some(route => route.startsWith('!') && matches(route.slice(1))) && routes.some(route => !route.startsWith('!') && matches(route));
}
export function architectureEvidence(path: string, source: string, start: number, length: number, description: string): SemanticEvidence {
  return { path, start, end: start + length, line: source.slice(0, start).split('\n').length, endLine: source.slice(0, start + length).split('\n').length, description };
}

/** Additive, static architecture adapter. Never execute source/configuration or reuse
 * route-name matching as deployment evidence. Canonical semantic facts stay intact. */
export function buildArchitectureModel(input: SemanticInput, analysis: Pick<SemanticAnalysis, 'nodes' | 'edges'>): ArchitectureModel {
  const nodes = new Map<string, SemanticNode>(), edges: SemanticEdge[] = [], environments = new Set<string>(), limitations = new Set<string>();
  const sources = input.sources;
  const configs = Object.entries(sources).sort(([a], [b]) => a.localeCompare(b));
  const syntax = new Map(configs.filter(([path]) => /\.[cm]?[jt]sx?$/.test(path)).map(([path, source]) => [path, architectureSyntax(path, source)]));
  const packages: { path: string; dir: string; config: Record<string, unknown>; node: SemanticNode }[] = [];
  const entryOwners = new Map<string, string>(), fileOwners = new Map<string, string>();
  const ev = (path: string, needle: string, reason: string) => {
    const source = sources[path] ?? '', at = source.indexOf(needle);
    return [architectureEvidence(path, source, Math.max(0, at), at < 0 ? 0 : needle.length, reason)];
  };
  const add = (key: string[], label: string, kind: ArchitectureKind, evidence: SemanticEvidence[], extra: Partial<ArchitectureEntity> = {}) => {
    const keyId = id(...key), existing = nodes.get(keyId); if (existing) return existing;
    const arch: ArchitectureEntity = { kind, roles: [], entryPaths: [], environments: [], context: [], memberIds: [], files: [], technologyNames: [], auxiliary: false, ...extra };
    const node: SemanticNode = { id: keyId, label, kind: kind === 'resource' ? 'resource' : kind.startsWith('external') || kind === 'unresolved' ? 'external' : 'subsystem',
      path: arch.ownerPath || evidence[0]?.path, line: evidence[0]?.line, group: arch.parentId ? nodes.get(arch.parentId)?.label ?? '内部構成' : 'プロジェクト',
      confidence: kind === 'unresolved' ? 'unresolved' : 'source', evidence, architecture: arch,
      attributes: { architectureKind: kind, members: [], files: [], auxiliary: arch.auxiliary } };
    nodes.set(keyId, node); return node;
  };
  const connect = (source: string, target: string, kind: string, label: string, evidence: SemanticEvidence[], confidence: SemanticConfidence = 'source', environment = '', configurationId?: string) => {
    edges.push({ id: id('relation', source, target, kind, environment, ...evidence.map(e => `${e.path}:${e.start}`), ...(configurationId ? [configurationId] : [])), source, target, kind, label,
      confidence, evidence, views: ['architecture-map'], details: { environment, configurationId, reason: 'ソース・設定上の静的関係。現在の実行や通信を示しません。' } });
  };
  const parse = (path: string, source: string) => { try { return object(parseJsonc(source)); } catch { limitations.add(`${path}: 構造化設定を解析できませんでした`); return {}; } };
  for (const [path, source] of configs.filter(([p]) => /(?:^|\/)package\.json$/.test(p))) {
    const config = parse(path, source), dir = directory(path), name = string(config.displayName) || string(config.name) || dir || 'プロジェクトのコード';
    const extension = Boolean(object(config.engines).vscode && (config.main || config.browser || config.activationEvents));
    const scripts = Object.values(object(config.scripts)).map(string);
    const web = scripts.some(script => /(?:^|[\s&])(?:vite|next|nuxt|astro)(?:\s|$)/.test(script));
    const cli = Boolean(config.bin);
    const kind = extension || web || cli ? 'application' : 'code-package';
    const reason = extension ? '拡張manifestのengines.vscodeと入口宣言' : web ? 'manifestのWebビルド・起動コマンド' : cli ? 'manifestのbin宣言' : 'package manifestで確認したコードパッケージ。独立実行の根拠は未確認';
    const node = add(['package', path], name, kind, ev(path, extension ? 'vscode' : web ? 'scripts' : cli ? 'bin' : 'name', reason), {
      ownerPath: dir, context: extension ? ['Extension Host'] : web ? ['ブラウザ'] : cli ? ['CLI'] : [], auxiliary: auxiliary(path),
      technologyNames: unique(['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'].flatMap(key => Object.keys(object(config[key])))),
    });
    node.architecture!.entryPaths = unique([string(config.main), string(config.browser), ...Object.values(object(config.bin)).map(string), typeof config.bin === 'string' ? config.bin : ''].filter(Boolean).map(p => architecturePath(dir, p)));
    packages.push({ path, dir, config, node });
  }
  // Most specific declared project owns a path. A package directory alone is never an application.
  const packageAt = (path: string) => packages.filter(pkg => within(path, pkg.dir)).sort((a, b) => b.dir.length - a.dir.length)[0];
  const units: { dir: string; node: SemanticNode }[] = [];
  for (const [path, raw] of configs.filter(([p]) => /\.csproj$/i.test(p))) {
    const source = raw.replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\r\n]/g, ' '));
    const name = source.match(/<AssemblyName>([^<]+)<\/AssemblyName>/)?.[1] ?? path.split('/').at(-1)!.replace(/\.csproj$/i, '');
    const output = source.match(/<OutputType>([^<]+)<\/OutputType>/)?.[1];
    if (/\bCondition\s*=|<Import\b/.test(source)) limitations.add(`${path}: MSBuildの条件式と外部Importは評価せず、ファイル内の明示宣言を使用`);
    const executable = /^(?:Exe|WinExe)$/i.test(output ?? '') || /Sdk="Microsoft\.NET\.Sdk\.Web"/.test(source);
    const node = add(['dotnet', path], name, executable ? 'application' : 'code-package', ev(path, output ?? '<Project', output ? `OutputType=${output}の宣言` : '.NETプロジェクト宣言'), {
      ownerPath: directory(path), context: executable ? [/<UseWPF>true<\/UseWPF>/i.test(source) ? '.NET / WPF' : '.NET'] : [], auxiliary: auxiliary(path), technologyNames: ['dotnet'],
    }); units.push({ dir: directory(path), node });
  }
  for (const [path, source] of configs.filter(([p]) => /\.csproj$/i.test(p))) {
    const from = nodes.get(id('dotnet', path))!;
    for (const match of source.matchAll(/<ProjectReference\b[^>]*\bInclude="([^"]+)"[^>]*>/g)) {
      const target = nodes.get(id('dotnet', architecturePath(directory(path), match[1]!)));
      if (target) connect(from.id, target.id, 'declaration-dependency', 'プロジェクト参照を宣言', [architectureEvidence(path, source, match.index!, match[0].length, match[0])]);
    }
  }
  const bindings: { owner: SemanticNode; node: SemanticNode; binding: string; environment: string; dir: string }[] = [];
  const commonProjects:ManifestProject[]=[];const sourceMap=new Map(configs);
  for(const[path,source]of configs)try{const project=parseManifest(path,source,sourceMap);if(project&&(project.ecosystem!=='npm'||/deno\.jsonc?$/.test(project.path))&&project.ecosystem!=='nuget'&&!project.attributes.solution)commonProjects.push(project,...(project.children??[]));}catch{/* invalid manifests are reported by the scan */}
  for(const project of commonProjects){const dir=project.directory==='.'?'':project.directory;if(units.some(unit=>unit.dir===dir))continue;
    const entries=analysis.nodes.filter(node=>node.path&&within(node.path,dir)&&!commonProjects.some(other=>other!==project&&other.directory!=='.'&&other.directory.length>project.directory.length&&within(node.path!,other.directory))&&node.kind==='entry'&&(node.attributes.endpoint||node.attributes.runtimeEntry)&&!node.attributes.test);
    const node=add(['manifest',project.path,project.directory],project.name,entries.length?'application':'code-package',ev(project.path,project.name,`${project.ecosystem} manifestの宣言`),{ownerPath:dir,entryPaths:unique(entries.map(entry=>entry.path!)),context:[project.ecosystem],auxiliary:auxiliary(project.path)});units.push({dir,node});
  }
  const assetRoutes: { owner: SemanticNode; directory: string; routes: string[]; environment: string; evidence: SemanticEvidence[] }[] = [];
  for (const [path, source] of configs.filter(([p]) => /(?:^|\/)wrangler\.(?:jsonc?|toml)$/.test(p))) {
    const toml = path.endsWith('.toml') ? architectureToml(source) : undefined;
    if (toml?.unsupported) limitations.add(`${path}: TOMLの複数行値・inline table等は未対応。解釈できたリテラル設定のみ使用`);
    const config = toml?.config ?? parse(path, source), dir = directory(path), main = string(config.main), pkg = packageAt(path);
    const worker = main && pkg && pkg.node.architecture?.kind === 'code-package' ? pkg.node : main ? add(['worker', path], string(config.name) || pkg?.node.label || dir, 'application', ev(path, main, 'Wrangler mainが実行入口を指す'), { ownerPath: dir, entryPaths: [architecturePath(dir, main)], context: ['Cloudflare Workers'], technologyNames: ['cloudflare-workers'] }) : pkg?.node;
    if (!worker) continue;
    if (main) {
      worker.label = string(config.name) || worker.label; worker.architecture!.kind = 'application'; worker.attributes.architectureKind = 'application';
      worker.architecture!.context = unique([...worker.architecture!.context, 'Cloudflare Workers']); worker.architecture!.entryPaths.push(architecturePath(dir, main)); worker.evidence.push(...ev(path, main, 'Wrangler mainが実行入口を指す'));
      units.push({ dir, node: worker }); entryOwners.set(architecturePath(dir, main), worker.id);
    }
    const variants: [string, Record<string, unknown>][] = [['', config], ...Object.entries(object(config.env)).map(([name, values]): [string, Record<string, unknown>] => [name, object(values)])];
    for (const [environment, values] of variants) {
      if (environment) { environments.add(environment); worker.architecture!.environments.push(environment); }
      const entry = string(values.main) || main; if (entry) entryOwners.set(architecturePath(dir, entry), worker.id);
      const clean = stripJsonComments(source), envRange = findJsonPropertyValueRange(clean, 'env');
      const range = environment && envRange ? findJsonPropertyValueRange(clean, environment, envRange.valueStart, envRange.valueEnd) : undefined;
      const settingEvidence = (key: string, description: string) => {
        if (toml) return [architectureEvidence(path, source, 0, source.length, `${environment || '既定設定'}: ${description}（TOML設定全体）`)];
        const property = findJsonPropertyValueRange(clean, key, range?.valueStart ?? 0, range?.valueEnd ?? (envRange?.start ?? clean.length));
        return [architectureEvidence(path, source, property?.start ?? range?.start ?? 0, property ? property.end - property.start : 0, `${environment || '既定設定'}: ${description}`)];
      };
      worker.architecture!.configurationVariants ??= [];
      worker.architecture!.configurationVariants.push({ environment, name: string(values.name) || string(config.name) || undefined, entryPath: entry ? architecturePath(dir, entry) : undefined,
        inherited: environment ? ['name', 'main'].filter(key => values[key] === undefined && config[key] !== undefined) : [],
        evidence: [...(values.name ? settingEvidence('name', 'この環境の名前の宣言') : ev(path, string(config.name), '上位の名前の宣言')), ...(values.main ? settingEvidence('main', 'この環境の入口の宣言') : main ? ev(path, main, '上位の入口の宣言') : [])] });
      // main/name inherit; bindings and vars do not. Each setting keeps its environment identity.
      for (const [key, resourceKind, labelKey] of [['d1_databases', 'D1', 'database_name'], ['r2_buckets', 'R2', 'bucket_name'], ['kv_namespaces', 'KV', 'id'], ['services', 'Service binding', 'service']] as const) {
        for (const [index, value] of (Array.isArray(values[key]) ? values[key] as unknown[] : []).entries()) {
          const valueObject = object(value), binding = string(valueObject.binding), label = string(valueObject[labelKey]) || binding || resourceKind;
          const evidence = settingEvidence(key, `${key}の宣言（binding=${binding}、対象=${label}）`);
          const occurrence = { id: id('setting', path, environment, key, String(index)), path, environment, binding, name: label, evidence };
          const identity = architectureResourceIdentity(resourceKind, valueObject, string(values.account_id ?? config.account_id), occurrence);
          const node = add(identity.key ?? ['resource', path, environment, key, String(index), label], label, key === 'services' ? 'external-service' : 'resource', evidence, { environments: [], context: [resourceKind], technologyNames: [resourceKind === 'D1' ? 'cloudflare-d1' : resourceKind === 'R2' ? 'cloudflare-r2' : resourceKind] });
          if (node.architecture!.identity) node.architecture!.identity.configurations.push(...identity.identity.configurations);
          else node.architecture!.identity = identity.identity;
          node.architecture!.environments.push(environment || 'default'); node.evidence.push(...evidence);
          bindings.push({ owner: worker, node, binding, environment, dir });
          connect(worker.id, node.id, 'deployment-config', `${resourceKind} bindingの設定`, evidence, 'source', environment, occurrence.id);
        }
      }
      const assets = object(values.assets ?? config.assets), assetDir = string(assets.directory);
      if (assetDir) {
        const targetDir = architecturePath(dir, assetDir), web = packages.filter(pkg => within(targetDir, pkg.dir) && pkg.node.architecture?.kind === 'application').sort((a, b) => b.dir.length - a.dir.length)[0];
        const evidence = settingEvidence('assets', 'assets.directoryによる配信設定');
        if (web) { if (web.node.id !== worker.id) connect(worker.id, web.node.id, 'deployment-config', 'Web成果物の配信設定', evidence, 'source', environment);
          assetRoutes.push({ owner: worker, directory: web.dir, routes: assets.run_worker_first === true ? ['/*'] : strings(assets.run_worker_first), environment, evidence }); }
        worker.architecture!.context = unique([...worker.architecture!.context, '静的アセット配信設定']);
      }
      const vars = object(values.vars);
      const bucket = string(vars.B2_BUCKET), endpoint = string(vars.B2_ENDPOINT);
      if (bucket && endpoint) {
        const evidence = settingEvidence('vars', 'B2_BUCKETとB2_ENDPOINTによるストレージ設定');
        const node = add(['storage-config', path, environment, endpoint, bucket], bucket, 'resource', evidence, { context: ['S3互換ストレージ'], environments: [environment || 'default'], technologyNames: ['backblaze-b2'],
          identity: { status: 'unconfirmed', type: 'S3互換ストレージ', scope: endpoint, reason: 'endpointとbucketの設定を確認。アカウント・安定IDとの対応は未確認', configurations: [{ id: id('storage-setting', path, environment), path, environment, binding: 'B2_BUCKET', name: bucket, evidence }] } });
        connect(worker.id, node.id, 'deployment-config', 'ストレージ接続先の設定', evidence, 'source', environment);
      }
      const project = string(vars.FIREBASE_PROJECT_ID);
      if (project) {
        const emulator = vars.FIREBASE_AUTH_EMULATOR === 'true' || vars.FIREBASE_AUTH_EMULATOR === true;
        const evidence = settingEvidence('vars', `FirebaseプロジェクトとAuth ${emulator ? 'エミュレーター' : '接続先'}設定`);
        const node = add(emulator ? ['firebase-config', path, environment, project, 'emulator'] : ['firebase-project', project, 'auth'], `Firebase Auth · ${project}${emulator ? '（エミュレーター）' : ''}`, 'external-service', evidence, { context: ['Firebase Auth'], environments: [], technologyNames: ['firebase-authentication'] });
        node.architecture!.identity ??= { status: emulator ? 'unconfirmed' : 'confirmed', type: emulator ? 'Firebase Auth emulator' : 'Firebase Auth', identifier: project,
          reason: emulator ? 'エミュレーター利用の設定。接続先の同一性は未確認' : 'Firebase project IDが一致する認証サービス設定', configurations: [] };
        node.architecture!.identity.configurations.push({ id: id('firebase-setting', path, environment), path, environment, binding: 'FIREBASE_PROJECT_ID', name: project, evidence });
        node.architecture!.environments.push(environment || 'default'); node.evidence.push(...evidence);
        connect(worker.id, node.id, 'deployment-config', '認証サービスの設定', evidence, 'source', environment);
      }
    }
  }
  // Extension and embedded webview are distinct execution contexts. Host files in
  // a directory named webview remain with the host; browser ownership needs API evidence.
  for (const pkg of packages.filter(p => p.node.architecture?.context.includes('Extension Host'))) {
    for (const [path] of configs.filter(([p]) => packageAt(p) === pkg && /\.[cm]?[jt]sx?$/.test(p))) {
      const browserApi = syntax.get(path)?.calls.find(call => /(?:^|\.)acquireVsCodeApi$/.test(call.callee));
      if (browserApi) {
        const webview = add(['webview', pkg.path, path], `${pkg.node.label} Webview`, 'application', [browserApi.evidence], { ownerPath: directory(path), entryPaths: [path], context: ['Webview / ブラウザ'] });
        units.push({ dir: directory(path), node: webview }); entryOwners.set(path, webview.id);
      }
      if (syntax.get(path)?.exportedFunctions.has('activate') && syntax.get(path)?.imports.has('vscode')) { pkg.node.architecture!.entryPaths.push(path); entryOwners.set(path, pkg.node.id); }
    }
  }
  for (const pkg of packages.filter(p => p.node.architecture?.context.includes('ブラウザ'))) {
    for (const [path] of configs.filter(([p]) => packageAt(p) === pkg && /\.[jt]sx?$/.test(p))) if (syntax.get(path)?.calls.some(c => /(?:^|\.)(?:createRoot|hydrateRoot)$/.test(c.callee))) { pkg.node.architecture!.entryPaths.push(path); entryOwners.set(path, pkg.node.id); }
  }
  const ownerAt = (path: string) => {
    const entry = nodes.get(entryOwners.get(path) ?? ''); if (entry) return entry;
    const unit = units.filter(item => within(path, item.dir)).sort((a, b) => b.dir.length - a.dir.length)[0], pkg = packageAt(path);
    return pkg && (!unit || pkg.dir.length > unit.dir.length) ? pkg.node : unit?.node ?? pkg?.node;
  };
  for (const [path, source] of configs.filter(([p]) => /(?:^|\/)firebase\.json$/.test(p))) {
    const config = parse(path, source), emulators = object(config.emulators), owner = ownerAt(path);
    for (const service of ['auth', 'firestore', 'storage', 'database']) {
      const setting = object(emulators[service]); if (!Object.keys(setting).length) continue;
      if(input.resources.some(resource=>resource.path===path&&resource.attributes?.emulatorService===service&&resource.attributes.configurationOccurrence))continue;
      const host = string(setting.host), port = typeof setting.port === 'number' ? setting.port : undefined;
      const evidence = ev(path, JSON.stringify(service), `Firebase ${service}エミュレーターの設定。起動状態は未確認`);
      const node = add(['firebase-emulator-config', path, service], `Firebase ${service}エミュレーター${port ? ` :${port}` : ''}`, 'external-service', evidence,
        { context: ['ローカルエミュレーター設定', host ? `host=${host}` : 'host未指定'], technologyNames: service === 'auth' ? ['firebase-authentication'] : [] });
      const rcPath = architecturePath(directory(path), '.firebaserc'), rc = sources[rcPath] ? parse(rcPath, sources[rcPath]!) : {};
      node.attributes.projectAliases = Object.entries(object(rc.projects)).map(([alias, project]) => `${alias}: ${string(project)}`);
      if (sources[rcPath]) node.evidence.push(...ev(rcPath, 'projects', 'Firebase CLIのプロジェクトalias。実行・配置環境との対応は未確定'));
      if (owner) connect(owner.id, node.id, 'deployment-config', 'Firebaseエミュレーターの設定', evidence);
    }
  }
  const sourceNodes = new Map<string, SemanticNode[]>();
  for (const node of analysis.nodes) if (node.path) { const members = sourceNodes.get(node.path) ?? []; members.push(node); sourceNodes.set(node.path, members); }
  for (const [path, source] of configs.filter(([p]) => Boolean(semanticLanguage(p)))) {
    let owner = ownerAt(path);
    if (!owner) owner = add(['unassigned', directory(path).split('/')[0] ?? ''], directory(path).split('/')[0] || 'プロジェクトのコード', 'code-package', ev(path, '', 'ソースファイルの所属。独立実行の根拠は未確認'), { ownerPath: directory(path).split('/')[0] });
    const members = sourceNodes.get(path) ?? [];
    const detectedRole = architectureRole(path, stripJsonComments(source), owner.architecture!, syntax.get(path));
    const primary = detectedRole?.label ?? responsibility(path, '');
    const modelOnly = members.some(n => n.model) && members.every(n => n.model || n.kind === 'external' || n.attributes.initializer || n.data);
    const label = auxiliary(path) ? 'テスト・補助コード' : primary === 'Data models' && !modelOnly ? 'モデルを扱うコード' : primary === 'Shared logic' ? '役割未判定' : primary;
    const child = add(['component', owner.id, label], label, 'component', [], { parentId: owner.id, ownerPath: owner.architecture!.ownerPath, context: [...owner.architecture!.context], auxiliary: auxiliary(path),
      roles: [{ label, confidence: 'inferred', reason: detectedRole?.reason ?? (primary === 'Shared logic' ? 'ソースの所属は確認済み。構文・配置規約から具体的な役割は未判定' : `所属パスの分類規則: ${path}。機能の実装完了を保証しません`), evidence: ev(path, '', `役割推定の対象ファイル: ${path}`) }] });
    child.architecture!.memberIds.push(...members.map(n => n.id)); child.architecture!.files.push(path);
    for (const member of members) for (const item of member.evidence) child.evidence.push(item);
    if (!members.length) child.evidence.push(...ev(path, '', '所属ソースファイル'));
    fileOwners.set(path, child.id);
    // Other concrete roles remain annotations rather than duplicate components.
    const authCalls = syntax.get(path)?.calls.filter(c => /(?:^|\.)(?:verifyIdToken|signInWith\w*|getAuth)$/.test(c.callee)) ?? [];
    if (authCalls.length) child.architecture!.roles.push({ label: '認証APIの使用', confidence: 'inferred', reason: '認証API名の呼び出し式。認証の正当性・完全性は未検証', evidence: authCalls.map(c => c.evidence) });
  }
  for (const pkg of packages) for (const key of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const name of Object.keys(object(pkg.config[key]))) {
      const target = packages.find(p => p.config.name === name)?.node;
      // External npm packages are technologies in details, not service instances.
      if (target) connect(pkg.node.id, target.id, 'declaration-dependency', `${key}として宣言`, ev(pkg.path, JSON.stringify(name), `${name}の依存宣言`));
    }
  }
  for (const ref of input.imports) {
    const from = fileOwners.get(ref.from), to = fileOwners.get(ref.to);
    if (from && to) {
      connect(from, to, 'code-reference', 'モジュール参照', ev(ref.from, ref.specifier, `import: ${ref.specifier}`));
      const relation = edges.at(-1)!;
      relation.details!.architectureOrigin = 'source';
      relation.provenance = { edges: [{ ...relation, source: `file:${ref.from}`, target: `file:${ref.to}` }] };
    }
  }
  for (const [path, parsed] of syntax) for (const ref of parsed.importReferences) {
    const target = packages.filter(pkg => typeof pkg.config.name === 'string' && (ref.name === pkg.config.name || ref.name.startsWith(`${pkg.config.name}/`))).sort((a, b) => String(b.config.name).length - String(a.config.name).length)[0];
    const from = fileOwners.get(path);
    if (!target || !from || ownerAt(path)?.id === target.node.id || input.imports.some(item => item.from === path && item.specifier === ref.name)) continue;
    connect(from, target.node.id, 'code-reference', 'コードパッケージのモジュール参照', [ref.evidence]);
    edges.at(-1)!.details!.architectureOrigin = 'source';
  }
  const canonicalOwners = new Map<string, string>();
  for (const node of nodes.values()) for (const member of node.architecture!.memberIds) canonicalOwners.set(member, node.id);
  const byCanonical = new Map(analysis.nodes.map(n => [n.id, n]));
  for (const relation of analysis.edges) {
    // HTTP matching in the generic runtime analyzer only compares route names.
    // Communication below is grounded separately in deployment configuration.
    if (!['calls', 'callback', 'handles', 'registers-event'].includes(relation.kind)) continue;
    const from = canonicalOwners.get(relation.source), to = canonicalOwners.get(relation.target);
    if (!from || !to || byCanonical.get(relation.target)?.kind === 'external') continue;
    edges.push({ ...relation, id: id('source-edge', relation.id), source: from, target: to, views: ['architecture-map'], provenance: { edges: relation.provenance?.edges ?? [relation] } });
  }
  for (const request of analysis.nodes.filter(n => n.kind === 'request')) {
    const from = request.path ? fileOwners.get(request.path) : undefined; if (!from) continue;
    const call = syntax.get(request.path!)?.calls.find(c => c.start === request.evidence[0]?.start);
    if (call && /(?:^|\.)(?:useQuery|useMutation)$/.test(call.callee)) continue;
    const endpoint = call ? call.literals[0] ?? call.args[0] ?? '' : string(request.attributes.endpoint);
    let origin = '';
    if (/^https?:\/\//.test(endpoint) && !endpoint.includes('${') && (!call || call.literals[0] !== undefined)) try { origin = new URL(endpoint).origin; } catch { /* Retain malformed literal as an unresolved target. */ }
    const absolute = Boolean(origin);
    const mappings = endpoint.startsWith('/') && !endpoint.startsWith('//') ? assetRoutes.filter(route => within(request.path!, route.directory) && assetRouteMatches(route.routes, endpoint)) : [];
    for (const mapping of mappings) connect(from, mapping.owner.id, 'http-request', `HTTP要求 ${endpoint}（配信設定で対応）`, [...request.evidence, ...mapping.evidence], 'source', mapping.environment);
    // A configured environment resolves only that environment. Keep the unknown/default request.
    const owner = ownerAt(request.path!);
    const excluded = unique(mappings.map(m => `except:${m.environment}`)).sort();
    const node = add(absolute ? ['http-target', owner?.id ?? from, origin, auxiliary(request.path!) ? 'auxiliary' : 'source', ...excluded] : ['http-request-target', request.id, ...excluded], absolute ? origin : 'HTTPリクエスト先・未特定', absolute ? 'external-service' : 'unresolved', [], { environments: excluded, auxiliary: auxiliary(request.path!),
      request: absolute ? undefined : { kind: 'http', ownerId: owner?.id ?? from, expression: endpoint || '動的な接続先', sourceId: request.id } });
    node.evidence.push(...request.evidence); node.architecture!.memberIds.push(request.id); node.architecture!.files.push(request.path!);
    node.attributes.endpoints = unique([...(node.attributes.endpoints as string[] ?? []), endpoint || '動的な接続先']);
    connect(from, node.id, 'http-request', `HTTP要求: ${endpoint || '動的な接続先'}（静的コード）`, request.evidence, absolute ? 'source' : 'unresolved');
  }
  for (const [path, raw] of configs.filter(([p]) => /\.[cm]?[jt]sx?$|\.cs$/.test(p))) {
    const from = fileOwners.get(path); if (!from) continue;
    const source = stripJsonComments(raw);
    for (const binding of bindings.filter(b => ownerAt(path)?.id === b.owner.id && b.binding)) {
      for (const access of syntax.get(path)?.accesses ?? []) if (access.expression === `env.${binding.binding}` || access.expression === `bindings.${binding.binding}`) connect(from, binding.node.id, 'data-operation', 'リソースへのアクセス式', [access.evidence], 'inferred', binding.environment);
    }
    for (const match of source.matchAll(/\b(?:spawn|execFile|Process\.Start)\s*\(\s*([^,\n)]+)/g)) {
      if (syntax.has(path) && !syntax.get(path)!.calls.some(call => call.start === match.index)) continue;
      const expression = architectureFirstArgument(source, source.indexOf('(', match.index!)), literal = expression.match(/^['"]([^'"]+)['"]$/)?.[1];
      const evidence = [architectureEvidence(path, raw, match.index!, match[0].length, '外部プログラム起動の静的コード')];
      const call = syntax.get(path)?.calls.find(c => c.start === match.index), fallback = call?.defaultArgument;
      if (fallback) evidence.push(fallback.evidence);
      const node = add(['program', literal ?? path, literal ?? expression, literal ? '' : String(fallback ? call?.ownerScope : match.index), auxiliary(path) ? 'auxiliary' : 'source'], literal ?? (fallback ? `${fallback.value}（起動先の既定値）` : '外部プログラムへの起動要求'), literal || fallback ? 'external-program' : 'unresolved', evidence, { auxiliary: auxiliary(path),
        request: literal || fallback ? undefined : { kind: 'process', ownerId: ownerAt(path)?.id ?? from, expression, sourceId: `call:${path}:${match.index}` } });
      node.attributes.targetExpression = expression;
      if (fallback) { node.confidence = 'inferred'; node.attributes.targetExpression = expression; node.attributes.targetOverride = '起動先はコンストラクター引数で変更可能。実行時の値は未確認'; }
      connect(from, node.id, 'process-start', fallback ? 'プログラム起動要求（既定値から推定）' : 'プログラム起動要求', evidence, literal ? 'source' : fallback ? 'inferred' : 'unresolved');
    }
    const parsed = syntax.get(path);
    if (parsed?.imports.has('firebase/auth')) {
      const auth = parsed.calls.filter(c => /(?:^|\.)(?:getAuth|connectAuthEmulator|signInWith\w*)$/.test(c.callee)).filter(call=>!input.resources.some(resource=>resource.attributes?.dictionaryStackId==='firebase-authentication'&&resource.attributes.factoryPath===path&&(resource.attributes.projectIdentity||resource.attributes.endpoint)&&(resource.attributes.factoryStart===call.start||resource.attributes.connectionStart===call.start)));
      if (auth.length) {
        const emulator = auth.filter(c => c.callee.endsWith('connectAuthEmulator'));
        const evidence = auth.map(c => c.evidence);
        const node = add(['auth-use', ownerAt(path)?.id ?? from, path], '認証サービス向けの使用・設定（プロジェクト未特定）', 'unresolved', evidence, { context: ['Firebase Auth'], auxiliary: auxiliary(path), technologyNames: ['firebase-authentication'],
          request: { kind: 'auth', ownerId: ownerAt(path)?.id ?? from, expression: auth.map(call => `${call.callee}(${call.args.join(', ')})`).join('\n'), sourceId: `auth-use:${path}` } });
        connect(from, node.id, 'service-use', '認証SDKの使用コード', evidence, 'source');
        for (const call of emulator) {
          const target = call.literals[1], evidence = [call.evidence];
          const emulatorNode = add(['auth-emulator', path, target ?? call.args[1] ?? 'dynamic'], target ? `Authエミュレーター · ${target}` : 'Authエミュレーター（接続先未解決）', target ? 'external-service' : 'unresolved', evidence, { context: ['Firebase Auth emulator'], auxiliary: auxiliary(path), technologyNames: ['firebase-authentication'] });
          connect(from, emulatorNode.id, 'service-use', 'Authエミュレーターへの接続設定コード', evidence, target ? 'source' : 'unresolved');
        }
      }
    }
    // A named event is insufficient. Pair only operations on the same explicit
    // receiver in the same lexical source file; the edge retains both call sites.
    if (parsed) for (const send of parsed.calls.filter(c => c.callee.endsWith('.emit') && c.literals[0])) {
      const receiver = send.callee.slice(0, -5);
      const receivers = parsed.calls.filter(c => (c.callee === `${receiver}.on` || c.callee === `${receiver}.once`) && c.literals[0] === send.literals[0] && c.lexicalScope === send.lexicalScope);
      if (!receivers.length) continue;
      const evidence = [send.evidence, ...receivers.map(c => c.evidence)];
      connect(from, from, 'message', `同一receiver ${receiver}のイベント ${send.literals[0]}`, evidence, 'inferred');
      edges.at(-1)!.details!.architectureOrigin = 'source';
    }
  }
  for (const pkg of packages.filter(p => p.node.architecture?.context.includes('Extension Host'))) {
    for (const unit of units.filter(u => u.node.architecture?.context.includes('Webview / ブラウザ') && within(u.dir, pkg.dir))) {
      const browserPath = unit.node.architecture!.entryPaths[0]!, browserCalls = syntax.get(browserPath)?.calls ?? [];
      const api = browserCalls.find(c => /(?:^|\.)acquireVsCodeApi$/.test(c.callee));
      if (!api?.assigned) continue;
      const builds = [...syntax].filter(([path, parsed]) => /vite\.config\./.test(path) && parsed.config && within(unit.dir, architecturePath(pkg.dir, string(parsed.config.root))));
      for (const [configPath, parsed] of builds) {
        const root = architecturePath(pkg.dir, string(parsed.config!.root)), output = string(object(parsed.config!.build).outDir);
        if (!output) continue;
        const outputPath = architecturePath(root, output);
        for (const [hostPath, hostSyntax] of syntax) {
          if (ownerAt(hostPath)?.id !== pkg.node.id) continue;
          const panels = hostSyntax.calls.filter(c => c.callee.endsWith('.createWebviewPanel') && c.assigned);
          for (const panel of panels) {
            const roots = hostSyntax.calls.filter(c => c.start >= panel.start && c.end <= panel.end && c.callee.endsWith('.joinPath') && c.literals.slice(1).every(Boolean));
            if (!roots.some(c => architecturePath(pkg.dir, c.literals.slice(1).join('/')) === outputPath)) continue;
            const base = `${panel.assigned}.webview`, hostFrom = fileOwners.get(hostPath)!, browserFrom = fileOwners.get(browserPath)!;
            const configuration = [...ev(configPath, output, 'Webviewのビルド出力先'), panel.evidence, ...roots.map(c => c.evidence)];
            connect(pkg.node.id, unit.node.id, 'deployment-config', 'Webviewアセットの組み込み設定', configuration, 'source');
            const receive = hostSyntax.calls.filter(c => c.callee === `${base}.onDidReceiveMessage`);
            const send = browserCalls.filter(c => c.callee === `${api.assigned}.postMessage`);
            if (receive.length && send.length) connect(browserFrom, hostFrom, 'message', `Webview → Extension Host（${panel.literals[0] ?? '識別子未指定'}）`, [...configuration, ...receive.map(c => c.evidence), ...send.map(c => c.evidence)], 'inferred');
            const hostSend = hostSyntax.calls.filter(c => c.callee === `${base}.postMessage`), browserReceive = browserCalls.filter(c => c.callee === 'window.addEventListener' && c.literals[0] === 'message');
            if (hostSend.length && browserReceive.length) connect(hostFrom, browserFrom, 'message', `Extension Host → Webview（${panel.literals[0] ?? '識別子未指定'}）`, [...configuration, ...hostSend.map(c => c.evidence), ...browserReceive.map(c => c.evidence)], 'inferred');
          }
        }
      }
    }
  }
  // Membership is single-owner; parent counts use sets, never sums of overlapping roles.
  for (const node of nodes.values()) if (node.architecture!.parentId) {
    const parent = nodes.get(node.architecture!.parentId)!;
    for (const member of node.architecture!.memberIds) parent.architecture!.memberIds.push(member);
    for (const file of node.architecture!.files) parent.architecture!.files.push(file);
    if (!node.architecture!.auxiliary) for (const role of node.architecture!.roles) {
      const previous = parent.architecture!.roles.find(item => item.label === role.label);
      if (previous) previous.evidence = uniqueArchitectureEvidence([...previous.evidence, ...role.evidence]);
      else parent.architecture!.roles.push({ ...role, reason: `内部構成「${node.label}」から集約した役割。${role.reason}`, evidence: [...role.evidence] });
    }
  }
  for (const node of nodes.values()) {
    const arch = node.architecture!; arch.memberIds = unique(arch.memberIds); arch.files = unique(arch.files); arch.entryPaths = unique(arch.entryPaths); arch.environments = unique(arch.environments);
    node.evidence = uniqueArchitectureEvidence(node.evidence);
    node.attributes.members = arch.memberIds; node.attributes.files = arch.files; node.attributes.auxiliary = arch.auxiliary;
  }
  populateArchitectureUsage(nodes, edges, packages, syntax, ev);
  return { view: 'architecture-map', nodes: [...nodes.values()], edges: [...new Map(edges.map(edge => [edge.id, edge])).values()], environments: [...environments].sort(), limitations: [...limitations] };
}
