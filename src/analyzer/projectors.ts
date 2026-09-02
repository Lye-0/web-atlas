import { getCategory, getStack } from '../data';
import { makeEvidence, type OffsetRange } from './evidence';
import { parseCommandExpression, type CommandFragment } from './commandParser';
import {
  analyzerViewLabels,
  nodeTypeLabels,
  relationLabels,
  scriptIdFor,
  type AnalyzerCluster,
  type AnalyzerFact,
  type AnalyzerNodeType,
  type AnalyzerProjectStore,
  type AnalyzerRelation,
  type AnalyzerStackUsage,
  type AnalyzerViewEdge,
  type AnalyzerViewModel,
  type AnalyzerViewNode,
  type AnalyzerWarning,
  type CommandFact,
  type PackageManifestFact,
  type PackageScriptFact,
  type WorkspacePackageFact,
} from './types';

export const ANALYZER_EXTERNAL_SUMMARY_ID = 'dependencies:external:summary';
export const ANALYZER_COMMAND_COMMON_LANE_ID = 'command-lane:common';

function nodeSubtitle(fact: AnalyzerFact): string | undefined {
  if (fact.kind === 'project') return 'Selected local project folder';
  if (fact.kind === 'workspace-package') return fact.packagePath === '.' ? 'root package · workspace root' : fact.packagePath;
  if (fact.kind === 'workspace-config') return fact.filePath;
  if (fact.kind === 'workspace-pattern') return fact.configId;
  if (fact.kind === 'package-script') return `${fact.packageName} · ${fact.packagePath} · ${fact.command}`;
  if (fact.kind === 'technology') return fact.packageNames.length > 0 ? fact.packageNames.join(' · ') : 'explicit configuration';
  if (fact.kind === 'external-package') return fact.versionRanges.join(' · ');
  if (fact.kind === 'runtime') return typeof fact.metadata.main === 'string' ? fact.metadata.main : fact.runtimeType;
  if (fact.kind === 'resource') return fact.binding ?? fact.resourceType;
  if (fact.kind === 'dotnet-project') return fact.projectPath;
  return undefined;
}

function nodeForFact(fact: AnalyzerFact, clusterId: string | undefined, typeOverride?: AnalyzerNodeType): AnalyzerViewNode {
  const type: AnalyzerNodeType = typeOverride ?? (fact.kind === 'package-manifest' ? 'application' : fact.kind);
  return {
    id: fact.id,
    factId: fact.id,
    type,
    label: fact.label,
    subtitle: nodeSubtitle(fact),
    ...(clusterId ? { clusterId } : {}),
    evidenceIds: fact.evidenceIds,
    metadata: {
      ...fact.metadata,
      factKind: fact.kind,
      nodeType: nodeTypeLabels[type],
      ...(fact.kind === 'project' ? { displayRole: 'PROJECT' } : {}),
      ...(fact.kind === 'workspace-package' && fact.isRoot ? { displayRole: 'ROOT PACKAGE' } : {}),
    },
  };
}

function summaryNode(
  id: string,
  label: string,
  subtitle: string,
  type: AnalyzerNodeType,
  clusterId: string,
  childNodes: AnalyzerViewNode[],
): AnalyzerViewNode {
  const childNodeIds = childNodes.map((node) => node.id);
  return {
    id,
    type,
    label,
    subtitle,
    clusterId,
    evidenceIds: [],
    metadata: {
      displayRole: 'SUMMARY',
      presentation: 'summary',
      childCount: childNodeIds.length,
      childNodeIds,
    },
    presentation: { role: 'summary', childNodeIds, hideWhenExpanded: true },
  };
}

function cluster(id: string, label: string, tone: AnalyzerCluster['tone'], nodes: AnalyzerViewNode[]): AnalyzerCluster {
  return { id, label, tone, nodeIds: nodes.filter((node) => node.clusterId === id).map((node) => node.id) };
}

function baseWarnings(store: AnalyzerProjectStore, view: AnalyzerViewModel['view']): AnalyzerWarning[] {
  return store.warnings.map((warning) => ({ ...warning, id: `${view}:${warning.id}` }));
}

function relationEdge(relation: AnalyzerRelation, kind = relation.kind, label = relationLabels[kind]): AnalyzerViewEdge {
  return {
    id: `view-edge:${relation.id}:${kind}`,
    sourceId: relation.sourceId,
    targetId: relation.targetId,
    kind,
    label,
    evidenceIds: relation.evidenceIds,
    metadata: relation.metadata,
  };
}

function edgesForRelations(
  store: AnalyzerProjectStore,
  nodes: AnalyzerViewNode[],
  predicate: (relation: AnalyzerRelation) => boolean,
  mapKind?: (relation: AnalyzerRelation) => AnalyzerRelation['kind'],
): AnalyzerViewEdge[] {
  const nodeIds = new Set(nodes.map((node) => node.id));
  return store.relations
    .filter(predicate)
    .filter((relation) => nodeIds.has(relation.sourceId) && nodeIds.has(relation.targetId))
    .map((relation) => {
      const kind = mapKind?.(relation) ?? relation.kind;
      return relationEdge(relation, kind, relationLabels[kind]);
    });
}

type StackMapScopeKind = 'root' | 'services' | 'application' | 'workspace' | 'package' | 'desktop';

interface StackMapScopeRecord {
  id: string;
  nodeId: string;
  clusterId: string;
  label: string;
  path: string;
  kind: StackMapScopeKind;
  factId?: string;
  evidenceIds: Set<string>;
  usageIds: Set<string>;
}

interface StackMapPackageRecord {
  packagePath: string;
  factId: string;
  isRoot: boolean;
  evidenceIds: string[];
}

interface StackMapUsageRecord extends AnalyzerStackUsage {
  stackName: string;
  categoryLabel: string;
  sourceFactKinds: Set<string>;
}

function stackMapScopeNodeId(scopeId: string): string {
  return `stack-scope:${scopeId}`;
}

