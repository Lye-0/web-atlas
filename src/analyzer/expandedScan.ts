import { findCanonicalStackByPackageName, getStack } from '../data';
import { makeEvidence } from './evidence';
import { directoryFor, localPath, parseManifest, parseStructuredConfig, sourceRangeFor, type ManifestProject } from './manifestAdapters';
import { languageImports, resolveLanguageImports, scriptSource, sourceLanguage, sourceSyntax } from './sourceSyntax';
import { normalizeIdentifier, registeredStackForDependency, stackRegistry, type Ecosystem } from './stackRegistry';
import { moduleDirectoryId, moduleIdForPath, parseModuleImports } from './moduleResolver';
import { scriptIdFor, type AnalyzerEvidenceRole, type AnalyzerMetadata, type AnalyzerRelationKind, type WorkspacePackageFact } from './types';
import type { AnalyzerStoreBuilder } from './scan';
import { compileHeaderLanguages } from './compileHeaders';

export interface ExpansionContext {
  builder: AnalyzerStoreBuilder;
  sources: Map<string, string>;
  projects: ManifestProject[];
  owner: (path: string) => ManifestProject | undefined;
  evidence: (path: string, start: number, end: number, detector: string, description: string, role?: AnalyzerEvidenceRole) => string;
  technology: (stackId: string, path: string, start: number, end: number, role: AnalyzerEvidenceRole, description: string) => string;
  relation: (from: string, to: string, kind: AnalyzerRelationKind, evidence: string[], metadata?: AnalyzerMetadata) => void;
}
export {expandedProjectId}from'./projectPaths';
import{expandedProjectId}from'./projectPaths';
function globMatches(path: string, pattern: string): boolean {
  return new RegExp('^' + pattern.split('**').map(part => part.split('*').map(value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')).join('.*') + '$').test(path);
}
export function buildExpansionContext(builder: AnalyzerStoreBuilder, sources: Map<string, string>): ExpansionContext {
  const projects: ManifestProject[] = [];
  for (const [path, source] of sources) {
    try { const project = parseManifest(path, source, sources); if (project) projects.push(project, ...(project.children ?? [])); }
    catch (error) { builder.addWarning({ id: `warning:manifest:${path}`, filePath: path, detectorId: 'manifest-adapter', severity: 'warning', message: error instanceof Error ? error.message : 'manifestを解析できませんでした' }); }
  }
  const owner = (path: string) => projects.filter(project => !project.attributes.solution && (project.directory === '.' || path.startsWith(`${project.directory}/`))).sort((a, b) => b.directory.length - a.directory.length || Number(b.path.endsWith('package.json')) - Number(a.path.endsWith('package.json')))[0];
  const evidence: ExpansionContext['evidence'] = (path, start, end, detector, description, role = 'usage') => builder.addEvidence(makeEvidence(path, sources.get(path) ?? '', { start, end }, role === 'declaration' ? 'manifest' : 'technology', detector, description, 2, role, owner(path)?.directory, role === 'scope' ? 'structural' : 'usage-only'));
  const relation: ExpansionContext['relation'] = (sourceId, targetId, kind, evidenceIds, metadata = {}) => { builder.addRelation({ id: `relation:${kind}:${sourceId}:${targetId}:${evidenceIds.join('|')}`, sourceId, targetId, kind, evidenceIds, metadata }); };
  const technology: ExpansionContext['technology'] = (stackId, path, start, end, role, description) => {
    const stack = getStack(stackId); const support = stackRegistry.find(entry => entry.stackId === stackId);
    const evidenceId = evidence(path, start, end, `registry:${stackId}`, description, role); const id = `technology:${stackId}`;
    builder.addFact({ id, kind: 'technology', label: stack?.name ?? stackId, filePath: path, dictionaryStackId: stackId, packageNames: [], explicit: role !== 'declaration', evidenceIds: [evidenceId], metadata: { dictionaryStackId: stackId, source: role === 'declaration' ? 'manifest declaration' : 'static source/config usage', aliases: stack?.aliases ?? [], profiles: support?.profiles ?? [], requiredPrimitives: support?.requiredPrimitives ?? [], limitations: support?.limitations ?? [], supportStatus: '部分対応：明示形式を解析。動的構成は未解決' } });
    const project = owner(path); if (project) relation(expandedProjectId(project), id, 'uses', [evidenceId]);
    return id;
  };
  return { builder, sources, projects, owner, evidence, technology, relation };
}

export function scanManifestProjects(context: ExpansionContext): void {
  const { builder, projects, sources, evidence, relation, technology } = context;
  for (const project of projects) {
    const id = expandedProjectId(project); const source = sources.get(project.path)!;
    const ev = evidence(project.path, 0, Math.max(1, source.split('\n')[0]!.length), 'manifest-project', `${project.ecosystem} project declaration`, 'scope');
    const existing = builder.getFact(id);
    if (!existing) {
      const fact: WorkspacePackageFact = { id, kind: 'workspace-package', label: project.name, packageName: project.name, packagePath: project.directory, manifestPath: project.path, filePath: project.path,
        scripts: Object.fromEntries(project.commands.map(command => [command.name, command.command])), dependencies: [], isRoot: project.directory === '.', evidenceIds: [ev], metadata: { ecosystem: project.ecosystem, manifestPath: project.path, packagePath: project.directory, ...project.attributes } };
      builder.addFact(fact);
      builder.addFact({ id: `manifest:${project.path}`, kind: 'package-manifest', packagePath: project.directory, packageId: id, label: project.path, filePath: project.path, evidenceIds: [ev], metadata: { ecosystem: project.ecosystem, manifestPath: project.path } });
      relation('project:root', id, 'contains', [ev]);
    }
    const projectFact=builder.getFact(id);if(projectFact?.kind==='workspace-package')projectFact.metadata.ecosystem=project.ecosystem;
    for (const tool of project.tools) if (getStack(tool)) technology(tool, project.path, 0, source.length, 'declaration', `${tool}のmanifest設定`);
    if (project.attributes.jvmTarget) technology('jvm', project.path, 0, source.length, 'declaration', 'JVM target / Java build configuration');
    if (project.members.length) {
      const configId = `workspace-config:${project.path}`;
      if (!builder.getFact(configId)) builder.addFact({ id: configId, kind: 'workspace-config', manager: project.ecosystem, patterns: project.members, label: project.path, filePath: project.path, evidenceIds: [ev], metadata: { ecosystem: project.ecosystem, declaredMembers: project.members } });
      relation('project:root', configId, 'uses-config', [ev]);
      for (const [index, member] of project.members.entries()) {
        const resolved = localPath(project.directory, member); if (!resolved) { builder.addWarning({ id: `warning:member:${project.path}:${index}`, severity: 'warning', filePath: project.path, message: `root外またはremoteのmemberを除外: ${member}` }); continue; }
        const range = sourceRangeFor(source, member); const memberEv = evidence(project.path, range.start, range.end, 'manifest-member', `明示member: ${member}`, 'scope');
        const patternId = `workspace-pattern:${project.path}:${index}`;
        builder.addFact({ id: patternId, kind: 'workspace-pattern', label: member, pattern: resolved, configId, filePath: project.path, evidenceIds: [memberEv], metadata: { ecosystem: project.ecosystem, declared: true } });
        relation(configId, patternId, 'declares', [memberEv]);
        const matches = projects.filter(candidate => candidate !== project && (candidate.path === resolved || globMatches(candidate.directory, resolved)));
        for (const match of matches) relation(patternId, expandedProjectId(match), 'matches', [memberEv]);
        if (!matches.length) builder.addWarning({ id: `warning:member-unresolved:${project.path}:${index}`, severity: 'warning', filePath: project.path, message: `選択root内でmember未解決: ${member}` });
      }
    }
    // Existing npm pass already creates its manifest dependencies; add missing non-workspace npm packages here.
    const handleDependencies = project.ecosystem !== 'npm' || !existing || !project.path.endsWith('package.json');
    if (handleDependencies) for (const dep of project.dependencies) {
      const dependencyEv = evidence(project.path, dep.start, dep.end, 'ecosystem-dependency', `${project.ecosystem}: ${dep.name} (${dep.type})`, 'declaration');
      const local = projects.find(candidate => candidate !== project && candidate.ecosystem === project.ecosystem && candidate.name === dep.name);
      const depId = local ? expandedProjectId(local) : `external-package:${project.ecosystem}:${normalizeIdentifier(project.ecosystem, dep.name)}`;
      const support = registeredStackForDependency(project.ecosystem, dep.name); const fallback = project.ecosystem === 'npm' ? findCanonicalStackByPackageName(dep.name) : undefined;
      if (!local) builder.addFact({ id: depId, kind: 'external-package', label: dep.name, packageName: dep.name, versionRanges: [dep.version], dependencyTypes: [dep.type], evidenceIds: [dependencyEv], metadata: { ecosystem: project.ecosystem, packageName: dep.name, versionRange: dep.version, dependencyType: dep.type, condition: dep.condition, dictionaryStackId:support?.stackId??fallback?.id } });
      relation(id, depId, 'depends-on', [dependencyEv], { ecosystem: project.ecosystem, dependencyType: dep.type, versionRange: dep.version, condition: dep.condition });
      if (support || fallback) technology(support?.stackId ?? fallback!.id, project.path, dep.start, dep.end, 'declaration', `${project.ecosystem}直接依存: ${dep.name}`);
      const fact = builder.getFact(id); if (fact?.kind === 'workspace-package') fact.dependencies.push({ packageName: dep.name, versionRange: dep.version, dependencyType: dep.type, sourcePath: project.path, valueStartOffset: dep.start, valueEndOffset: dep.end, evidenceId: dependencyEv, ecosystem: project.ecosystem });
    }
    for (const reference of project.projectReferences) {
      const targetPath = localPath(project.directory, reference); const target = targetPath ? projects.find(candidate => candidate.path === targetPath || candidate.directory === targetPath) : undefined;
      if (target) relation(id, expandedProjectId(target), 'depends-on', [ev], { ecosystem: project.ecosystem, dependencyType: 'workspaceDependency', projectReference: reference });
      else builder.addWarning({ id: `warning:project-ref:${project.path}:${reference}`, severity: 'warning', filePath: project.path, message: `project参照は未解決: ${reference}` });
    }
    for (const command of project.commands) {
      const scriptId = scriptIdFor(id, command.name); if (builder.getFact(scriptId)) continue;
      const commandEv = evidence(project.path, command.start, command.end, 'manifest-command', `${project.ecosystem} command: ${command.name}`, 'declaration');
      builder.addFact({ id: scriptId, kind: 'package-script', label: command.name, packageId: id, packageName: project.name, packagePath: project.directory, scriptName: command.name, command: command.command,
        sourcePath: project.path, commandStartOffset: command.start, commandEndOffset: command.end, filePath: project.path, evidenceIds: [commandEv], metadata: { ecosystem: project.ecosystem, purpose: command.purpose ?? command.name, manifestPath: project.path } });
      relation(id, scriptId, 'contains', [commandEv]);
    }
    for (const [index, message] of project.unresolved.entries()) builder.addWarning({ id: `warning:manifest-form:${project.path}:${index}`, severity: 'warning', filePath: project.path, detectorId: 'manifest-adapter', message });
  }
  const memberships=new Set(builder.build([]).relations.filter(relation=>relation.kind==='matches').map(relation=>relation.targetId));
  builder.forEachFact(fact=>{if(fact.kind==='workspace-package')fact.metadata.workspaceMembership=fact.isRoot?'root':memberships.has(fact.id)?'member':'standalone';});
}

function npmRoot(specifier: string): string { return specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]!; }
function importEcosystem(language: string | undefined): Ecosystem {
  return ({ python:'pypi',java:'maven',kotlin:'maven',scala:'maven',csharp:'nuget',go:'go',rust:'cargo',ruby:'gem',php:'composer',dart:'dart',swift:'swift' } as Record<string, Ecosystem>)[language ?? ''] ?? 'npm';
}
export async function scanSourceTechnologies(context: ExpansionContext): Promise<void> {
  const { sources, technology, evidence, relation, builder, owner } = context;
  const headerLanguages=compileHeaderLanguages(sources);
  for (const [path, source] of sources) {
    const extension = path.split('.').at(-1)?.toLowerCase() ?? ''; const language = extension==='h'?headerLanguages.get(path):sourceLanguage(path);
    if(extension==='h'&&language)technology(language,path,0,Math.min(source.length,120),'usage','compile_commandsの明示言語とincludeから確認したheader');
    for (const support of stackRegistry.filter(entry => entry.sourceExtensions.includes(extension)&&(entry.stackId!=='wpf'||owner(path)?.tools.includes('wpf')))) technology(support.stackId, path, 0, Math.min(source.length, 120), 'usage', `${extension} source / template`);
    if (extension === 'tsx') technology('typescript', path, 0, Math.min(source.length, 120), 'usage', 'TSXの基底言語TypeScript');
    if (extension === 'jsx') technology('javascript', path, 0, Math.min(source.length, 120), 'usage', 'JSXの基底言語JavaScript');
    if (['js','mjs','cjs'].includes(extension) && source.includes('<')) {
      const ts = await import('typescript'); const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
      let jsx: import('typescript').Node | undefined;
      const visit = (node: import('typescript').Node) => { if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) jsx ??= node; ts.forEachChild(node, visit); }; visit(file);
      if (jsx) technology('jsx', path, jsx.getStart(file), jsx.end, 'usage', 'JavaScript内のJSX構文をparserで確認');
    }
    const ecosystem = importEcosystem(language); const imports = language ? languageImports(path, source) : /\.[cm]?[jt]sx?$/.test(path) ? parseModuleImports(source) : [];
    for (const reference of imports) {
      if (reference.specifier.startsWith('.') || reference.specifier.startsWith('/')) continue;
      const support = stackRegistry.find(entry => entry.imports[ecosystem]?.some(value => reference.specifier === value || (ecosystem === 'maven' || ecosystem === 'nuget' || ecosystem === 'composer') && reference.specifier.startsWith(value + (ecosystem === 'composer' ? '\\' : '.')) || ecosystem === 'npm' && reference.specifier.startsWith(`${value}/`)));
      const dependency = !support ? registeredStackForDependency(ecosystem, ecosystem === 'npm' ? npmRoot(reference.specifier) : reference.specifier) : undefined;
      const firebaseSubpath = ({ 'firebase/auth':'firebase-authentication', 'firebase-admin/auth':'firebase-authentication', 'firebase/firestore':'cloud-firestore', 'firebase-admin/firestore':'cloud-firestore', 'firebase/storage':'firebase-storage', 'firebase-admin/storage':'firebase-storage' } as Record<string, string>)[reference.specifier];
      const stackId = firebaseSubpath ?? support?.stackId ?? dependency?.stackId;
      if (stackId) technology(stackId, path, reference.start, reference.end, 'usage', `import: ${reference.specifier}`);
    }
    if (!language || ['html','wpf','sql','graphql'].includes(language) || builder.getFact(moduleIdForPath(path))) continue;
    const references = resolveLanguageImports(path, source, sources, context.projects); const project = owner(path); const packageId = project ? expandedProjectId(project) : undefined; const dir = directoryFor(path); const directoryId = moduleDirectoryId(packageId, dir);
    const ev = evidence(path, 0, Math.min(source.length, 120), 'language-module', `${language} module`, 'usage');
    builder.addFact({ id: moduleIdForPath(path), kind: 'module', label: path.split('/').at(-1)!, filePath: path, path, directoryId, directoryPath: dir, packageId, packagePath: project?.directory, packageName: project?.name, language, extension: `.${extension}`, imports: references, unresolvedImports: references.filter(reference => !reference.resolvedPath), evidenceIds: [ev], metadata: { language, ecosystem, packagePath: project?.directory, unresolvedImports: references.filter(reference => !reference.resolvedPath).map(reference => `${reference.specifier}: ${reference.reason}`) } });
    const packagePath=project?.directory??'.';const baseParts=packagePath==='.'?[]:packagePath.split('/');const dirParts=dir==='.'?[]:dir.split('/');
    for(let length=baseParts.length+1;length<=dirParts.length;length++){
      const directory=dirParts.slice(0,length).join('/');const id=moduleDirectoryId(packageId,directory);const parentDirectoryId=length>baseParts.length+1?moduleDirectoryId(packageId,dirParts.slice(0,length-1).join('/')):undefined;
      const existing=builder.getFact(id);const direct=directory===dir;
      if(existing?.kind==='module-directory'){if(direct&&!existing.moduleIds.includes(moduleIdForPath(path)))existing.moduleIds.push(moduleIdForPath(path));}
      else builder.addFact({id,kind:'module-directory',label:dirParts[length-1]!,path:directory,packageId,parentDirectoryId,childDirectoryIds:[],moduleIds:direct?[moduleIdForPath(path)]:[],depth:length-baseParts.length-1,evidenceIds:[ev],metadata:{packagePath}});
      const parent=parentDirectoryId?builder.getFact(parentDirectoryId):undefined;if(parent?.kind==='module-directory'&&!parent.childDirectoryIds.includes(id))parent.childDirectoryIds.push(id);
    }
    if(dir!==packagePath)relation(directoryId,moduleIdForPath(path),'contains',[ev]);
    for (const reference of references.filter(reference => reference.resolvedPath)) {
      const target = moduleIdForPath(reference.resolvedPath!); const depEv = evidence(path, reference.start, reference.end, 'language-import', `${reference.specifier} → ${reference.resolvedPath}`, 'usage');
      builder.addFact({ id: `module-dependency:${path}:${reference.start}:${reference.resolvedPath}`, kind: 'module-dependency', label: reference.specifier, fromModuleId: moduleIdForPath(path), toModuleId: target, dependencyKind: reference.kind, specifier: reference.specifier, sourcePath: path, targetPath: reference.resolvedPath!, filePath: path, evidenceIds: [depEv], metadata: { language } });
      relation(moduleIdForPath(path), target, 'imports', [depEv], { dependencyKind: reference.kind });
    }
    // Preserve script offsets for the shared semantic parser without duplicating module identities.
    if (['vue','svelte','astro'].includes(language)) sourceSyntax(scriptSource(path, source), 'typescript');
  }
}

export function scanToolConfiguration(context: ExpansionContext): void {
  const { sources, technology } = context;
  const named: Record<string, string> = { 'yarn.lock':'yarn','.yarnrc.yml':'yarn','bun.lock':'bun','bun.lockb':'bun','bunfig.toml':'bun','uv.lock':'uv','pip.conf':'pip','pip.ini':'pip','pytest.ini':'pytest','global.json':'dotnet' };
  for (const [path, source] of sources) {
    const name = path.split('/').at(-1)!.toLowerCase(); let stackId = named[name];
    for (const tool of ['webpack','jest','cypress']) if (name.startsWith(`${tool}.config.`)) stackId = tool;
    if (stackId) technology(stackId, path, 0, Math.min(source.length, 200), 'declaration', `${name}の設定`);
    if (/^tsconfig.*\.json$/.test(name)) try { const config = parseStructuredConfig(path, source); const jsx = (config.compilerOptions as Record<string, unknown> | undefined)?.jsx; if (typeof jsx === 'string') { const range = sourceRangeFor(source, 'jsx'); technology('tsx', path, range.start, range.end, 'declaration', `TypeScript jsx変換設定: ${jsx}`); } } catch { /* original config parser reports malformed config */ }
  }
}
