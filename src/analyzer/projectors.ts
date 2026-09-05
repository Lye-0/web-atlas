import { getCategory, getStack } from '../data';
import { makeEvidence, type OffsetRange } from './evidence';
import { parseCommandExpression, type CommandFragment } from './commandParser';
import { commandTerminalTarget } from './commandTargets';
import {
  analyzerViewLabels,
  nodeTypeLabels,
  relationLabels,
  scriptIdFor,
  type AnalyzerCluster,
  type AnalyzerEvidence,
  type AnalyzerEvidenceRole,
  type AnalyzerFact,
  type AnalyzerNodeType,
  type AnalyzerProjectStore,
  type AnalyzerRelation,
  type AnalyzerSemanticRegion,
  type AnalyzerScopeEvidenceStrength,
  type AnalyzerStackUsage,
  type AnalyzerViewEdge,
  type AnalyzerViewModel,
  type AnalyzerViewNode,
  type AnalyzerWarning,
  type CommandFact,
  type ModuleDirectoryFact,
  type ModuleFact,
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
  const inferredType: AnalyzerNodeType = fact.kind === 'package-manifest'
    ? 'application'
    : fact.kind === 'module'
      ? 'module'
      : fact.kind === 'module-dependency' || fact.kind === 'module-directory'
        ? 'project'
        : fact.kind;
  const type: AnalyzerNodeType = typeOverride ?? inferredType;
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
type StackMapScopeSource = 'root' | 'services' | 'package' | 'workspace' | 'runtime' | 'config' | 'solution' | 'standalone';

interface StackMapScopeCandidate {
  id: string;
  path: string;
  kind: StackMapScopeKind;
  label: string;
  source: StackMapScopeSource;
  promotionStrength: Exclude<AnalyzerScopeEvidenceStrength, 'usage-only'>;
  factId?: string;
  evidenceIds: string[];
}

interface StackMapScopeRecord {
  id: string;
  label: string;
  path: string;
  kind: StackMapScopeKind;
  promotionStrength: Exclude<AnalyzerScopeEvidenceStrength, 'usage-only'>;
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

export function stackMapScopeRegionId(scopeId: string, scopePath?: string): string {
  const normalizedPath = normalizeScopePath(scopePath ?? scopeId.replace(/^package:/, ''));
  return `region:scope:${normalizedPath === '.' ? scopeId : normalizedPath}`;
}

function normalizeScopePath(path: string): string {
  const normalized = path.replaceAll('\\', '/').replace(/^\.\/+/, '').replace(/\/+/g, '/');
  const parts = normalized.split('/').filter((part) => part && part !== '.');
  return parts.length > 0 ? parts.join('/') : '.';
}

function scopeDirectory(filePath: string): string {
  const normalized = normalizeScopePath(filePath);
  if (normalized === '.') return '.';
  const slash = normalized.lastIndexOf('/');
  return slash >= 0 ? normalizeScopePath(normalized.slice(0, slash)) : '.';
}

function scopePathAncestors(path: string): string[] {
  const ancestors: string[] = [];
  let current = normalizeScopePath(path);
  while (current !== '.') {
    ancestors.push(current);
    const slash = current.lastIndexOf('/');
    current = slash >= 0 ? normalizeScopePath(current.slice(0, slash)) : '.';
  }
  return ancestors;
}

function isHiddenScopePath(path: string): boolean {
  return normalizeScopePath(path).split('/').some((segment) => segment.startsWith('.'));
}

function humanizeScopeSegment(segment: string): string {
  return segment.replace(/[-_]+/g, ' ').trim().toUpperCase();
}

function packageScopeKind(packagePath: string): StackMapScopeKind {
  const normalizedPath = normalizeScopePath(packagePath);
  if (normalizedPath.startsWith('apps/')) return 'application';
  if (normalizedPath.startsWith('packages/')) return 'workspace';
  return 'package';
}

function packageScopeLabel(packagePath: string): string {
  const normalizedPath = normalizeScopePath(packagePath);
  const segments = normalizedPath.split('/').filter(Boolean);
  return humanizeScopeSegment(segments.at(-1) ?? normalizedPath);
}

function packageScopeId(packagePath: string): string {
  const normalizedPath = normalizeScopePath(packagePath);
  return normalizedPath === '.' ? 'root' : `package:${normalizedPath}`;
}

function serviceConfigPath(filePath: string): boolean {
  const name = normalizeScopePath(filePath).split('/').at(-1)?.toLowerCase();
  return name === 'wrangler.json'
    || name === 'wrangler.jsonc'
    || name === 'wrangler.toml'
    || name === 'firebase.json'
    || name === '.firebaserc';
}

function pathBelongsToPackage(filePath: string, packagePath: string): boolean {
  const normalizedFilePath = normalizeScopePath(filePath);
  const normalizedPackagePath = normalizeScopePath(packagePath);
  if (normalizedPackagePath === '.') return true;
  return normalizedFilePath === normalizedPackagePath || normalizedFilePath.startsWith(`${normalizedPackagePath}/`);
}

function scopeGlobToRegExp(pattern: string): RegExp {
  const normalized = normalizeScopePath(pattern.replace(/^!/, ''));
  let expression = '^';
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    if (character === '*' && normalized[index + 1] === '*') {
      expression += '.*';
      index += 1;
    } else if (character === '*') expression += '[^/]*';
    else if (character === '?') expression += '[^/]';
    else expression += character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`${expression}$`);
}

function scopeGlobMatches(path: string, pattern: string): boolean {
  return scopeGlobToRegExp(pattern).test(normalizeScopePath(path));
}

function workspacePatternRootForPath(directory: string, patterns: readonly string[]): string | undefined {
  const normalizedDirectory = normalizeScopePath(directory);
  if (normalizedDirectory === '.' || isHiddenScopePath(normalizedDirectory)) return undefined;
  const ancestors = scopePathAncestors(normalizedDirectory);
  const positivePatterns = patterns.filter((pattern) => !pattern.trim().startsWith('!'));
  const negativePatterns = patterns
    .filter((pattern) => pattern.trim().startsWith('!'))
    .map((pattern) => pattern.trim().slice(1));
  const candidates = positivePatterns.flatMap((pattern) => {
    const normalizedPattern = normalizeScopePath(pattern);
    const patternSegments = normalizedPattern.split('/').filter(Boolean);
    const wildcardIndex = patternSegments.findIndex((segment) => /[*?]/.test(segment));
    const expectedDepth = wildcardIndex >= 0 ? wildcardIndex + 1 : patternSegments.length;
    return ancestors
      .filter((candidate) => scopeGlobMatches(candidate, normalizedPattern))
      .map((candidate) => ({
        path: candidate,
        distance: Math.abs(candidate.split('/').length - expectedDepth),
        pattern: normalizedPattern,
      }));
  }).filter((candidate) => !negativePatterns.some((pattern) => scopeGlobMatches(candidate.path, pattern) || scopeGlobMatches(normalizedDirectory, pattern)));
  return candidates.sort((first, second) => first.distance - second.distance || second.path.length - first.path.length || first.pattern.localeCompare(second.pattern))[0]?.path;
}

function scopeCandidateId(path: string, source: StackMapScopeSource, kind: StackMapScopeKind): string {
  const normalizedPath = normalizeScopePath(path);
  if (normalizedPath === '.') return source === 'services' ? 'services' : 'root';
  if (source === 'package') return packageScopeId(normalizedPath);
  return kind === 'desktop' ? `desktop:${normalizedPath}` : `application:${normalizedPath}`;
}

function makeScopeCandidate(
  path: string,
  kind: StackMapScopeKind,
  source: StackMapScopeSource,
  factId?: string,
  evidenceIds: readonly string[] = [],
  promotionStrength: Exclude<AnalyzerScopeEvidenceStrength, 'usage-only'> = source === 'config' ? 'explicit-boundary' : 'structural',
): StackMapScopeCandidate {
  const normalizedPath = normalizeScopePath(path);
  return {
    id: scopeCandidateId(normalizedPath, source, kind),
    path: normalizedPath,
    kind,
    label: kind === 'desktop' ? 'DESKTOP' : normalizedPath === '.' ? source === 'services' ? 'PROJECT / SERVICES' : 'PROJECT / TOOLING' : packageScopeLabel(normalizedPath),
    source,
    promotionStrength,
    ...(factId ? { factId } : {}),
    evidenceIds: [...new Set(evidenceIds)],
  };
}

const stackMapScopeSourceRank: Record<StackMapScopeSource, number> = {
  root: 6,
  services: 6,
  package: 5,
  solution: 4,
  config: 3,
  runtime: 3,
  workspace: 2,
  standalone: 1,
};

function addScopeCandidate(candidates: Map<string, StackMapScopeCandidate>, candidate: StackMapScopeCandidate): void {
  if (candidate.path !== '.' && isHiddenScopePath(candidate.path)) return;
  const existing = candidates.get(candidate.path);
  if (!existing) {
    candidates.set(candidate.path, candidate);
    return;
  }
  const preferred = stackMapScopeSourceRank[candidate.source] > stackMapScopeSourceRank[existing.source] ? candidate : existing;
  const isDesktop = existing.kind === 'desktop' || candidate.kind === 'desktop';
  const hasPackageRoot = existing.source === 'package' || candidate.source === 'package';
  const kind = isDesktop ? 'desktop' : preferred.kind;
  const source = hasPackageRoot ? 'package' : preferred.source;
  const factId = existing.source === 'package'
    ? existing.factId ?? candidate.factId
    : candidate.source === 'package'
      ? candidate.factId ?? existing.factId
      : existing.factId ?? candidate.factId;
  candidates.set(candidate.path, {
    ...preferred,
    id: hasPackageRoot ? packageScopeId(candidate.path) : scopeCandidateId(candidate.path, source, kind),
    kind,
    label: kind === 'desktop' ? 'DESKTOP' : preferred.label,
    source,
    promotionStrength: existing.promotionStrength === 'explicit-boundary' || candidate.promotionStrength === 'explicit-boundary'
      ? 'explicit-boundary'
      : 'structural',
    ...(factId ? { factId } : {}),
    evidenceIds: [...new Set([...existing.evidenceIds, ...candidate.evidenceIds])],
  });
}

function nearestKnownScope(filePath: string, candidates: Map<string, StackMapScopeCandidate>): StackMapScopeCandidate | undefined {
  return [...candidates.values()]
    .filter((candidate) => pathBelongsToPackage(filePath, candidate.path))
    .sort((first, second) => second.path.length - first.path.length || stackMapScopeSourceRank[second.source] - stackMapScopeSourceRank[first.source])[0];
}

function scopeMarkerKind(filePath: string): 'package' | 'runtime' | 'dotnet' | undefined {
  const normalizedPath = normalizeScopePath(filePath);
  const name = normalizedPath.split('/').at(-1)?.toLowerCase() ?? '';
  if (name === 'package.json') return 'package';
  if (serviceConfigPath(normalizedPath)) return 'runtime';
  if (name.endsWith('.csproj') || name.endsWith('.sln') || name.endsWith('.slnx')) return 'dotnet';
  return undefined;
}

function isDotnetProjectPath(path: string): boolean {
  const name = normalizeScopePath(path).split('/').at(-1)?.toLowerCase() ?? '';
  return name.endsWith('.csproj') || name.endsWith('.sln') || name.endsWith('.slnx');
}

function canonicalStackForFact(fact: AnalyzerFact): ReturnType<typeof getStack> {
  const stackId = fact.kind === 'technology' || fact.kind === 'resource'
    ? fact.dictionaryStackId
    : fact.kind === 'runtime' && typeof fact.metadata.dictionaryStackId === 'string'
      ? fact.metadata.dictionaryStackId
      : undefined;
  return stackId ? getStack(stackId) : undefined;
}

function inferredEvidenceRole(fact: AnalyzerFact, evidence: AnalyzerEvidence): AnalyzerEvidenceRole {
  if (evidence.role) return evidence.role;
  if (evidence.detectorId === 'package-dependency' || evidence.detectorId === 'package-manager') return 'declaration';
  if (evidence.detectorId === 'source-import' || evidence.detectorId.includes('config') || fact.kind === 'runtime' || fact.kind === 'resource') return 'usage';
  if (fact.kind === 'technology' && fact.explicit) return 'usage';
  return 'declaration';
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
  const workspacePatterns = [...new Set(store.facts.flatMap((fact) => {
    if (fact.kind === 'workspace-config') return fact.patterns;
    if (fact.kind === 'workspace-pattern') return [fact.pattern];
    return [];
  }))];
  const markerRank: Record<'package' | 'runtime' | 'dotnet', number> = { package: 3, dotnet: 2, runtime: 1 };
  const markerDirectories = new Map<string, 'package' | 'runtime' | 'dotnet'>();
  const addMarkerDirectory = (directory: string, kind: 'package' | 'runtime' | 'dotnet'): void => {
    const normalizedDirectory = normalizeScopePath(directory);
    const existing = markerDirectories.get(normalizedDirectory);
    if (!existing || markerRank[kind] > markerRank[existing]) markerDirectories.set(normalizedDirectory, kind);
  };
  store.files.forEach((file) => {
    const kind = scopeMarkerKind(file.relativePath);
    if (kind) addMarkerDirectory(scopeDirectory(file.relativePath), kind);
  });
  store.facts.forEach((fact) => {
    if (fact.kind === 'workspace-package' || fact.kind === 'package-manifest') {
      addMarkerDirectory(fact.packagePath, 'package');
    } else if (fact.kind === 'dotnet-project') {
      addMarkerDirectory(scopeDirectory(fact.projectPath), 'dotnet');
    } else if (fact.kind === 'runtime') {
      addMarkerDirectory(scopeDirectory(fact.configPath ?? fact.filePath ?? ''), 'runtime');
    }
  });
  const patternRootPaths = new Set<string>();
  markerDirectories.forEach((_, directory) => {
    const root = workspacePatternRootForPath(directory, workspacePatterns);
    if (root) patternRootPaths.add(root);
  });
  const packageRecords = new Map<string, StackMapPackageRecord>();
  const knownPackagePaths = new Set<string>();
  const addPackageRecord = (packagePath: string, factId: string, evidenceIds: readonly string[], preferFactId: boolean): void => {
    const normalizedPath = normalizeScopePath(packagePath);
    if (normalizedPath !== '.' && isHiddenScopePath(normalizedPath)) return;
    const existing = packageRecords.get(normalizedPath);
    packageRecords.set(normalizedPath, {
      packagePath: normalizedPath,
      factId: preferFactId ? factId : existing?.factId ?? factId,
      isRoot: normalizedPath === '.',
      evidenceIds: [...new Set([...(existing?.evidenceIds ?? []), ...evidenceIds])],
    });
    knownPackagePaths.add(normalizedPath);
  };
  store.facts
    .filter((fact): fact is WorkspacePackageFact => fact.kind === 'workspace-package')
    .forEach((fact) => addPackageRecord(fact.packagePath, fact.id, fact.evidenceIds, true));
  store.facts
    .filter((fact): fact is PackageManifestFact => fact.kind === 'package-manifest')
    .forEach((fact) => {
      const normalizedPath = normalizeScopePath(fact.packagePath);
      if (normalizedPath === '.' || patternRootPaths.has(normalizedPath) || knownPackagePaths.has(normalizedPath)) {
        addPackageRecord(normalizedPath, fact.id, fact.evidenceIds, false);
      }
    });
  const packages = [...packageRecords.values()];
  const desktopFacts = store.facts.filter((fact): fact is Extract<AnalyzerFact, { kind: 'dotnet-project' }> => fact.kind === 'dotnet-project');
  const scopeCandidates = new Map<string, StackMapScopeCandidate>();
  packages.filter((fact) => !fact.isRoot).forEach((fact) => {
    addScopeCandidate(scopeCandidates, makeScopeCandidate(
      fact.packagePath,
      packageScopeKind(fact.packagePath),
      'package',
      fact.factId,
      fact.evidenceIds,
    ));
  });
  patternRootPaths.forEach((root) => {
    if (!packageRecords.has(root)) addScopeCandidate(scopeCandidates, makeScopeCandidate(root, packageScopeKind(root), 'workspace'));
  });
  markerDirectories.forEach((kind, directory) => {
    if (kind === 'runtime' && directory !== '.') addScopeCandidate(scopeCandidates, makeScopeCandidate(directory, 'application', 'runtime'));
  });
  store.evidence
    .filter((evidence) => evidence.role === 'scope'
      && evidence.scopeStrength !== 'usage-only'
      && typeof evidence.scopePath === 'string')
    .forEach((evidence) => {
      const scopePath = normalizeScopePath(evidence.scopePath ?? '.');
      if (scopePath !== '.') {
        addScopeCandidate(scopeCandidates, makeScopeCandidate(
          scopePath,
          'application',
          'config',
          undefined,
          [evidence.id],
          evidence.scopeStrength === 'structural' ? 'structural' : 'explicit-boundary',
        ));
      }
    });
  desktopFacts
    .filter((fact) => isDotnetProjectPath(fact.projectPath) && /\.(?:sln|slnx)$/i.test(fact.projectPath))
    .forEach((fact) => {
      const solutionRoot = scopeDirectory(fact.projectPath);
      if (solutionRoot !== '.') addScopeCandidate(scopeCandidates, makeScopeCandidate(solutionRoot, 'desktop', 'solution', fact.id, fact.evidenceIds));
    });
  desktopFacts.forEach((fact) => {
    const projectDirectory = scopeDirectory(fact.projectPath);
    const knownScope = nearestKnownScope(projectDirectory, scopeCandidates);
    if (knownScope) {
      addScopeCandidate(scopeCandidates, makeScopeCandidate(knownScope.path, 'desktop', 'solution', knownScope.factId ?? fact.id, fact.evidenceIds));
    } else if (projectDirectory !== '.') {
      addScopeCandidate(scopeCandidates, makeScopeCandidate(projectDirectory, 'desktop', 'standalone', fact.id, fact.evidenceIds));
    }
  });
  const scopes = new Map<string, StackMapScopeRecord>();

  const ensureScope = (candidate: StackMapScopeCandidate, evidenceIds: readonly string[] = []): StackMapScopeRecord => {
    const existing = scopes.get(candidate.id);
    if (existing) {
      [...candidate.evidenceIds, ...evidenceIds].forEach((evidenceId) => existing.evidenceIds.add(evidenceId));
      if (!existing.factId && candidate.factId) existing.factId = candidate.factId;
      return existing;
    }
    const created: StackMapScopeRecord = {
      id: candidate.id,
      label: candidate.label,
      path: candidate.path,
      kind: candidate.kind,
      promotionStrength: candidate.promotionStrength,
      ...(candidate.factId ? { factId: candidate.factId } : {}),
      evidenceIds: new Set([...candidate.evidenceIds, ...evidenceIds]),
      usageIds: new Set(),
    };
    scopes.set(candidate.id, created);
    return created;
  };

  const rootCandidate = projectFact || rootPackage
    ? makeScopeCandidate(
      '.',
      'root',
      'root',
      rootPackage?.id ?? projectFact?.id,
      [...new Set([...(projectFact?.evidenceIds ?? []), ...(rootPackage?.evidenceIds ?? [])])],
    )
    : undefined;
  const servicesCandidate = rootCandidate
    ? makeScopeCandidate('.', 'services', 'services', projectFact?.id, projectFact?.evidenceIds ?? [])
    : undefined;

  const evidenceById = new Map(store.evidence.map((evidence) => [evidence.id, evidence]));
  const usageById = new Map<string, StackMapUsageRecord>();
  const serviceScope = () => servicesCandidate ? ensureScope(servicesCandidate) : undefined;
  const rootScope = () => rootCandidate ? ensureScope(rootCandidate) : undefined;
  const scopeForEvidence = (item: AnalyzerEvidence): StackMapScopeRecord | undefined => {
    const explicitScope = item.scopePath ? nearestKnownScope(item.scopePath, scopeCandidates) : undefined;
    if (explicitScope) return ensureScope(explicitScope);
    const knownScope = nearestKnownScope(item.filePath, scopeCandidates);
    if (knownScope) return ensureScope(knownScope);
    if (serviceConfigPath(item.filePath)) return serviceScope();
    return rootScope();
  };

  const groupEvidenceByScope = (items: AnalyzerEvidence[]): Map<string, { scope: StackMapScopeRecord; evidenceIds: Set<string> }> => {
    const grouped = new Map<string, { scope: StackMapScopeRecord; evidenceIds: Set<string> }>();
    items.forEach((item) => {
      const scope = scopeForEvidence(item);
      if (!scope) return;
      const entry = grouped.get(scope.id) ?? { scope, evidenceIds: new Set<string>() };
      entry.evidenceIds.add(item.id);
      grouped.set(scope.id, entry);
    });
    return grouped;
  };

  store.facts.forEach((fact) => {
    const stack = canonicalStackForFact(fact);
    if (!stack) return;
    const evidence = fact.evidenceIds
      .map((evidenceId) => evidenceById.get(evidenceId))
      .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));
    if (evidence.length === 0) return;
    const classifiedEvidence = evidence.map((item) => ({ item, role: inferredEvidenceRole(fact, item) }));
    const usageEvidence = classifiedEvidence.filter((candidate) => candidate.role === 'usage').map((candidate) => candidate.item);
    const declarationEvidence = classifiedEvidence.filter((candidate) => candidate.role === 'declaration').map((candidate) => candidate.item);
    const scopeEvidence = classifiedEvidence.filter((candidate) => candidate.role === 'scope').map((candidate) => candidate.item);
    const evidenceByScope = groupEvidenceByScope(usageEvidence);
    const hasUsageEvidence = evidenceByScope.size > 0;
    if (!hasUsageEvidence) {
      groupEvidenceByScope(declarationEvidence).forEach((entry, scopeId) => {
        evidenceByScope.set(scopeId, entry);
      });
    }
    if (evidenceByScope.size === 0) return;

    if (hasUsageEvidence) {
      // Keep declarations visible without allowing their owning package to
      // create an incorrect duplicate Usage at the repository root. Prefer
      // the declaration's matching Usage scope. When there is no matching
      // Usage scope (for example, a repository-root declaration supporting
      // several internal scopes), share the same Evidence ID across those
      // existing Usage records instead of creating a declaration-only root
      // Usage.
      declarationEvidence.forEach((item) => {
        const declarationScope = scopeForEvidence(item);
        const target = declarationScope ? evidenceByScope.get(declarationScope.id) : undefined;
        if (target) target.evidenceIds.add(item.id);
        else evidenceByScope.forEach((entry) => entry.evidenceIds.add(item.id));
      });
    }
    scopeEvidence.forEach((item) => {
      const scope = scopeForEvidence(item);
      if (!scope) return;
      evidenceByScope.get(scope.id)?.evidenceIds.add(item.id);
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

  const orderedScopes = [...scopes.values()].filter((scope) => scope.usageIds.size > 0).sort((first, second) => {
    const rank: Record<StackMapScopeKind, number> = { root: 0, application: 1, workspace: 2, package: 3, desktop: 4, services: 5 };
    return rank[first.kind] - rank[second.kind] || first.path.localeCompare(second.path) || first.id.localeCompare(second.id);
  });
  const projectNode = projectFact ? nodeForFact(projectFact, 'stack-map:project') : undefined;
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
      stackMapRegionId: stackMapScopeRegionId(usage.scopeId, scopes.get(usage.scopeId)?.path),
      sourceFactIds: usage.sourceFactIds,
      sourceFactKinds: [...usage.sourceFactKinds],
      roles: usage.roles,
    },
  }));
  const regionIdByScopeId = new Map(orderedScopes.map((scope) => [scope.id, stackMapScopeRegionId(scope.id, scope.path)]));
  const parentScopeById = new Map<string, StackMapScopeRecord>();
  orderedScopes.forEach((scope) => {
    const parent = orderedScopes
      .filter((candidate) => candidate.id !== scope.id && candidate.path !== '.' && pathBelongsToPackage(scope.path, candidate.path))
      .sort((first, second) => second.path.length - first.path.length || first.id.localeCompare(second.id))[0];
    if (parent) parentScopeById.set(scope.id, parent);
  });
  const childScopeIdsByParentId = new Map<string, string[]>();
  parentScopeById.forEach((parent, childId) => {
    const childIds = childScopeIdsByParentId.get(parent.id) ?? [];
    childIds.push(childId);
    childScopeIdsByParentId.set(parent.id, childIds);
  });
  childScopeIdsByParentId.forEach((childIds) => childIds.sort((first, second) => {
    const firstScope = scopes.get(first);
    const secondScope = scopes.get(second);
    return (firstScope?.path ?? first).localeCompare(secondScope?.path ?? second) || first.localeCompare(second);
  }));
  const depthByScopeId = new Map<string, number>();
  const scopeDepth = (scopeId: string, visited = new Set<string>()): number => {
    if (visited.has(scopeId)) return 0;
    const parent = parentScopeById.get(scopeId);
    if (!parent) return 0;
    const nextVisited = new Set(visited);
    nextVisited.add(scopeId);
    const depth = scopeDepth(parent.id, nextVisited) + 1;
    depthByScopeId.set(scopeId, depth);
    return depth;
  };
  orderedScopes.forEach((scope) => scopeDepth(scope.id));
  const regions: AnalyzerSemanticRegion[] = orderedScopes.map((scope) => {
    const id = stackMapScopeRegionId(scope.id, scope.path);
    const parentScope = parentScopeById.get(scope.id);
    const parentRegionId = parentScope ? regionIdByScopeId.get(parentScope.id) : undefined;
    const childRegionIds = (childScopeIdsByParentId.get(scope.id) ?? [])
      .map((childScopeId) => regionIdByScopeId.get(childScopeId))
      .filter((regionId): regionId is string => Boolean(regionId));
    const scopeKind = scope.kind === 'root' || scope.kind === 'services' ? 'logical' : 'physical';
    return {
      id,
      entityKind: 'region',
      regionKind: 'scope',
      label: scope.label,
      ...(scope.path !== '.' ? { subtitle: scope.path } : {}),
      childIds: [...scope.usageIds]
        .map((usageId) => usageById.get(usageId)?.id)
        .filter((usageId): usageId is string => Boolean(usageId)),
      ports: (['top', 'right', 'bottom', 'left'] as const).map((side) => ({ id: `${id}:${side}`, side })),
      selectable: true,
      evidenceIds: [...scope.evidenceIds],
      ...(scope.factId ? { factId: scope.factId } : {}),
      scopeKind,
      ...(parentRegionId ? { parentRegionId } : {}),
      childRegionIds,
      depth: depthByScopeId.get(scope.id) ?? 0,
      metadata: {
        displayRole: 'REGION',
        regionKind: 'scope',
        scopeId: scope.id,
        scopeLabel: scope.label,
        scopePath: scope.path,
        scopeType: scope.kind,
        scopeKind,
        usageCount: scope.usageIds.size,
        scopePromotion: scope.promotionStrength,
        scopeDepth: depthByScopeId.get(scope.id) ?? 0,
        ...(projectNode ? { stackMapProjectId: projectNode.id, stackMapParentId: parentRegionId ?? projectNode.id } : {}),
      },
    };
  });
  const nodes = [...(projectNode ? [projectNode] : []), ...usageNodes];
  const edges: AnalyzerViewEdge[] = [];
  if (projectNode) {
    orderedScopes.filter((scope) => !parentScopeById.has(scope.id)).forEach((scope) => {
      const regionId = stackMapScopeRegionId(scope.id, scope.path);
      edges.push({
        id: `view-edge:stack-map:contains:${regionId}`,
        sourceId: projectNode.id,
        targetId: regionId,
        kind: 'contains',
        label: relationLabels.contains,
        evidenceIds: [...scope.evidenceIds],
        metadata: {
          presentation: 'stack-map',
          scopeId: scope.id,
          regionId,
          fromEndpointKind: 'node',
          toEndpointKind: 'region',
        },
      });
    });
  }
  const clusterDefinitions: ReadonlyArray<readonly [string, string, AnalyzerCluster['tone']]> = [
    ...(projectNode ? [['stack-map:project', 'Project', 'neutral'] as const] : []),
  ];
  return {
    view: 'architecture',
    nodes,
    edges,
    clusters: clusterDefinitions.map(([id, label, tone]) => cluster(id, label, tone, nodes)).filter((entry) => entry.nodeIds.length > 0),
    regions,
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
  const rootPackageIds = new Set(
    store.facts
      .filter((fact): fact is WorkspacePackageFact => fact.kind === 'workspace-package' && fact.isRoot)
      .map((fact) => fact.id),
  );
  const edges = edgesForRelations(store, nodes, (relation) => {
    if (['uses-config', 'declares', 'matches'].includes(relation.kind)) return true;
    return relation.kind === 'contains' && relation.sourceId === 'project:root' && rootPackageIds.has(relation.targetId);
  });
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

function nearestPackageIdForPath(filePath: string, packages: readonly WorkspacePackageFact[]): string | undefined {
  return packages
    .filter((candidate) => pathBelongsToPackage(filePath, candidate.packagePath))
    .sort((first, second) => second.packagePath.length - first.packagePath.length || first.packagePath.localeCompare(second.packagePath))[0]?.id;
}

function commandTerminalEvidenceIds(
  store: AnalyzerProjectStore,
  fact: AnalyzerFact,
  script: PackageScriptFact,
  relationEvidenceIds: readonly string[],
  packages: readonly WorkspacePackageFact[],
  evidenceById: Map<string, AnalyzerEvidence>,
): string[] {
  const lookup = (evidenceId: string) => evidenceById.get(evidenceId) ?? store.evidence.find((candidate) => candidate.id === evidenceId);
  const relationIds = [...new Set(relationEvidenceIds.filter((evidenceId) => lookup(evidenceId)))];
  const localFactIds = fact.evidenceIds.filter((evidenceId) => {
    const evidence = lookup(evidenceId);
    return evidence ? nearestPackageIdForPath(evidence.filePath, packages) === script.packageId : false;
  });
  const preferred = [...new Set([...relationIds, ...localFactIds])];
  return preferred.length > 0 ? preferred : [...fact.evidenceIds];
}

function mergeCommandViewEvidenceIds(
  current: AnalyzerViewNode | undefined,
  factNode: AnalyzerViewNode,
  scopedEvidenceIds?: readonly string[],
): string[] {
  const scoped = scopedEvidenceIds && scopedEvidenceIds.length > 0 ? [...scopedEvidenceIds] : undefined;
  if (!current) return scoped ?? factNode.evidenceIds;
  if (!scoped) return current.evidenceIds;
  return [...new Set([...current.evidenceIds, ...scoped])];
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
      ...(fragment.toolName ? { toolName: fragment.toolName } : {}),
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

  const addFactNode = (
    fact: AnalyzerFact,
    clusterId: string,
    typeOverride?: AnalyzerNodeType,
    context?: CommandExecutionContext,
    scopedEvidenceIds?: readonly string[],
  ) => {
    const nextNode = nodeForFact(fact, clusterId, typeOverride);
    const evidenceIds = mergeCommandViewEvidenceIds(nodes.get(fact.id), nextNode, scopedEvidenceIds);
    if (!context) {
      nodes.set(fact.id, { ...nextNode, evidenceIds });
      return;
    }
    const currentNode = nodes.get(fact.id);
    const currentRank = currentNode?.metadata.executionRank;
    if (currentNode && typeof currentRank === 'number' && currentRank <= context.executionRank) {
      nodes.set(fact.id, { ...currentNode, evidenceIds });
      return;
    }
    const baseNode = currentNode ?? nextNode;
    nodes.set(fact.id, {
      ...baseNode,
      evidenceIds,
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
    const terminal = commandTerminalTarget(fragment, store, script);
    if (terminal) {
      const terminalFact = store.facts.find((fact) => fact.id === terminal.factId);
      if (terminalFact) {
        addFactNode(terminalFact, 'command:commands', undefined, {
          executionRank: context.executionRank + 1,
          executionDepth: context.executionDepth + 1,
          branchPath: context.branchPath,
          ...commandLaneMetadata(context),
        }, commandTerminalEvidenceIds(store, terminalFact, script, evidenceIds, packages, generatedEvidence));
      }
      addViewEdge(edges, {
        id: `view-edge:${commandId}:${terminal.factId}:${terminal.kind}`,
        sourceId: commandId,
        targetId: terminal.factId,
        kind: terminal.kind,
        label: relationLabels[terminal.kind],
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

interface ModuleDirectoryPresentation {
  id: string;
  packageId?: string;
  path: string;
  factIds: string[];
  terminal: ModuleDirectoryFact;
  parentId?: string;
  childIds: string[];
}

function modulePackageRegionId(packageId?: string): string {
  return `module-region:package:${packageId ?? 'project:root'}`;
}

function moduleDirectoryRegionId(factId: string): string {
  return `module-region:directory:${factId}`;
}

function moduleRegionPorts(id: string): AnalyzerSemanticRegion['ports'] {
  return (['top', 'right', 'bottom', 'left'] as const).map((side) => ({ id: `${id}:${side}`, side }));
}

/**
 * Projects source modules independently from Package Dependency. Directories
 * remain Semantic Regions; only source files become graph Nodes and only
 * `imports` relations become graph Edges.
 */
export function projectModuleDependency(store: AnalyzerProjectStore): AnalyzerViewModel {
  const moduleFacts = store.facts
    .filter((fact): fact is ModuleFact => fact.kind === 'module')
    .sort((first, second) => first.path.localeCompare(second.path) || first.id.localeCompare(second.id));
  const directoryFacts = store.facts
    .filter((fact): fact is ModuleDirectoryFact => fact.kind === 'module-directory')
    .sort((first, second) => first.path.localeCompare(second.path) || first.id.localeCompare(second.id));
  const moduleIds = new Set(moduleFacts.map((fact) => fact.id));
  const importRelations = store.relations
    .filter((relation) => relation.kind === 'imports' && moduleIds.has(relation.sourceId) && moduleIds.has(relation.targetId))
    .sort((first, second) => first.id.localeCompare(second.id));

  const packageById = new Map<string, { id: string; path: string; label: string; factId?: string; moduleIds: string[] }>();
  moduleFacts.forEach((fact) => {
    const packageId = fact.packageId;
    const key = packageId ?? 'project:root';
    const existing = packageById.get(key) ?? {
      id: packageId ?? 'project:root',
      path: fact.packagePath ?? '.',
      label: fact.packageName ?? fact.packagePath ?? 'Project',
      moduleIds: [],
    };
    existing.moduleIds.push(fact.id);
    if (!existing.factId && packageId) existing.factId = packageId;
    packageById.set(key, existing);
  });
  if (packageById.size === 0) {
    const project = store.facts.find((fact) => fact.kind === 'project');
    packageById.set('project:root', {
      id: 'project:root',
      path: '.',
      label: project?.label ?? 'Project',
      ...(project ? { factId: project.id } : {}),
      moduleIds: [],
    });
  }

  const directoriesByPackage = new Map<string, ModuleDirectoryFact[]>();
  directoryFacts.forEach((fact) => {
    const key = fact.packageId ?? 'project:root';
    const entries = directoriesByPackage.get(key) ?? [];
    entries.push(fact);
    directoriesByPackage.set(key, entries);
  });

  const directoryGroupsByPackage = new Map<string, ModuleDirectoryPresentation[]>();
  const groupByFactId = new Map<string, ModuleDirectoryPresentation>();
  const groupByModuleId = new Map<string, ModuleDirectoryPresentation>();
  directoriesByPackage.forEach((facts, packageKey) => {
    const factById = new Map(facts.map((fact) => [fact.id, fact]));
    const childFactsById = new Map<string, ModuleDirectoryFact[]>();
    facts.forEach((fact) => {
      if (!fact.parentDirectoryId || !factById.has(fact.parentDirectoryId)) return;
      const children = childFactsById.get(fact.parentDirectoryId) ?? [];
      children.push(fact);
      childFactsById.set(fact.parentDirectoryId, children);
    });
    childFactsById.forEach((children) => children.sort((first, second) => first.path.localeCompare(second.path)));
    const starts = facts.filter((fact) => {
      const parent = fact.parentDirectoryId ? factById.get(fact.parentDirectoryId) : undefined;
      const siblings = parent ? childFactsById.get(parent.id) ?? [] : [];
      return !parent || parent.moduleIds.length > 0 || siblings.length !== 1;
    });
    const groups: ModuleDirectoryPresentation[] = [];
    starts.forEach((start) => {
      const factIds = [start.id];
      let terminal = start;
      while (terminal.moduleIds.length === 0) {
        const children = childFactsById.get(terminal.id) ?? [];
        if (children.length !== 1) break;
        terminal = children[0]!;
        factIds.push(terminal.id);
      }
      const id = moduleDirectoryRegionId(terminal.id);
      const group: ModuleDirectoryPresentation = {
        id,
        ...(terminal.packageId ? { packageId: terminal.packageId } : {}),
        path: terminal.path,
        factIds,
        terminal,
        childIds: [],
      };
      groups.push(group);
      factIds.forEach((factId) => groupByFactId.set(factId, group));
    });
    const sortedGroups = groups.sort((first, second) => first.path.localeCompare(second.path) || first.id.localeCompare(second.id));
    sortedGroups.forEach((group) => {
      const parentFactId = group.terminal.parentDirectoryId;
      const parentGroup = parentFactId ? groupByFactId.get(parentFactId) : undefined;
      if (parentGroup && parentGroup.id !== group.id) {
        group.parentId = parentGroup.id;
        parentGroup.childIds.push(group.id);
      }
      group.terminal.moduleIds.forEach((moduleId) => groupByModuleId.set(moduleId, group));
    });
    directoryGroupsByPackage.set(packageKey, sortedGroups);
  });

  const regions: AnalyzerSemanticRegion[] = [];
  const packageRegionByKey = new Map<string, AnalyzerSemanticRegion>();
  const directoryRegionByGroupId = new Map<string, AnalyzerSemanticRegion>();
  [...packageById.entries()]
    .sort(([, first], [, second]) => first.path.localeCompare(second.path) || first.label.localeCompare(second.label))
    .forEach(([packageKey, packageRecord]) => {
      const packageRegionId = modulePackageRegionId(packageRecord.id);
      const groups = directoryGroupsByPackage.get(packageKey) ?? [];
      const topGroups = groups.filter((group) => !group.parentId).sort((first, second) => first.path.localeCompare(second.path));
      const packagePath = packageRecord.path;
      const directModules = moduleFacts
        .filter((fact) => packageRecord.moduleIds.includes(fact.id))
        .filter((fact) => (fact.directoryPath ?? '.') === packagePath)
        .map((fact) => fact.id)
        .sort();
      const packageRegion: AnalyzerSemanticRegion = {
        id: packageRegionId,
        entityKind: 'region',
        regionKind: 'workspace-package',
        label: packageRecord.label,
        ...(packagePath !== '.' ? { subtitle: packagePath } : {}),
        childIds: directModules,
        childRegionIds: topGroups.map((group) => group.id),
        ports: moduleRegionPorts(packageRegionId),
        selectable: true,
        evidenceIds: packageRecord.factId
          ? store.facts.find((fact) => fact.id === packageRecord.factId)?.evidenceIds ?? []
          : [],
        ...(packageRecord.factId ? { factId: packageRecord.factId } : {}),
        depth: 0,
        metadata: {
          displayRole: 'PACKAGE / AREA',
          regionKind: 'workspace-package',
          packageId: packageRecord.id,
          packagePath,
          moduleCount: packageRecord.moduleIds.length,
          directoryCount: groups.length,
        },
      };
      packageRegionByKey.set(packageKey, packageRegion);
      regions.push(packageRegion);
      groups.forEach((group) => {
        const parentId = group.parentId ?? packageRegionId;
        const region: AnalyzerSemanticRegion = {
          id: group.id,
          entityKind: 'region',
          regionKind: 'directory',
          label: group.path.split('/').at(-1) ?? group.path,
          subtitle: group.path,
          childIds: [...group.terminal.moduleIds].sort(),
          childRegionIds: [...group.childIds].sort(),
          ports: moduleRegionPorts(group.id),
          selectable: true,
          evidenceIds: [],
          factId: group.terminal.id,
          parentRegionId: parentId,
          depth: (regions.find((candidate) => candidate.id === parentId)?.depth ?? 0) + 1,
          metadata: {
            displayRole: 'DIRECTORY',
            regionKind: 'directory',
            directoryPath: group.path,
            packageId: packageRecord.id,
            compressedPaths: group.factIds.map((factId) => factByDirectoryId(directoryFacts, factId)?.path ?? group.path),
            moduleCount: directoryModuleCount(group, groupByFactId),
          },
        };
        directoryRegionByGroupId.set(group.id, region);
        regions.push(region);
      });
    });

  const incoming = new Map<string, number>();
  const outgoing = new Map<string, number>();
  importRelations.forEach((relation) => {
    outgoing.set(relation.sourceId, (outgoing.get(relation.sourceId) ?? 0) + 1);
    incoming.set(relation.targetId, (incoming.get(relation.targetId) ?? 0) + 1);
  });
  const moduleNodes: AnalyzerViewNode[] = moduleFacts.map((fact) => {
    const packageKey = fact.packageId ?? 'project:root';
    const packageRecord = packageById.get(packageKey);
    const directoryGroup = groupByModuleId.get(fact.id);
    const regionPath = [
      modulePackageRegionId(packageRecord?.id ?? fact.packageId),
      ...regionAncestors(directoryGroup, groupByFactId, directoryRegionByGroupId),
    ];
    return {
      id: fact.id,
      factId: fact.id,
      type: 'module',
      label: fact.label,
      subtitle: fact.extension || fact.language,
      clusterId: 'module-dependency:modules',
      evidenceIds: fact.evidenceIds,
      metadata: {
        ...fact.metadata,
        factKind: 'module',
        displayRole: 'MODULE',
        modulePath: fact.path,
        directoryPath: fact.directoryPath,
        language: fact.language,
        extension: fact.extension,
        ...(fact.packageName ? { packageName: fact.packageName } : {}),
        ...(fact.packagePath ? { packagePath: fact.packagePath } : {}),
        incomingCount: incoming.get(fact.id) ?? 0,
        outgoingCount: outgoing.get(fact.id) ?? 0,
        regionPath,
        unresolvedImports: fact.unresolvedImports.map((reference) => reference.specifier),
        unresolvedImportDetails: fact.unresolvedImports.map((reference) => `${reference.kind} · ${reference.specifier}${reference.reason ? ` · ${reference.reason}` : ''}`),
        fileIcon: moduleFileIcon(fact.extension),
      },
    };
  });
  const edges = importRelations.map((relation) => relationEdge(relation, 'imports', relationLabels.imports));
  const cluster = {
    id: 'module-dependency:modules',
    label: 'Modules',
    tone: 'neutral' as const,
    nodeIds: moduleNodes.map((node) => node.id),
  };
  return {
    view: 'module-dependency',
    nodes: moduleNodes,
    edges,
    clusters: moduleNodes.length > 0 ? [cluster] : [],
    regions,
    evidence: store.evidence,
    warnings: baseWarnings(store, 'module-dependency'),
    projectLabel: store.facts.find((fact) => fact.kind === 'project')?.label,
  };
}

/** Plural alias used by callers that name the view after its edge collection. */
export const projectModuleDependencies = projectModuleDependency;

function factByDirectoryId(facts: readonly ModuleDirectoryFact[], id: string): ModuleDirectoryFact | undefined {
  return facts.find((fact) => fact.id === id);
}

function directoryModuleCount(group: ModuleDirectoryPresentation, groupByFactId: Map<string, ModuleDirectoryPresentation>): number {
  const groupsById = new Map<string, ModuleDirectoryPresentation>();
  groupByFactId.forEach((candidate) => groupsById.set(candidate.id, candidate));
  const count = (current: ModuleDirectoryPresentation, visited = new Set<string>()): Set<string> => {
    if (visited.has(current.id)) return new Set();
    const nextVisited = new Set(visited);
    nextVisited.add(current.id);
    const moduleIds = new Set(current.terminal.moduleIds);
    current.childIds.forEach((childId) => {
      const child = groupsById.get(childId);
      count(child ?? current, nextVisited).forEach((moduleId) => moduleIds.add(moduleId));
    });
    return moduleIds;
  };
  return count(group).size;
}

function regionAncestors(
  group: ModuleDirectoryPresentation | undefined,
  groupByFactId: Map<string, ModuleDirectoryPresentation>,
  regionByGroupId: Map<string, AnalyzerSemanticRegion>,
): string[] {
  const ancestors: string[] = [];
  let current = group;
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    ancestors.unshift(current.id);
    const parentFactId = current.terminal.parentDirectoryId;
    current = parentFactId ? groupByFactId.get(parentFactId) : undefined;
  }
  return ancestors.filter((id) => regionByGroupId.has(id));
}

function moduleFileIcon(extension: string): string {
  const icons: Record<string, string> = {
    '.ts': 'TS',
    '.tsx': 'TSX',
    '.js': 'JS',
    '.jsx': 'JSX',
    '.mjs': 'MJS',
    '.cjs': 'CJS',
    '.mts': 'MTS',
    '.cts': 'CTS',
  };
  return icons[extension.toLowerCase()] ?? 'FILE';
}

export function projectAnalyzerView(store: AnalyzerProjectStore, view: AnalyzerViewModel['view'], entryScriptId?: string): AnalyzerViewModel {
  if (view === 'architecture') return projectArchitecture(store);
  if (view === 'workspace') return projectWorkspace(store);
  if (view === 'command') return projectCommand(store, entryScriptId);
  if (view === 'module-dependency') return projectModuleDependency(store);
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