function stackMapScopeClusterId(scopeId: string): string {
  return `stack-map:scope:${scopeId}`;
}

function humanizeScopeSegment(segment: string): string {
  return segment.replace(/[-_]+/g, ' ').trim().toUpperCase();
}

function packageScopeKind(packagePath: string): StackMapScopeKind {
  if (packagePath.startsWith('apps/')) return 'application';
  if (packagePath.startsWith('packages/')) return 'workspace';
  return 'package';
}

function packageScopeLabel(packagePath: string): string {
  const segments = packagePath.split('/').filter(Boolean);
  return humanizeScopeSegment(segments.at(-1) ?? packagePath);
}

function packageScopeId(packagePath: string): string {
  return packagePath === '.' ? 'root' : `package:${packagePath}`;
}

function serviceConfigPath(filePath: string): boolean {
  const name = filePath.split('/').at(-1)?.toLowerCase();
  return name === 'wrangler.json'
    || name === 'wrangler.jsonc'
    || name === 'wrangler.toml'
    || name === 'firebase.json'
    || name === '.firebaserc';
}

function pathBelongsToPackage(filePath: string, packagePath: string): boolean {
  if (packagePath === '.') return true;
  return filePath === packagePath || filePath.startsWith(`${packagePath}/`);
}

function nearestPackageScope(filePath: string, packages: StackMapPackageRecord[]): StackMapPackageRecord | undefined {
  return [...packages]
    .filter((candidate) => pathBelongsToPackage(filePath, candidate.packagePath))
    .sort((first, second) => second.packagePath.length - first.packagePath.length)[0];
}

function canonicalStackForFact(fact: AnalyzerFact): ReturnType<typeof getStack> {
  const stackId = fact.kind === 'technology' || fact.kind === 'resource'
    ? fact.dictionaryStackId
    : fact.kind === 'runtime' && typeof fact.metadata.dictionaryStackId === 'string'
      ? fact.metadata.dictionaryStackId
      : undefined;
  return stackId ? getStack(stackId) : undefined;
}

function stackUsageRole(fact: AnalyzerFact): string | undefined {
  if (fact.kind === 'technology') return fact.explicit ? 'explicit configuration' : 'package dependency';
  if (fact.kind === 'runtime') return 'runtime';
  if (fact.kind === 'resource') return fact.resourceType;
  return undefined;
}

