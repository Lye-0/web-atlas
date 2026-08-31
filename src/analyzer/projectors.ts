import { getStack } from '../data';
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
  type AnalyzerViewEdge,
  type AnalyzerViewModel,
  type AnalyzerViewNode,
  type AnalyzerWarning,
  type CommandFact,
  type PackageScriptFact,
  type WorkspacePackageFact,
} from './types';

function nodeSubtitle(fact: AnalyzerFact): string | undefined {
  if (fact.kind === 'project') return 'Selected local project folder';
  if (fact.kind === 'workspace-package') return fact.packagePath === '.' ? 'root package · workspace root' : fact.packagePath;
  if (fact.kind === 'workspace-config') return fact.filePath;
  if (fact.kind === 'workspace-pattern') return fact.configId;
  if (fact.kind === 'package-script') return `${fact.packageName} · ${fact.command}`;
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
    presentation: { role: 'summary', childNodeIds },
  };
}

function markPresentationChildren(nodes: AnalyzerViewNode[], parentId: string, childIds: ReadonlySet<string>): AnalyzerViewNode[] {
  return nodes.map((node) => childIds.has(node.id)
    ? { ...node, presentation: { role: 'detail', parentId } }
    : node);
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

function architectureCluster(fact: AnalyzerFact): { id: string; label: string; tone: AnalyzerCluster['tone']; type?: AnalyzerNodeType } {
  if (fact.kind === 'project') return { id: 'architecture:project', label: 'Project', tone: 'neutral' };
  if (fact.kind === 'workspace-package') {
    if (fact.packagePath.startsWith('apps/')) return { id: 'architecture:apps', label: 'Applications', tone: 'accent', type: 'application' };
    return { id: 'architecture:workspace', label: 'Shared Workspace', tone: 'neutral' };
  }
  if (fact.kind === 'technology') return { id: 'architecture:technology', label: 'Technologies', tone: 'accent' };
  if (fact.kind === 'runtime') return { id: 'architecture:runtime', label: 'Runtime / Platform', tone: 'cool' };
  if (fact.kind === 'resource') return { id: 'architecture:resources', label: 'Resources', tone: 'cool' };
  return { id: 'architecture:desktop', label: 'Desktop', tone: 'violet' };
}

const ARCHITECTURE_PRIMARY_TECHNOLOGY_CATEGORIES = new Set([
  'programming-language',
  'runtime',
  'fullstack-web-framework',
  'web-api-framework',
  'ui-library',
  'auth-framework',
  'auth-library',
  'auth-service',
  'build-tool',
  'relational-database',
  'document-database',
  'object-database',
  'object-storage',
  'serverless-runtime',
  'application-platform',
  'web-hosting',
]);

function isPrimaryArchitectureTechnology(fact: AnalyzerFact | undefined): boolean {
  if (!fact || fact.kind !== 'technology') return false;
  if (!fact.dictionaryStackId) return fact.explicit;
  return ARCHITECTURE_PRIMARY_TECHNOLOGY_CATEGORIES.has(getStack(fact.dictionaryStackId)?.categoryId ?? '');
}

export function projectArchitecture(store: AnalyzerProjectStore): AnalyzerViewModel {
  const baseNodes = store.facts
    .filter((fact) => ['project', 'workspace-package', 'technology', 'runtime', 'resource', 'dotnet-project'].includes(fact.kind))
    .map((fact) => {
      const placement = architectureCluster(fact);
      return nodeForFact(fact, placement.id, placement.type);
    });
  const desktopDetails = baseNodes.filter((node) => node.type === 'dotnet-project');
  const technologyDetails = baseNodes.filter((node) => node.type === 'technology' && !isPrimaryArchitectureTechnology(store.facts.find((fact) => fact.id === node.factId)));
  const desktopSummaryId = 'architecture:desktop:summary';
  const technologySummaryId = 'architecture:technology:summary';
  const nodesWithDesktopSummary = desktopDetails.length > 0
    ? [
        ...markPresentationChildren(baseNodes, desktopSummaryId, new Set(desktopDetails.map((node) => node.id))),
        summaryNode(desktopSummaryId, '.NET / WPF', `${desktopDetails.length} projects · expand for details`, 'dotnet-project', 'architecture:desktop', desktopDetails),
      ]
    : baseNodes;
  const nodes = technologyDetails.length > 0
    ? [
        ...markPresentationChildren(nodesWithDesktopSummary, technologySummaryId, new Set(technologyDetails.map((node) => node.id))),
        summaryNode(technologySummaryId, 'Technology details', `${technologyDetails.length} additional technologies`, 'technology', 'architecture:technology', technologyDetails),
      ]
    : nodesWithDesktopSummary;
  const architectureEdges = edgesForRelations(
    store,
    baseNodes,
    (relation) => ['contains', 'uses', 'binds-to', 'depends-on'].includes(relation.kind),
    (relation) => relation.kind === 'depends-on' ? 'uses' : relation.kind,
  );
  const technologyDetailEdges = architectureEdges.filter((edge) => technologyDetails.some((node) => node.id === edge.targetId));
  const technologyEdgesBySource = new Map<string, AnalyzerViewEdge[]>();
  technologyDetailEdges.forEach((edge) => {
    const sourceEdges = technologyEdgesBySource.get(edge.sourceId) ?? [];
    sourceEdges.push(edge);
    technologyEdgesBySource.set(edge.sourceId, sourceEdges);
  });
  const technologyBundleEdges = technologyEdgesBySource.size > 0
    ? [...technologyEdgesBySource.entries()].map(([sourceId, sourceEdges]) => ({
        id: `view-edge:architecture-technology-bundle:${sourceId}`,
        sourceId,
        targetId: technologySummaryId,
        kind: 'uses' as const,
        label: `${sourceEdges.length} additional ${sourceEdges.length === 1 ? 'technology' : 'technologies'}`,
        evidenceIds: [...new Set(sourceEdges.flatMap((edge) => edge.evidenceIds))],
        metadata: { presentation: 'bundle', technologyCount: sourceEdges.length },
        presentation: { displayKind: 'bundle' as const, parentId: technologySummaryId },
      }))
    : [];
  const edges = architectureEdges.map((edge) => technologyDetails.some((node) => node.id === edge.targetId)
    ? { ...edge, presentation: { parentId: technologySummaryId, initiallyHidden: true } }
    : edge).concat(technologyBundleEdges);
  const clusterDefinitions = [
    ['architecture:project', 'Project', 'neutral'],
    ['architecture:apps', 'Applications', 'accent'],
    ['architecture:workspace', 'Shared Workspace', 'neutral'],
    ['architecture:technology', 'Technologies', 'accent'],
    ['architecture:runtime', 'Runtime / Platform', 'cool'],
    ['architecture:resources', 'Resources', 'cool'],
    ['architecture:desktop', 'Desktop', 'violet'],
  ] as const;
  const clusters = clusterDefinitions.map(([id, label, tone]) => cluster(id, label, tone, nodes)).filter((entry) => entry.nodeIds.length > 0);
  return {
    view: 'architecture',
    nodes,
    edges,
    clusters,
    evidence: store.evidence,
    warnings: baseWarnings(store, 'architecture'),
  };
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

function commandNode(
  id: string,
  fragment: CommandFragment,
  evidenceIds: string[],
  packageId?: string,
  executionRank = 0,
  executionDepth = 0,
  branchPath = 'root',
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
    },
    commandType: fragment.kind,
    command: fragment.text,
    ...(packageId ? { packageId } : {}),
    ...(fragment.scriptName ? { scriptName: fragment.scriptName } : {}),
  };
  return nodeForFact(fact, 'command:commands');
}