function buildStackMap(store: AnalyzerProjectStore): AnalyzerViewModel {
  const projectFact = store.facts.find((fact): fact is Extract<AnalyzerFact, { kind: 'project' }> => fact.kind === 'project');
  const rootWorkspacePackage = store.facts.find((fact): fact is WorkspacePackageFact => fact.kind === 'workspace-package' && fact.isRoot);
  const rootManifest = store.facts.find((fact): fact is PackageManifestFact => fact.kind === 'package-manifest' && fact.packagePath === '.');
  const rootPackage = rootWorkspacePackage ?? rootManifest;
  const packageRecords = new Map<string, StackMapPackageRecord>();
  store.facts
    .filter((fact): fact is WorkspacePackageFact | PackageManifestFact => fact.kind === 'workspace-package' || fact.kind === 'package-manifest')
    .forEach((fact) => {
      const existing = packageRecords.get(fact.packagePath);
      packageRecords.set(fact.packagePath, {
        packagePath: fact.packagePath,
        factId: fact.kind === 'workspace-package' ? fact.id : existing?.factId ?? fact.id,
        isRoot: fact.packagePath === '.',
        evidenceIds: [...new Set([...(existing?.evidenceIds ?? []), ...fact.evidenceIds])],
      });
    });
  const packages = [...packageRecords.values()];
  const desktopFacts = store.facts.filter((fact): fact is Extract<AnalyzerFact, { kind: 'dotnet-project' }> => fact.kind === 'dotnet-project');
  const scopes = new Map<string, StackMapScopeRecord>();

  const ensureScope = (scope: Omit<StackMapScopeRecord, 'nodeId' | 'clusterId' | 'evidenceIds' | 'usageIds'>, evidenceIds: readonly string[] = []): StackMapScopeRecord => {
    const existing = scopes.get(scope.id);
    if (existing) {
      evidenceIds.forEach((evidenceId) => existing.evidenceIds.add(evidenceId));
      if (!existing.factId && scope.factId) existing.factId = scope.factId;
      return existing;
    }
    const created: StackMapScopeRecord = {
      ...scope,
      nodeId: stackMapScopeNodeId(scope.id),
      clusterId: stackMapScopeClusterId(scope.id),
      evidenceIds: new Set(evidenceIds),
      usageIds: new Set(),
    };
    scopes.set(scope.id, created);
    return created;
  };

  if (projectFact || rootPackage) {
    ensureScope({
      id: 'root',
      label: 'PROJECT / TOOLING',
      path: '.',
      kind: 'root',
      ...(rootPackage?.id ?? projectFact?.id ? { factId: rootPackage?.id ?? projectFact?.id } : {}),
    }, [...new Set([...(projectFact?.evidenceIds ?? []), ...(rootPackage?.evidenceIds ?? [])])]);
  }
  packages.filter((fact) => !fact.isRoot).forEach((fact) => {
    const kind = packageScopeKind(fact.packagePath);
    ensureScope({
      id: packageScopeId(fact.packagePath),
      label: packageScopeLabel(fact.packagePath),
      path: fact.packagePath,
      kind,
      factId: fact.factId,
    }, fact.evidenceIds);
  });
  desktopFacts.forEach((fact) => {
    ensureScope({
      id: `dotnet:${fact.id}`,
      label: 'DESKTOP',
      path: fact.projectPath,
      kind: 'desktop',
      factId: fact.id,
    }, fact.evidenceIds);
  });

  const evidenceById = new Map(store.evidence.map((evidence) => [evidence.id, evidence]));
  const usageById = new Map<string, StackMapUsageRecord>();
  const serviceScope = () => ensureScope({
    id: 'services',
    label: 'PROJECT / SERVICES',
    path: '.',
    kind: 'services',
    ...(projectFact ? { factId: projectFact.id } : {}),
  }, projectFact?.evidenceIds ?? []);
  const scopeForEvidence = (filePath: string): StackMapScopeRecord => {
    const desktopFact = desktopFacts.find((fact) => fact.projectPath === filePath);
    if (desktopFact) {
      return ensureScope({
        id: `dotnet:${desktopFact.id}`,
        label: 'DESKTOP',
        path: desktopFact.projectPath,
        kind: 'desktop',
        factId: desktopFact.id,
      }, desktopFact.evidenceIds);
    }
    const packageFact = nearestPackageScope(filePath, packages);
    if (packageFact && !packageFact.isRoot) {
      return ensureScope({
        id: packageScopeId(packageFact.packagePath),
        label: packageScopeLabel(packageFact.packagePath),
        path: packageFact.packagePath,
        kind: packageScopeKind(packageFact.packagePath),
        factId: packageFact.factId,
      }, packageFact.evidenceIds);
    }
    if (serviceConfigPath(filePath)) return serviceScope();
    return ensureScope({
      id: 'root',
      label: 'PROJECT / TOOLING',
      path: '.',
      kind: 'root',
      ...(rootPackage?.id ?? projectFact?.id ? { factId: rootPackage?.id ?? projectFact?.id } : {}),
    }, [...new Set([...(projectFact?.evidenceIds ?? []), ...(rootPackage?.evidenceIds ?? [])])]);
  };

  store.facts.forEach((fact) => {
    const stack = canonicalStackForFact(fact);
    if (!stack) return;
    const evidence = fact.evidenceIds
      .map((evidenceId) => evidenceById.get(evidenceId))
      .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));
    if (evidence.length === 0) return;
    const evidenceByScope = new Map<string, { scope: StackMapScopeRecord; evidenceIds: Set<string> }>();
    evidence.forEach((item) => {
      const scope = scopeForEvidence(item.filePath);
      const entry = evidenceByScope.get(scope.id) ?? { scope, evidenceIds: new Set<string>() };
      entry.evidenceIds.add(item.id);
      evidenceByScope.set(scope.id, entry);
    });
    evidenceByScope.forEach(({ scope, evidenceIds }) => {
      const usageId = `stack-usage:${scope.id}:${stack.id}`;
      const usage = usageById.get(usageId) ?? {
        id: usageId,
        stackId: stack.id,
        scopeId: scope.id,
        evidenceIds: [],
        sourceFactIds: [],
        roles: [],
        stackName: stack.name,
        categoryLabel: getCategory(stack.categoryId)?.name ?? stack.categoryId,
        sourceFactKinds: new Set<string>(),
      };
      usage.evidenceIds = [...new Set([...usage.evidenceIds, ...evidenceIds])];
      if (!usage.sourceFactIds.includes(fact.id)) usage.sourceFactIds.push(fact.id);
      usage.sourceFactKinds.add(fact.kind);
      const role = stackUsageRole(fact);
      if (role && !usage.roles.includes(role)) usage.roles.push(role);
      usageById.set(usageId, usage);
      scope.usageIds.add(usageId);
      usage.evidenceIds.forEach((evidenceId) => scope.evidenceIds.add(evidenceId));
    });
  });

  const orderedScopes = [...scopes.values()].sort((first, second) => {
    const rank: Record<StackMapScopeKind, number> = { root: 0, application: 1, workspace: 2, package: 3, desktop: 4, services: 5 };
    return rank[first.kind] - rank[second.kind] || first.path.localeCompare(second.path) || first.id.localeCompare(second.id);
  });
  const projectNode = projectFact ? nodeForFact(projectFact, 'stack-map:project') : undefined;
  const scopeNodes = orderedScopes.map((scope): AnalyzerViewNode => ({
    id: scope.nodeId,
    ...(scope.factId ? { factId: scope.factId } : {}),
    type: 'stack-scope',
    label: scope.kind === 'root' ? 'Project Root' : scope.kind === 'services' ? 'Project Services' : scope.path,
    subtitle: scope.label,
    clusterId: scope.clusterId,
    evidenceIds: [...scope.evidenceIds],
    metadata: {
      displayRole: 'SCOPE',
      stackMapScope: true,
      scopeId: scope.id,
      scopeLabel: scope.label,
      scopePath: scope.path,
      scopeKind: scope.kind,
      usageCount: scope.usageIds.size,
      ...(projectNode ? { stackMapParentId: projectNode.id } : {}),
    },
  }));
  const usageRecords = orderedScopes.flatMap((scope) => [...scope.usageIds]
    .map((usageId) => usageById.get(usageId))
    .filter((usage): usage is StackMapUsageRecord => Boolean(usage))
    .sort((first, second) => first.stackName.localeCompare(second.stackName)));
  const usageNodes = usageRecords.map((usage): AnalyzerViewNode => ({
    id: usage.id,
    factId: usage.sourceFactIds[0],
    type: 'stack-usage',
    label: usage.stackName,
    subtitle: usage.categoryLabel,
    clusterId: stackMapScopeClusterId(usage.scopeId),
    evidenceIds: usage.evidenceIds,
    metadata: {
      displayRole: 'STACK',
      stackUsage: true,
      stackId: usage.stackId,
      dictionaryStackId: usage.stackId,
      categoryId: getStack(usage.stackId)?.categoryId ?? '',
      categoryLabel: usage.categoryLabel,
      scopeId: usage.scopeId,
      scopeLabel: scopes.get(usage.scopeId)?.label ?? usage.scopeId,
      scopePath: scopes.get(usage.scopeId)?.path ?? '.',
      stackMapParentId: stackMapScopeNodeId(usage.scopeId),
      sourceFactIds: usage.sourceFactIds,
      sourceFactKinds: [...usage.sourceFactKinds],
      roles: usage.roles,
    },
  }));
  const nodes = [...(projectNode ? [projectNode] : []), ...scopeNodes, ...usageNodes];
  const edges: AnalyzerViewEdge[] = [];
  if (projectNode) {
    orderedScopes.forEach((scope) => {
      edges.push({
        id: `view-edge:stack-map:contains:${scope.id}`,
        sourceId: projectNode.id,
        targetId: scope.nodeId,
        kind: 'contains',
        label: relationLabels.contains,
        evidenceIds: [...scope.evidenceIds],
        metadata: { presentation: 'stack-map', scopeId: scope.id },
      });
    });
  }
  usageRecords.forEach((usage) => {
    edges.push({
      id: `view-edge:stack-map:uses:${usage.id}`,
      sourceId: stackMapScopeNodeId(usage.scopeId),
      targetId: usage.id,
      kind: 'uses',
      label: relationLabels.uses,
      evidenceIds: usage.evidenceIds,
      metadata: { presentation: 'stack-map', scopeId: usage.scopeId, stackId: usage.stackId },
    });
  });
  const clusterDefinitions: ReadonlyArray<readonly [string, string, AnalyzerCluster['tone']]> = [
    ...(projectNode ? [['stack-map:project', 'Project', 'neutral'] as const] : []),
    ...orderedScopes.map((scope) => [
      scope.clusterId,
      scope.label,
      scope.kind === 'application' ? 'accent' : scope.kind === 'desktop' ? 'violet' : scope.kind === 'services' ? 'cool' : 'neutral',
    ] as const),
  ];
  return {
    view: 'architecture',
    nodes,
    edges,
    clusters: clusterDefinitions.map(([id, label, tone]) => cluster(id, label, tone, nodes)).filter((entry) => entry.nodeIds.length > 0),
    stackUsages: usageRecords.map(({ id, stackId, scopeId, evidenceIds, sourceFactIds, roles }) => ({
      id,
      stackId,
      scopeId,
      evidenceIds,
      sourceFactIds,
      roles,
    })),
    evidence: store.evidence,
    warnings: baseWarnings(store, 'architecture'),
  };
}