interface CommandExecutionContext {
  executionRank: number;
  executionDepth: number;
  branchPath: string;
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
    nodes.set(commandId, commandNode(commandId, fragment, evidenceIds, script.packageId, context.executionRank, context.executionDepth, context.branchPath));
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
    const packageFact = packages.find((fact) => fact.id === script.packageId);
    if (packageFact) {
      addFactNode(packageFact, 'command:packages', undefined, context);
    }
    parseCommandExpression(script.command).forEach((fragment, index) => addFragment(script, fragment, undefined, {
      executionRank: context.executionRank + 1 + index,
      executionDepth: context.executionDepth + 1,
      branchPath: `${context.branchPath}.${index + 1}`,
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
      metadata: { commandType: 'user-command', scriptId: entry.id, executionRank: 0, executionDepth: 0, branchPath: 'root' },
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
    buildScript(entry, { executionRank: 1, executionDepth: 1, branchPath: 'root' });
  }

  const nodeList = [...nodes.values()];
  const clusterDefinitions = [
    ['command:user', 'User Command', 'warm'],
    ['command:scripts', 'Package Scripts', 'accent'],
    ['command:commands', 'Commands / CLI', 'cool'],
    ['command:packages', 'Workspace Packages', 'neutral'],
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
  const externalSummaryId = 'dependencies:external:summary';
  const nodes = externalNodes.length > 0
    ? [
        ...markPresentationChildren(baseNodes, externalSummaryId, new Set(externalNodes.map((node) => node.id))),
        summaryNode(externalSummaryId, 'External Packages', `${externalNodes.length} packages · expand for details`, 'external-package', 'dependencies:external', externalNodes),
      ]
    : baseNodes;
  const dependencyEdges = edgesForRelations(store, baseNodes, (relation) => relation.kind === 'depends-on');
  const externalDependencyEdges = dependencyEdges.filter((edge) => externalNodes.some((node) => node.id === edge.targetId));
  const externalEdgesBySource = new Map<string, AnalyzerViewEdge[]>();
  externalDependencyEdges.forEach((edge) => {
    const sourceEdges = externalEdgesBySource.get(edge.sourceId) ?? [];
    sourceEdges.push(edge);
    externalEdgesBySource.set(edge.sourceId, sourceEdges);
  });
  const childEdges = externalDependencyEdges.map((edge) => ({
    ...edge,
    presentation: { parentId: externalSummaryId, initiallyHidden: true },
  }));
  const bundleEdges = externalEdgesBySource.size > 0
    ? [...externalEdgesBySource.entries()].map(([sourceId, sourceEdges]) => ({
        id: `view-edge:external-bundle:${sourceId}`,
        sourceId,
        targetId: externalSummaryId,
        kind: 'depends-on' as const,
        label: `${sourceEdges.length} external ${sourceEdges.length === 1 ? 'dependency' : 'dependencies'}`,
        evidenceIds: [...new Set(sourceEdges.flatMap((edge) => edge.evidenceIds))],
        metadata: {
          presentation: 'bundle',
          dependencyCount: sourceEdges.length,
        },
        presentation: { displayKind: 'bundle' as const, parentId: externalSummaryId },
      }))
    : [];
  const edges = externalNodes.length > 0
    ? [...dependencyEdges.filter((edge) => !externalNodes.some((node) => node.id === edge.targetId)), ...childEdges, ...bundleEdges]
    : dependencyEdges;
  const warnings = baseWarnings(store, 'dependencies');
  const clusterDefinitions = [
    ['dependencies:packages', 'Workspace Packages', 'neutral'],
    ['dependencies:technology', 'Recognized Technology', 'accent'],
    ['dependencies:external', 'External Packages', 'cool'],
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