/** Compatibility name for the `architecture` session/route ID. */
export function projectStackMap(store: AnalyzerProjectStore): AnalyzerViewModel {
  return buildStackMap(store);
}

export function projectArchitecture(store: AnalyzerProjectStore): AnalyzerViewModel {
  return buildStackMap(store);
}

export function projectWorkspace(store: AnalyzerProjectStore): AnalyzerViewModel {
  const nodes = store.facts
    .filter((fact) => ['project', 'workspace-config', 'workspace-pattern', 'workspace-package'].includes(fact.kind))
    .map((fact) => {
      const clusterId = fact.kind === 'project'
        ? 'workspace:project'
        : fact.kind === 'workspace-config'
          ? 'workspace:config'
          : fact.kind === 'workspace-pattern'
            ? 'workspace:patterns'
            : 'workspace:packages';
      return nodeForFact(fact, clusterId);
    });
  const edges = edgesForRelations(store, nodes, (relation) => ['uses-config', 'declares', 'matches'].includes(relation.kind));
  const warnings = baseWarnings(store, 'workspace');
  if (!store.facts.some((fact) => fact.kind === 'workspace-config')) {
    warnings.push({ id: 'workspace:no-config', message: 'No pnpm-workspace.yaml was detected', severity: 'warning', detectorId: 'workspace' });
  }
  const clusterDefinitions = [
    ['workspace:project', 'Project', 'neutral'],
    ['workspace:config', 'Workspace Config', 'cool'],
    ['workspace:patterns', 'Patterns', 'warm'],
    ['workspace:packages', 'Workspace Packages', 'accent'],
  ] as const;
  return {
    view: 'workspace',
    nodes,
    edges,
    clusters: clusterDefinitions.map(([id, label, tone]) => cluster(id, label, tone, nodes)).filter((entry) => entry.nodeIds.length > 0),
    evidence: store.evidence,
    warnings,
  };
}

function addCommandWarning(warnings: Map<string, AnalyzerWarning>, message: string, script: PackageScriptFact): void {
  const id = `command:${script.id}:${message}`;
  warnings.set(id, { id, message, severity: 'warning', filePath: script.sourcePath, detectorId: 'command-parser' });
}

function scriptFacts(store: AnalyzerProjectStore): PackageScriptFact[] {
  return store.facts.filter((fact): fact is PackageScriptFact => fact.kind === 'package-script');
}

function packageFacts(store: AnalyzerProjectStore): WorkspacePackageFact[] {
  return store.facts.filter((fact): fact is WorkspacePackageFact => fact.kind === 'workspace-package');
}

function resolveScriptFact(
  fragment: CommandFragment,
  sourceScript: PackageScriptFact,
  scripts: Map<string, PackageScriptFact>,
  packages: WorkspacePackageFact[],
): PackageScriptFact | undefined {
  if (!fragment.scriptName) return undefined;
  const selector = fragment.packageSelector;
  const packageFact = selector
    ? packages.find((candidate) => candidate.packageName === selector || candidate.packagePath === selector.replace(/^\.\//, '') || candidate.packagePath === selector)
    : packages.find((candidate) => candidate.id === sourceScript.packageId);
  if (!packageFact) return undefined;
  return scripts.get(scriptIdFor(packageFact.id, fragment.scriptName));
}

function evidenceForCommandFragment(store: AnalyzerProjectStore, script: PackageScriptFact, fragment: CommandFragment): string[] {
  const source = store.sources[script.sourcePath];
  if (!source) return script.evidenceIds;
  const range: OffsetRange = {
    start: script.commandStartOffset + fragment.start,
    end: script.commandStartOffset + fragment.end,
  };
  if (range.start < 0 || range.end > source.length) return script.evidenceIds;
  return [makeEvidence(script.sourcePath, source, range, 'script', 'command-fragment', `Command fragment ${fragment.text}`)].map((evidence) => evidence.id);
}

interface CommandExecutionContext {
  executionRank: number;
  executionDepth: number;
  branchPath: string;
  laneId?: string;
  laneLabel?: string;
}

function commandLaneMetadata(context: CommandExecutionContext): AnalyzerViewNode['metadata'] {
  return context.laneId
    ? { laneId: context.laneId, ...(context.laneLabel ? { laneLabel: context.laneLabel } : {}) }
    : {};
}

function commandBranchLabel(fragment: CommandFragment, index: number): string {
  const value = fragment.packageSelector?.replace(/^@[^/]+\//, '') ?? fragment.scriptName ?? fragment.toolName ?? `Branch ${index + 1}`;
  return value.toUpperCase();
}

function commandNode(
  id: string,
  fragment: CommandFragment,
  evidenceIds: string[],
  packageId?: string,
  executionRank = 0,
  executionDepth = 0,
  branchPath = 'root',
  laneId?: string,
  laneLabel?: string,
): AnalyzerViewNode {
  const fact: CommandFact = {
    id,
    kind: 'command',
    label: fragment.text,
    evidenceIds,
    metadata: {
      commandType: fragment.kind,
      ...(fragment.operator ? { operator: fragment.operator } : {}),
      ...(fragment.packageSelector ? { packageSelector: fragment.packageSelector } : {}),
      ...(fragment.scriptName ? { scriptName: fragment.scriptName } : {}),
      executionRank,
      executionDepth,
      branchPath,
      ...(laneId ? { laneId } : {}),
      ...(laneLabel ? { laneLabel } : {}),
    },
    commandType: fragment.kind,
    command: fragment.text,
    ...(packageId ? { packageId } : {}),
    ...(fragment.scriptName ? { scriptName: fragment.scriptName } : {}),
  };
  return nodeForFact(fact, 'command:commands');
}

function addViewEdge(edges: Map<string, AnalyzerViewEdge>, edge: AnalyzerViewEdge): void {
  edges.set(edge.id, edge);
}

function terminalTechnologyId(fragment: CommandFragment, store: AnalyzerProjectStore, sourceScript: PackageScriptFact): string | undefined {
  const tool = fragment.toolName?.toLowerCase();
  if (!tool) return undefined;
  const tech = store.facts.find((fact) => fact.kind === 'technology' && fact.packageNames.some((name) => name.toLowerCase() === tool));
  if (tech) return tech.id;
  if (tool === 'wrangler') {
    return store.facts.find((fact) => fact.kind === 'runtime' && fact.packageId === sourceScript.packageId && fact.runtimeType === 'cloudflare-workers')?.id;
  }
  if (tool === 'firebase') return store.facts.find((fact) => fact.kind === 'technology' && fact.id === 'technology:firebase')?.id;
  return undefined;
}

export function projectCommand(store: AnalyzerProjectStore, requestedEntryScriptId?: string): AnalyzerViewModel {
  const allScripts = scriptFacts(store);
  const packages = packageFacts(store);
  const scripts = new Map(allScripts.map((script) => [script.id, script]));
  const rootPackage = packages.find((fact) => fact.isRoot);
  const rootScripts = allScripts.filter((script) => script.packageId === rootPackage?.id);
  const defaultEntry = rootScripts.find((script) => script.scriptName === 'dev') ?? rootScripts[0] ?? allScripts[0];
  const entry = (requestedEntryScriptId ? scripts.get(requestedEntryScriptId) : undefined) ?? defaultEntry;
  const nodes = new Map<string, AnalyzerViewNode>();
  const edges = new Map<string, AnalyzerViewEdge>();
  const warnings = new Map<string, AnalyzerWarning>();
  const generatedEvidence = new Map(store.evidence.map((evidence) => [evidence.id, evidence]));
  const visited = new Set<string>();
  const active = new Set<string>();

  const addFactNode = (fact: AnalyzerFact, clusterId: string, typeOverride?: AnalyzerNodeType, context?: CommandExecutionContext) => {
    const nextNode = nodeForFact(fact, clusterId, typeOverride);
    if (!context) {
      nodes.set(fact.id, nextNode);
      return;
    }
    const currentNode = nodes.get(fact.id);
    const currentRank = currentNode?.metadata.executionRank;
    if (typeof currentRank === 'number' && currentRank <= context.executionRank) return;
    nodes.set(fact.id, {
      ...(currentNode ?? nextNode),
      metadata: {
        ...(currentNode?.metadata ?? nextNode.metadata),
        executionRank: context.executionRank,
        executionDepth: context.executionDepth,
        branchPath: context.branchPath,
        ...commandLaneMetadata(context),
      },
    });
  };
  const addFragment = (script: PackageScriptFact, fragment: CommandFragment, parentCommandId: string | undefined, context: CommandExecutionContext): void => {
    const evidenceIds = evidenceForCommandFragment(store, script, fragment);
    evidenceIds.forEach((evidenceId) => {
      if (!generatedEvidence.has(evidenceId) && store.sources[script.sourcePath]) {
        const range: OffsetRange = { start: script.commandStartOffset + fragment.start, end: script.commandStartOffset + fragment.end };
        generatedEvidence.set(evidenceId, makeEvidence(script.sourcePath, store.sources[script.sourcePath], range, 'script', 'command-fragment', `Command fragment ${fragment.text}`));
      }
    });
    const commandId = `command:${script.id}:${fragment.start}:${fragment.kind}${parentCommandId ? `:child:${parentCommandId}` : ''}`;
    nodes.set(commandId, commandNode(commandId, fragment, evidenceIds, script.packageId, context.executionRank, context.executionDepth, context.branchPath, context.laneId, context.laneLabel));
    addViewEdge(edges, {
      id: `view-edge:${script.id}:${commandId}`,
      sourceId: script.id,
      targetId: commandId,
      kind: 'expands-to',
      label: relationLabels['expands-to'],
      evidenceIds,
      metadata: {
        ...(fragment.operator ? { operator: fragment.operator } : {}),
        executionRank: context.executionRank,
        branchPath: context.branchPath,
      },
    });
    if (parentCommandId) {
      addViewEdge(edges, {
        id: `view-edge:${parentCommandId}:${commandId}:starts`,
        sourceId: parentCommandId,
        targetId: commandId,
        kind: 'starts',
        label: relationLabels.starts,
        evidenceIds,
        metadata: { parallel: true, executionRank: context.executionRank, branchPath: context.branchPath },
      });
    }

    if (fragment.kind === 'concurrently') {
      if (fragment.children.length === 0) addCommandWarning(warnings, 'concurrently has no quoted command branches', script);
      fragment.children.forEach((child, index) => addFragment(script, child, commandId, {
        executionRank: context.executionRank + 1,
        executionDepth: context.executionDepth + 1,
        branchPath: `${context.branchPath}.${index + 1}`,
        ...(context.laneId && context.laneId !== ANALYZER_COMMAND_COMMON_LANE_ID
          ? { laneId: context.laneId, ...(context.laneLabel ? { laneLabel: context.laneLabel } : {}) }
          : { laneId: `command-lane:${commandId}:${index + 1}`, laneLabel: commandBranchLabel(child, index) }),
      }));
      return;
    }
    if (fragment.kind === 'pnpm-script') {
      const targetScript = resolveScriptFact(fragment, script, scripts, packages);
      if (!targetScript) {
        addCommandWarning(warnings, `Could not resolve pnpm script: ${fragment.text}`, script);
        return;
      }
      addViewEdge(edges, {
        id: `view-edge:${commandId}:${targetScript.id}:resolves-to`,
        sourceId: commandId,
        targetId: targetScript.id,
        kind: 'resolves-to',
        label: relationLabels['resolves-to'],
        evidenceIds,
        metadata: {
          ...(fragment.packageSelector ? { packageSelector: fragment.packageSelector } : {}),
          scriptName: targetScript.scriptName,
        },
      });
      buildScript(targetScript, {
        executionRank: context.executionRank + 1,
        executionDepth: context.executionDepth + 1,
        branchPath: context.branchPath,
        ...commandLaneMetadata(context),
      });
      return;
    }
    if (fragment.kind === 'unknown') {
      addCommandWarning(warnings, `Unknown command fragment retained: ${fragment.text}`, script);
      return;
    }
    const terminalId = terminalTechnologyId(fragment, store, script);
    if (terminalId) {
      const terminalFact = store.facts.find((fact) => fact.id === terminalId);
      if (terminalFact) {
        addFactNode(terminalFact, 'command:commands', undefined, {
          executionRank: context.executionRank + 1,
          executionDepth: context.executionDepth + 1,
          branchPath: context.branchPath,
          ...commandLaneMetadata(context),
        });
      }
      addViewEdge(edges, {
        id: `view-edge:${commandId}:${terminalId}:starts`,
        sourceId: commandId,
        targetId: terminalId,
        kind: 'starts',
        label: relationLabels.starts,
        evidenceIds,
        metadata: { terminal: true, executionRank: context.executionRank + 1, branchPath: context.branchPath },
      });
    }
  };

  const buildScript = (script: PackageScriptFact, context: CommandExecutionContext): void => {
    if (active.has(script.id)) {
      addCommandWarning(warnings, `Command cycle detected at ${script.packageName}:${script.scriptName}`, script);
      return;
    }
    if (visited.has(script.id)) return;
    visited.add(script.id);
    active.add(script.id);
    addFactNode(script, 'command:scripts', undefined, context);
    parseCommandExpression(script.command).forEach((fragment, index) => addFragment(script, fragment, undefined, {
      executionRank: context.executionRank + 1 + index,
      executionDepth: context.executionDepth + 1,
      branchPath: `${context.branchPath}.${index + 1}`,
      ...commandLaneMetadata(context),
    }));
    active.delete(script.id);
  };

  if (entry) {
    const entryNode: AnalyzerViewNode = {
      id: `user-command:${entry.id}`,
      type: 'command',
      label: `pnpm run ${entry.scriptName}`,
      subtitle: entry.packageName,
      clusterId: 'command:user',
      evidenceIds: entry.evidenceIds,
      metadata: { commandType: 'user-command', scriptId: entry.id, packagePath: entry.packagePath, packageName: entry.packageName, executionRank: 0, executionDepth: 0, branchPath: 'root', laneId: ANALYZER_COMMAND_COMMON_LANE_ID, laneLabel: 'COMMON' },
    };
    nodes.set(entryNode.id, entryNode);
    addViewEdge(edges, {
      id: `view-edge:${entryNode.id}:${entry.id}:resolves-to`,
      sourceId: entryNode.id,
      targetId: entry.id,
      kind: 'resolves-to',
      label: relationLabels['resolves-to'],
      evidenceIds: entry.evidenceIds,
      metadata: { entry: true },
    });
    buildScript(entry, { executionRank: 1, executionDepth: 1, branchPath: 'root', laneId: ANALYZER_COMMAND_COMMON_LANE_ID, laneLabel: 'COMMON' });
  }

  const rawNodeList = [...nodes.values()];
  const laneGroups = new Map<string, AnalyzerViewNode[]>();
  rawNodeList.forEach((node) => {
    const laneId = node.metadata.laneId;
    if (typeof laneId !== 'string') return;
    const laneNodes = laneGroups.get(laneId) ?? [];
    laneNodes.push(node);
    laneGroups.set(laneId, laneNodes);
  });
  const laneSummaries = [...laneGroups.entries()]
    .filter(([laneId]) => laneId !== ANALYZER_COMMAND_COMMON_LANE_ID)
    .map(([laneId, laneNodes]) => {
    const laneLabel = laneNodes.find((node) => typeof node.metadata.laneLabel === 'string')?.metadata.laneLabel;
    const executionRank = Math.min(...laneNodes.map((node) => typeof node.metadata.executionRank === 'number' ? node.metadata.executionRank : Number.MAX_SAFE_INTEGER));
    const summary = summaryNode(
      `command:lane:${laneId}`,
      typeof laneLabel === 'string' ? laneLabel : laneId,
      `${laneNodes.length} steps · expand for details`,
      'command',
      'command:commands',
      laneNodes,
    );
    return {
      ...summary,
      metadata: {
        ...summary.metadata,
        commandType: 'branch-summary',
        laneId,
        ...(typeof laneLabel === 'string' ? { laneLabel } : {}),
        stepCount: laneNodes.length,
        executionRank,
        branchPath: `lane:${laneId}`,
      },
    };
    });
  const summaryIdByLane = new Map(laneSummaries.flatMap((summary) => {
    const laneId = summary.metadata.laneId;
    return typeof laneId === 'string' ? [[laneId, summary.id] as const] : [];
  }));
  const presentedNodeList = rawNodeList.map((node) => {
    const laneId = node.metadata.laneId;
    const parentId = typeof laneId === 'string' ? summaryIdByLane.get(laneId) : undefined;
    return parentId ? { ...node, presentation: { role: 'detail' as const, parentId } } : node;
  });
  const nodeList = [...presentedNodeList, ...laneSummaries];
  const clusterDefinitions = [
    ['command:user', 'User Command', 'warm'],
    ['command:scripts', 'Package Scripts', 'accent'],
    ['command:commands', 'Commands / CLI', 'cool'],
  ] as const;
  if (!entry) warnings.set('command:no-entry', { id: 'command:no-entry', message: 'No package script is available for Command Flow', severity: 'warning', detectorId: 'command' });
  return {
    view: 'command',
    nodes: nodeList,
    edges: [...edges.values()],
    clusters: clusterDefinitions.map(([id, label, tone]) => cluster(id, label, tone, nodeList)).filter((entry) => entry.nodeIds.length > 0),
    evidence: [...generatedEvidence.values()],
    warnings: [...baseWarnings(store, 'command'), ...warnings.values()],
    ...(entry ? { entryScriptId: entry.id } : {}),
  };
}

export function projectDependencies(store: AnalyzerProjectStore): AnalyzerViewModel {
  const dependencyTargetIds = new Set(store.relations.filter((relation) => relation.kind === 'depends-on').map((relation) => relation.targetId));
  const baseNodes = store.facts
    .filter((fact) => fact.kind === 'workspace-package' || (['technology', 'external-package'].includes(fact.kind) && dependencyTargetIds.has(fact.id)))
    .map((fact) => nodeForFact(
      fact,
      fact.kind === 'workspace-package' ? 'dependencies:packages' : fact.kind === 'technology' ? 'dependencies:technology' : 'dependencies:external',
      fact.kind === 'technology' ? 'technology' : undefined,
    ));
  const externalNodes = baseNodes.filter((node) => node.type === 'external-package');
  const externalSummaryId = ANALYZER_EXTERNAL_SUMMARY_ID;
  const dependencyEdges = edgesForRelations(store, baseNodes, (relation) => relation.kind === 'depends-on');
  const externalDependencyEdges = dependencyEdges.filter((edge) => externalNodes.some((node) => node.id === edge.targetId));
  const sourceIdsByExternalId = new Map<string, string[]>();
  externalDependencyEdges.forEach((edge) => {
    const sourceIds = sourceIdsByExternalId.get(edge.targetId) ?? [];
    if (!sourceIds.includes(edge.sourceId)) sourceIds.push(edge.sourceId);
    sourceIdsByExternalId.set(edge.targetId, sourceIds);
  });
  const sourceGroupKeyByExternalId = new Map<string, string>();
  const sourceGroups = new Map<string, { label: string; sourceIds: string[]; nodes: AnalyzerViewNode[] }>();
  externalNodes.forEach((node) => {
    const sourceIds = [...(sourceIdsByExternalId.get(node.id) ?? [])].sort();
    const groupKey = sourceIds.length > 1 ? 'shared' : sourceIds[0] ?? 'unlinked';
    const sourceLabels = sourceIds.map((sourceId) => baseNodes.find((candidate) => candidate.id === sourceId)?.label ?? sourceId);
    const label = sourceIds.length > 1
      ? 'Shared External'
      : sourceLabels[0]
        ? `${sourceLabels[0]} Dependencies`
        : 'Other External';
    const group = sourceGroups.get(groupKey) ?? { label, sourceIds: [], nodes: [] };
    sourceIds.forEach((sourceId) => {
      if (!group.sourceIds.includes(sourceId)) group.sourceIds.push(sourceId);
    });
    group.nodes.push(node);
    sourceGroups.set(groupKey, group);
    sourceGroupKeyByExternalId.set(node.id, groupKey);
  });
  const externalSourceIds = new Set([...sourceIdsByExternalId.values()].flat());
  const hasSingleExternalSource = externalSourceIds.size <= 1;
  const sourceSummaryId = (groupKey: string) => `dependencies:external:source:${groupKey}`;
  const groupedSourceSummaries = [...sourceGroups.entries()]
    .sort(([firstKey, first], [secondKey, second]) => {
      if (firstKey === 'shared') return -1;
      if (secondKey === 'shared') return 1;
      return first.label.localeCompare(second.label);
    })
    .map(([groupKey, group]) => {
      const summary = summaryNode(
        sourceSummaryId(groupKey),
        group.label,
        `${group.nodes.length} packages`,
        'external-package',
        'dependencies:external',
        group.nodes,
      );
      return {
        ...summary,
        metadata: {
          ...summary.metadata,
          displayRole: 'EXTERNAL SOURCE',
          externalGroupId: groupKey,
          externalGroupLabel: group.label,
          externalGroupPresentationId: sourceSummaryId(groupKey),
          externalSourceIds: [...group.sourceIds],
          packageCount: group.nodes.length,
        },
        presentation: {
          ...summary.presentation,
          parentId: externalSummaryId,
        },
      };
    });
  const sourceGroupSummaries = hasSingleExternalSource ? [] : groupedSourceSummaries;
  const externalDetailNodes = externalNodes.map((node) => {
    const groupKey = sourceGroupKeyByExternalId.get(node.id) ?? 'unlinked';
    const group = sourceGroups.get(groupKey);
    const parentId = hasSingleExternalSource ? externalSummaryId : sourceSummaryId(groupKey);
    return {
      ...node,
      metadata: {
        ...node.metadata,
        externalGroupId: groupKey,
        externalGroupLabel: group?.label ?? 'Other External',
        externalGroupPresentationId: parentId,
        externalSourceIds: [...(group?.sourceIds ?? [])],
      },
      presentation: { role: 'detail' as const, parentId },
    };
  });
  const externalSummaryChildren = hasSingleExternalSource ? externalDetailNodes : sourceGroupSummaries;
  const externalSummaryBase = summaryNode(externalSummaryId, 'External Packages', `${externalNodes.length} packages`, 'external-package', 'dependencies:external', externalSummaryChildren);
  const externalSummary = {
    ...externalSummaryBase,
    metadata: {
      ...externalSummaryBase.metadata,
      childCount: externalNodes.length,
      packageCount: externalNodes.length,
      groupCount: groupedSourceSummaries.length,
      ...(hasSingleExternalSource ? { externalLayoutMode: 'flat' } : {}),
    },
  };
  const nodes = externalNodes.length > 0
    ? [
        ...baseNodes.filter((node) => node.type !== 'external-package'),
        ...externalDetailNodes,
        ...sourceGroupSummaries,
        externalSummary,
      ]
    : baseNodes;
  const childEdges = externalDependencyEdges.map((edge) => {
    const groupKey = sourceGroupKeyByExternalId.get(edge.targetId) ?? 'unlinked';
    return {
      ...edge,
      presentation: { parentId: hasSingleExternalSource ? externalSummaryId : sourceSummaryId(groupKey), initiallyHidden: true },
    };
  });
  const externalEdgesBySourceAndGroup = new Map<string, AnalyzerViewEdge[]>();
  externalDependencyEdges.forEach((edge) => {
    const groupKey = sourceGroupKeyByExternalId.get(edge.targetId) ?? 'unlinked';
    const key = `${edge.sourceId}\u0000${groupKey}`;
    const sourceEdges = externalEdgesBySourceAndGroup.get(key) ?? [];
    sourceEdges.push(edge);
    externalEdgesBySourceAndGroup.set(key, sourceEdges);
  });
  const bundleEdges = [...externalEdgesBySourceAndGroup.entries()].map(([key, sourceEdges]) => {
    const [sourceId, groupKey] = key.split('\u0000');
    const targetSummaryId = hasSingleExternalSource ? externalSummaryId : sourceSummaryId(groupKey ?? 'unlinked');
    return {
      id: `view-edge:external-bundle:${sourceId}:${groupKey}`,
      sourceId,
      targetId: targetSummaryId,
      kind: 'depends-on' as const,
      label: `${sourceEdges.length} external ${sourceEdges.length === 1 ? 'dependency' : 'dependencies'}`,
      evidenceIds: [...new Set(sourceEdges.flatMap((edge) => edge.evidenceIds))],
      metadata: {
        presentation: 'bundle',
        dependencyCount: sourceEdges.length,
        externalGroupId: groupKey,
      },
      presentation: { displayKind: 'bundle' as const, parentId: targetSummaryId },
    };
  });
  const edges = externalNodes.length > 0
    ? [...dependencyEdges.filter((edge) => !externalNodes.some((node) => node.id === edge.targetId)), ...childEdges, ...bundleEdges]
    : dependencyEdges;
  const warnings = baseWarnings(store, 'dependencies');
  const clusterDefinitions = [
    ['dependencies:packages', 'Workspace Packages', 'neutral'],
    ['dependencies:technology', 'Recognized Technology', 'accent'],
    ['dependencies:external', `External Packages · ${externalNodes.length}`, 'cool'],
  ] as const;
  return {
    view: 'dependencies',
    nodes,
    edges,
    clusters: clusterDefinitions.map(([id, label, tone]) => cluster(id, label, tone, nodes)).filter((entry) => entry.nodeIds.length > 0),
    evidence: store.evidence,
    warnings,
  };
}

export function projectAnalyzerView(store: AnalyzerProjectStore, view: AnalyzerViewModel['view'], entryScriptId?: string): AnalyzerViewModel {
  if (view === 'architecture') return projectArchitecture(store);
  if (view === 'workspace') return projectWorkspace(store);
  if (view === 'command') return projectCommand(store, entryScriptId);
  return projectDependencies(store);
}

export function factDictionaryStackId(fact: AnalyzerFact | AnalyzerViewNode | undefined): string | undefined {
  if (!fact) return undefined;
  if ('kind' in fact && fact.kind === 'technology') return fact.dictionaryStackId;
  if ('kind' in fact && fact.kind === 'resource') return fact.dictionaryStackId;
  const value = fact.metadata.dictionaryStackId;
  return typeof value === 'string' ? value : undefined;
}

export function factForNode(store: AnalyzerProjectStore, node: AnalyzerViewNode): AnalyzerFact | undefined {
  return store.facts.find((fact) => fact.id === (node.factId ?? node.id));
}

export function viewTitle(view: AnalyzerViewModel['view']): string {
  return analyzerViewLabels[view];
}

export function viewNodeSearchText(node: AnalyzerViewNode): string {
  return [node.label, node.subtitle, ...Object.values(node.metadata).flatMap((value) => Array.isArray(value) ? value : value === undefined ? [] : [String(value)])]
    .join(' ')
    .toLowerCase();
}

export function displayDictionaryStack(stackId: string | undefined): { name: string; id: string } | undefined {
  if (!stackId) return undefined;
  const stack = getStack(stackId);
  return stack ? { name: stack.name, id: stack.id } : undefined;
}
