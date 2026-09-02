import { findCanonicalStackByPackageName, getStack } from '../data';
import { isAnalyzerSourcePath, isAnalyzerUsageSourcePath, normalizeRelativePath } from './fileDiscovery';
import { makeEvidence, makeFileEvidence, maskSensitiveSource, type OffsetRange } from './evidence';
import {
  parseDotnetProject,
  parseFirebaseConfig,
  parseJsonc,
  parsePackageJson,
  parsePnpmWorkspace,
  parseWranglerConfig,
  type ParsedPackageDependency,
  type ParsedPackageJson,
  type ParsedPnpmWorkspace,
} from './parsers';
import type {
  AnalyzerDependencyType,
  AnalyzerFact,
  AnalyzerEvidence,
  AnalyzerEvidenceRole,
  AnalyzerMetadata,
  AnalyzerProjectStore,
  AnalyzerRelation,
  AnalyzerSourceFile,
  AnalyzerWarning,
  DotnetProjectFact,
  ExternalPackageFact,
  PackageDependencyDeclaration,
  PackageManifestFact,
  PackageScriptFact,
  ProjectFact,
  ResourceFact,
  RuntimeFact,
  TechnologyFact,
  WorkspaceConfigFact,
  WorkspacePackageFact,
  WorkspacePatternFact,
} from './types';
import { packageIdForPath, scriptIdFor } from './types';

export const ANALYZER_MAX_CONFIG_SIZE = 1024 * 1024;

export class AnalyzerStoreBuilder {
  private readonly factMap = new Map<string, AnalyzerFact>();
  private readonly relationMap = new Map<string, AnalyzerRelation>();
  private readonly evidenceMap = new Map<string, AnalyzerEvidence>();
  private readonly sourceMap: Record<string, string> = {};
  private readonly warningMap = new Map<string, AnalyzerWarning>();

  addSource(filePath: string, source: string): void {
    this.sourceMap[filePath] = maskSensitiveSource(source);
  }

  addEvidence(evidence: AnalyzerEvidence): string {
    this.evidenceMap.set(evidence.id, evidence);
    return evidence.id;
  }

  addFact(fact: AnalyzerFact): string {
    const existing = this.factMap.get(fact.id);
    if (!existing) {
      this.factMap.set(fact.id, { ...fact, evidenceIds: [...new Set(fact.evidenceIds)] });
      return fact.id;
    }

    const mergedEvidenceIds = [...new Set([...existing.evidenceIds, ...fact.evidenceIds])];
    const mergedMetadata = { ...existing.metadata, ...fact.metadata };
    if (existing.kind === 'technology' && fact.kind === 'technology') {
      this.factMap.set(fact.id, {
        ...existing,
        ...fact,
        evidenceIds: mergedEvidenceIds,
        metadata: mergedMetadata,
        packageNames: [...new Set([...existing.packageNames, ...fact.packageNames])],
        explicit: existing.explicit || fact.explicit,
      });
    } else if (existing.kind === 'external-package' && fact.kind === 'external-package') {
      this.factMap.set(fact.id, {
        ...existing,
        ...fact,
        evidenceIds: mergedEvidenceIds,
        metadata: mergedMetadata,
        versionRanges: [...new Set([...existing.versionRanges, ...fact.versionRanges])],
        dependencyTypes: [...new Set([...existing.dependencyTypes, ...fact.dependencyTypes])],
      });
    } else if (existing.kind === 'workspace-package' && fact.kind === 'workspace-package') {
      this.factMap.set(fact.id, {
        ...existing,
        ...fact,
        evidenceIds: mergedEvidenceIds,
        metadata: mergedMetadata,
        scripts: { ...existing.scripts, ...fact.scripts },
        dependencies: [...existing.dependencies, ...fact.dependencies],
      });
    } else {
      this.factMap.set(fact.id, { ...existing, evidenceIds: mergedEvidenceIds, metadata: mergedMetadata });
    }
    return fact.id;
  }

  addRelation(relation: AnalyzerRelation): string {
    const existing = this.relationMap.get(relation.id);
    if (!existing) {
      this.relationMap.set(relation.id, { ...relation, evidenceIds: [...new Set(relation.evidenceIds)] });
      return relation.id;
    }
    this.relationMap.set(relation.id, {
      ...existing,
      evidenceIds: [...new Set([...existing.evidenceIds, ...relation.evidenceIds])],
      metadata: { ...existing.metadata, ...relation.metadata },
    });
    return relation.id;
  }

  addWarning(warning: AnalyzerWarning): string {
    this.warningMap.set(warning.id, warning);
    return warning.id;
  }

  getSource(filePath: string): string | undefined {
    return this.sourceMap[filePath];
  }

  getFact(id: string): AnalyzerFact | undefined {
    return this.factMap.get(id);
  }

  forEachFact(callback: (fact: AnalyzerFact) => void): void {
    this.factMap.forEach(callback);
  }

  build(files: AnalyzerSourceFile[]): AnalyzerProjectStore {
    return {
      files,
      facts: [...this.factMap.values()],
      relations: [...this.relationMap.values()],
      evidence: [...this.evidenceMap.values()],
      sources: { ...this.sourceMap },
      warnings: [...this.warningMap.values()],
      scannedAt: new Date().toISOString(),
    };
  }
}

interface LoadedSource {
  file: AnalyzerSourceFile;
  source: string;
}

interface WorkspaceState {
  config?: ParsedPnpmWorkspace;
  patterns: ParsedPnpmWorkspace['patterns'];
}

interface PackageState {
  parsed: ParsedPackageJson;
  packageId: string;
  isWorkspacePackage: boolean;
}

function relationId(kind: AnalyzerRelation['kind'], sourceId: string, targetId: string, suffix = ''): string {
  return `relation:${kind}:${sourceId}:${targetId}${suffix ? `:${suffix}` : ''}`;
}

function addRelation(
  builder: AnalyzerStoreBuilder,
  sourceId: string,
  targetId: string,
  kind: AnalyzerRelation['kind'],
  evidenceIds: string[] = [],
  metadata: AnalyzerMetadata = {},
  suffix = '',
): void {
  builder.addRelation({
    id: relationId(kind, sourceId, targetId, suffix),
    sourceId,
    targetId,
    kind,
    evidenceIds,
    metadata,
  });
}

function addWarning(builder: AnalyzerStoreBuilder, message: string, filePath?: string, detectorId?: string, severity: AnalyzerWarning['severity'] = 'warning'): void {
  builder.addWarning({
    id: `warning:${detectorId ?? 'scan'}:${filePath ?? 'project'}:${message}`,
    message,
    severity,
    ...(filePath ? { filePath } : {}),
    ...(detectorId ? { detectorId } : {}),
  });
}

function isConfigFile(file: AnalyzerSourceFile): boolean {
  return isAnalyzerSourcePath(file.relativePath);
}

function isUsageSourceFile(file: AnalyzerSourceFile): boolean {
  return isAnalyzerUsageSourcePath(file.relativePath);
}

async function loadSources(files: AnalyzerSourceFile[], builder: AnalyzerStoreBuilder): Promise<LoadedSource[]> {
  const candidates = files.filter((file) => isConfigFile(file) || isUsageSourceFile(file)).sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  const loaded = await Promise.all(candidates.map(async (file): Promise<LoadedSource | undefined> => {
    if (file.size > ANALYZER_MAX_CONFIG_SIZE) {
      addWarning(builder, `Skipped oversized analyzer input (${Math.round(file.size / 1024)} KB)`, file.relativePath, 'file-size-guard');
      return undefined;
    }
    try {
      const source = await file.readText();
      builder.addSource(file.relativePath, source);
      return { file, source };
    } catch {
      addWarning(builder, `Could not read ${file.relativePath}`, file.relativePath, 'file-discovery', 'error');
      return undefined;
    }
  }));
  return loaded.filter((entry): entry is LoadedSource => Boolean(entry));
}

function isNamedFile(filePath: string, name: string): boolean {
  return filePath.split('/').at(-1)?.toLowerCase() === name.toLowerCase();
}

function isPositiveWorkspacePattern(pattern: string): boolean {
  return !pattern.trim().startsWith('!');
}

function globToRegExp(pattern: string): RegExp {
  const normalized = pattern.replace(/^\.\//, '').replace(/\/$/, '');
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

function matchesWorkspacePatterns(packagePath: string, patterns: string[]): boolean {
  const normalizedPath = packagePath.replace(/^\.\//, '');
  const positivePatterns = patterns.filter(isPositiveWorkspacePattern);
  const negativePatterns = patterns.filter((pattern) => !isPositiveWorkspacePattern(pattern)).map((pattern) => pattern.slice(1));
  return positivePatterns.some((pattern) => globToRegExp(pattern).test(normalizedPath))
    && !negativePatterns.some((pattern) => globToRegExp(pattern).test(normalizedPath));
}

function createEvidence(
  builder: AnalyzerStoreBuilder,
  filePath: string,
  source: string,
  range: OffsetRange | undefined,
  kind: Parameters<typeof makeEvidence>[3],
  detectorId: string,
  description: string,
  role?: AnalyzerEvidenceRole,
  scopePath?: string,
): string | undefined {
  if (!range) return undefined;
  return builder.addEvidence(makeEvidence(filePath, source, range, kind, detectorId, description, 2, role, scopePath));
}

function createFileEvidence(
  builder: AnalyzerStoreBuilder,
  filePath: string,
  source: string,
  kind: Parameters<typeof makeFileEvidence>[2],
  detectorId: string,
  description: string,
  role?: AnalyzerEvidenceRole,
  scopePath?: string,
): string {
  return builder.addEvidence(makeFileEvidence(filePath, source, kind, detectorId, description, role, scopePath));
}

function addProjectFact(builder: AnalyzerStoreBuilder, rootPackage: ParsedPackageJson | undefined, rootSource: LoadedSource | undefined, fallbackSource: LoadedSource | undefined): ProjectFact {
  const evidenceId = rootPackage && rootSource
    ? createEvidence(builder, rootPackage.filePath, rootSource.source, rootPackage.nameRange, 'project', 'project-manifest', 'Project name from package.json')
    : fallbackSource
      ? createFileEvidence(builder, fallbackSource.file.relativePath, fallbackSource.source, 'project', 'project-scan', 'Selected local project folder')
      : undefined;
  const project: ProjectFact = {
    id: 'project:root',
    kind: 'project',
    label: rootPackage?.name ?? 'Local Project',
    relativePath: '.',
    ...(rootPackage?.filePath ? { filePath: rootPackage.filePath } : {}),
    evidenceIds: evidenceId ? [evidenceId] : [],
    metadata: {
      path: '.',
      ...(rootPackage?.name ? { packageName: rootPackage.name } : {}),
    },
  };
  builder.addFact(project);
  return project;
}

function addWorkspaceFacts(builder: AnalyzerStoreBuilder, projectId: string, workspace: WorkspaceState): { configId?: string; patternIds: string[] } {
  if (!workspace.config) return { patternIds: [] };
  const configId = 'workspace:pnpm';
  const configEvidence = builder.addEvidence(makeFileEvidence(workspace.config.filePath, builder.getSource(workspace.config.filePath) ?? '', 'workspace', 'pnpm-workspace', 'pnpm workspace configuration'));
  const config: WorkspaceConfigFact = {
    id: configId,
    kind: 'workspace-config',
    label: 'pnpm workspace',
    filePath: workspace.config.filePath,
    evidenceIds: [configEvidence],
    metadata: { manager: 'pnpm', path: workspace.config.filePath, patternCount: workspace.patterns.length },
    manager: 'pnpm',
    patterns: workspace.patterns.map((pattern) => pattern.pattern),
  };
  builder.addFact(config);
  addRelation(builder, projectId, configId, 'uses-config', [configEvidence], { manager: 'pnpm' });

  const patternIds: string[] = [];
  workspace.patterns.forEach((pattern, index) => {
    const patternId = `workspace-pattern:${pattern.pattern}:${index}`;
    const evidenceId = createEvidence(builder, workspace.config!.filePath, builder.getSource(workspace.config!.filePath) ?? '', pattern.range, 'workspace', 'pnpm-workspace-pattern', `Workspace pattern ${pattern.pattern}`);
    const patternFact: WorkspacePatternFact = {
      id: patternId,
      kind: 'workspace-pattern',
      label: pattern.pattern,
      filePath: workspace.config!.filePath,
      evidenceIds: evidenceId ? [evidenceId] : [],
      metadata: { pattern: pattern.pattern, order: index + 1 },
      pattern: pattern.pattern,
      configId,
    };
    builder.addFact(patternFact);
    addRelation(builder, configId, patternId, 'declares', evidenceId ? [evidenceId] : [], { pattern: pattern.pattern }, `${index}`);
    patternIds.push(patternId);
  });
  return { configId, patternIds };
}

function addManifestFact(builder: AnalyzerStoreBuilder, parsed: ParsedPackageJson, source: string): PackageManifestFact {
  const evidenceId = createEvidence(builder, parsed.filePath, source, parsed.nameRange, 'manifest', 'package-json', 'Package manifest name');
  const fact: PackageManifestFact = {
    id: `manifest:${parsed.packagePath}`,
    kind: 'package-manifest',
    label: parsed.name ?? parsed.packagePath,
    filePath: parsed.filePath,
    evidenceIds: evidenceId ? [evidenceId] : [],
    metadata: { path: parsed.filePath, packagePath: parsed.packagePath },
    packagePath: parsed.packagePath,
    packageId: packageIdForPath(parsed.packagePath),
  };
  builder.addFact(fact);
  return fact;
}

function makeWorkspacePackageFact(parsed: ParsedPackageJson, source: string, builder: AnalyzerStoreBuilder, isRoot: boolean): WorkspacePackageFact {
  const packageId = packageIdForPath(parsed.packagePath);
  const evidenceId = createEvidence(builder, parsed.filePath, source, parsed.nameRange, 'manifest', 'package-json', 'Workspace package name');
  const fact: WorkspacePackageFact = {
    id: packageId,
    kind: 'workspace-package',
    label: parsed.name ?? parsed.packagePath,
    filePath: parsed.filePath,
    evidenceIds: evidenceId ? [evidenceId] : [],
    metadata: {
      path: parsed.packagePath,
      manifest: parsed.filePath,
      ...(parsed.name ? { packageName: parsed.name } : {}),
      ...(isRoot ? { role: 'root package' } : {}),
    },
    packagePath: parsed.packagePath,
    packageName: parsed.name ?? parsed.packagePath,
    manifestPath: parsed.filePath,
    scripts: Object.fromEntries(parsed.scripts.map((script) => [script.name, script.command])),
    dependencies: [],
    isRoot,
  };
  builder.addFact(fact);
  parsed.scripts.forEach((script) => {
    const scriptEvidence = createEvidence(builder, parsed.filePath, source, script.propertyRange, 'script', 'package-script', `Script ${script.name}`);
    const scriptFact: PackageScriptFact = {
      id: scriptIdFor(packageId, script.name),
      kind: 'package-script',
      label: script.name,
      filePath: parsed.filePath,
      evidenceIds: scriptEvidence ? [scriptEvidence] : [],
      metadata: { command: script.command, packagePath: parsed.packagePath, packageName: parsed.name ?? parsed.packagePath },
      packageId,
      packagePath: parsed.packagePath,
      packageName: parsed.name ?? parsed.packagePath,
      scriptName: script.name,
      command: script.command,
      sourcePath: parsed.filePath,
      commandStartOffset: script.commandStartOffset,
      commandEndOffset: script.commandEndOffset,
    };
    builder.addFact(scriptFact);
    addRelation(builder, packageId, scriptFact.id, 'contains', scriptEvidence ? [scriptEvidence] : [], { scriptName: script.name });
  });
  return fact;
}

const PRIMARY_PACKAGE_TECHNOLOGY: Record<string, string> = {
  // `firebase` is the product package; Firebase Authentication remains the
  // capability/resource dictionary match for firebase.json Auth evidence.
  firebase: 'firebase',
};

function technologyForPackageName(packageName: string): { id: string } | undefined {
  const normalized = packageName.toLowerCase();
  const primaryTechnologyId = PRIMARY_PACKAGE_TECHNOLOGY[normalized];
  if (primaryTechnologyId) return { id: primaryTechnologyId };
  const stack = findCanonicalStackByPackageName(packageName);
  return stack ? { id: stack.id } : undefined;
}

function addTechnologyFact(
  builder: AnalyzerStoreBuilder,
  stackId: string,
  packageName: string | undefined,
  evidenceIds: string | readonly string[] | undefined,
  explicit: boolean,
  labelOverride?: string,
  sourceOverride?: string,
): string {
  const stack = getStack(stackId);
  const technologyId = `technology:${stackId}`;
  const normalizedEvidenceIds = evidenceIds === undefined ? [] : typeof evidenceIds === 'string' ? [evidenceIds] : [...evidenceIds];
  const fact: TechnologyFact = {
    id: technologyId,
    kind: 'technology',
    label: labelOverride ?? stack?.name ?? stackId,
    evidenceIds: normalizedEvidenceIds,
    metadata: {
      ...(stack ? { dictionaryStackId: stackId } : {}),
      ...(packageName ? { packageName } : {}),
      source: sourceOverride ?? (explicit ? 'explicit config' : 'package manifest'),
    },
    ...(stack ? { dictionaryStackId: stackId } : {}),
    packageNames: packageName ? [packageName] : [],
    explicit,
  };
  builder.addFact(fact);
  return technologyId;
}

function addExternalPackageFact(builder: AnalyzerStoreBuilder, dependency: ParsedPackageDependency, evidenceId: string | undefined): string {
  const id = `external-package:${dependency.packageName}`;
  const fact: ExternalPackageFact = {
    id,
    kind: 'external-package',
    label: dependency.packageName,
    evidenceIds: evidenceId ? [evidenceId] : [],
    metadata: { packageName: dependency.packageName, versionRange: dependency.versionRange },
    packageName: dependency.packageName,
    versionRanges: [dependency.versionRange],
    dependencyTypes: [dependency.dependencyType],
  };
  builder.addFact(fact);
  return id;
}

function dependencyDeclaration(dependency: ParsedPackageDependency, sourcePath: string, evidenceId?: string): PackageDependencyDeclaration {
  return {
    packageName: dependency.packageName,
    versionRange: dependency.versionRange,
    dependencyType: dependency.dependencyType,
    sourcePath,
    valueStartOffset: dependency.valueStartOffset,
    valueEndOffset: dependency.valueEndOffset,
    ...(evidenceId ? { evidenceId } : {}),
  };
}

function findNearestPackage(filePath: string, packages: Map<string, PackageState>): PackageState | undefined {
  const directory = filePath.split('/').slice(0, -1).join('/') || '.';
  return [...packages.values()]
    .filter((candidate) => candidate.isWorkspacePackage)
    .filter((candidate) => directory === candidate.parsed.packagePath || directory.startsWith(`${candidate.parsed.packagePath}/`))
    .sort((a, b) => b.parsed.packagePath.length - a.parsed.packagePath.length)[0];
}

function resolveRelativePath(baseFilePath: string, include: string): string {
  const parts = [...baseFilePath.split('/').slice(0, -1), ...include.replaceAll('\\', '/').split('/')];
  const resolved: string[] = [];
  parts.forEach((part) => {
    if (!part || part === '.') return;
    if (part === '..') resolved.pop();
    else resolved.push(part);
  });
  return normalizeRelativePath(resolved.join('/'));
}

interface ConfigScopeBinding {
  path: string;
  description: string;
}

const nonApplicationScopeRoots = new Set(['script', 'scripts', 'spec', 'specs', 'test', 'tests', 'tool', 'tools']);

function directoryForFilePath(filePath: string): string {
  const normalizedPath = normalizeRelativePath(filePath);
  const slash = normalizedPath.lastIndexOf('/');
  return slash >= 0 ? normalizeRelativePath(normalizedPath.slice(0, slash)) : '.';
}

function pathBeforeConfiguredGlob(path: string, isFile = false): string {
  const normalizedPath = normalizeRelativePath(path);
  const parts = normalizedPath.split('/').filter(Boolean);
  const wildcardIndex = parts.findIndex((part) => /[*?]/.test(part));
  const stableParts = wildcardIndex >= 0 ? parts.slice(0, wildcardIndex) : [...parts];
  if (isFile || (wildcardIndex < 0 && stableParts.length > 0 && /\.[^/]+$/.test(stableParts.at(-1) ?? ''))) stableParts.pop();
  return stableParts.length > 0 ? stableParts.join('/') : '.';
}

/**
 * Turns an explicitly configured source path into a conservative semantic
 * boundary. `webview/src` belongs to `webview`, while a repository-root
 * `src` config remains the useful `src` boundary.
 */
function configuredScopeBoundary(path: string): string | undefined {
  const normalizedPath = normalizeRelativePath(path);
  if (normalizedPath === '.') return '.';
  const parts = normalizedPath.split('/').filter(Boolean);
  if (nonApplicationScopeRoots.has(parts[0]?.toLowerCase() ?? '')) return undefined;
  const sourceIndex = parts.findIndex((part, index) => index > 0 && /^(?:src|source)$/i.test(part));
  const boundary = sourceIndex > 0 ? parts.slice(0, sourceIndex) : parts;
  return boundary.length > 0 ? boundary.join('/') : '.';
}

function resolveConfiguredScopePath(baseFilePath: string, configuredPath: string, isFile = false): string | undefined {
  const value = configuredPath.trim().replaceAll('\\', '/');
  if (!value || value.startsWith('/') || /^[A-Za-z]:\//.test(value)) return undefined;
  return configuredScopeBoundary(pathBeforeConfiguredGlob(resolveRelativePath(baseFilePath, value), isFile));
}

function configuredScopeBindings(loaded: LoadedSource): ConfigScopeBinding[] {
  const lowerName = loaded.file.name.toLowerCase();
  const directory = directoryForFilePath(loaded.file.relativePath);
  if (lowerName.startsWith('vite.config.')) {
    const rootMatch = /\broot\s*:\s*(['"`])([^'"`]+)\1/.exec(loaded.source);
    // Vite resolves `root` from the project working directory rather than
    // from the directory containing the config file. This matters for a
    // repository-level invocation such as `vite --config webview/vite.config.ts`
    // where `root: 'webview'` must remain `webview`, not `webview/webview`.
    const rootPath = rootMatch ? resolveConfiguredScopePath('.', rootMatch[2] ?? '') : configuredScopeBoundary(directory);
    return [{ path: rootPath ?? '.', description: rootMatch ? `Vite root ${rootMatch[2]}` : `Vite config boundary ${directory}` }];
  }
  if (!lowerName.startsWith('tsconfig') || !lowerName.endsWith('.json')) return [];

  const configuredPaths: Array<{ value: string; isFile?: boolean; source: string }> = [];
  let rootDir: string | undefined;
  try {
    const parsed = parseJsonc(loaded.source);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      const compilerOptions = record.compilerOptions;
      if (compilerOptions && typeof compilerOptions === 'object' && !Array.isArray(compilerOptions)) {
        const configuredRootDir = (compilerOptions as Record<string, unknown>).rootDir;
        if (typeof configuredRootDir === 'string') rootDir = configuredRootDir;
      }
      const include = record.include;
      if (typeof include === 'string') configuredPaths.push({ value: include, source: `TypeScript include ${include}` });
      if (Array.isArray(include)) include.filter((value): value is string => typeof value === 'string').forEach((value) => configuredPaths.push({ value, source: `TypeScript include ${value}` }));
      const files = record.files;
      if (typeof files === 'string') configuredPaths.push({ value: files, isFile: true, source: `TypeScript file ${files}` });
      if (Array.isArray(files)) files.filter((value): value is string => typeof value === 'string').forEach((value) => configuredPaths.push({ value, isFile: true, source: `TypeScript file ${value}` }));
    }
  } catch {
    // A malformed config is still useful as a file-local TypeScript signal.
  }

  if (rootDir && (configuredPaths.length === 0 || rootDir !== '.')) {
    configuredPaths.unshift({ value: rootDir, source: `TypeScript rootDir ${rootDir}` });
  }

  const paths = configuredPaths
    .map((configured) => ({ path: resolveConfiguredScopePath(loaded.file.relativePath, configured.value, configured.isFile), description: configured.source }))
    .filter((binding): binding is { path: string; description: string } => Boolean(binding.path));
  if (paths.length > 0) {
    const unique = new Map(paths.map((binding) => [binding.path, binding]));
    return [...unique.values()];
  }
  // A config file inside an already-known package / solution is still
  // Usage Evidence, but its directory alone must not create a new Region.
  return directory === '.'
    ? [{ path: '.', description: 'TypeScript config at repository root' }]
    : [];
}

function addConfiguredTechnologyFact(builder: AnalyzerStoreBuilder, loaded: LoadedSource, stackId: string, description: string, labelOverride?: string): void {
  const bindings = configuredScopeBindings(loaded);
  if (bindings.length === 0) {
    const evidenceId = createFileEvidence(builder, loaded.file.relativePath, loaded.source, 'technology', `${stackId}-config`, description, 'usage');
    addTechnologyFact(builder, stackId, undefined, evidenceId, true, labelOverride, 'configuration usage');
    return;
  }
  const evidenceIds = bindings.flatMap((binding, index) => {
    const suffix = index === 0 ? '' : `:${index}`;
    const usageEvidenceId = createFileEvidence(
      builder,
      loaded.file.relativePath,
      loaded.source,
      'technology',
      `${stackId}-config${suffix}`,
      `${description} · ${binding.description}`,
      'usage',
      binding.path,
    );
    const scopeEvidenceId = createFileEvidence(
      builder,
      loaded.file.relativePath,
      loaded.source,
      'technology',
      `${stackId}-scope${suffix}`,
      `Scope boundary · ${binding.description}`,
      'scope',
      binding.path,
    );
    return [usageEvidenceId, scopeEvidenceId];
  });
  addTechnologyFact(builder, stackId, undefined, evidenceIds, true, labelOverride, 'configuration usage');
}

function packageRootForImport(specifier: string): string | undefined {
  const normalized = specifier.trim();
  if (!normalized || normalized.startsWith('.') || normalized.startsWith('/')) return undefined;
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length === 0) return undefined;
  return normalized.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/**
 * Finds only statically identifiable package imports. This deliberately does
 * not attempt AST, call-flow, or transitive dependency analysis.
 */
function processSourceImports(builder: AnalyzerStoreBuilder, loaded: LoadedSource): void {
  const importPattern = /\b(?:import\s+(?:type\s+)?(?:[^'"\n]*?\s+from\s+)?|export\s+(?:[^'"\n]*?\s+from\s+)?|require\s*\(\s*|import\s*\(\s*)['"]([^'"]+)['"]/g;
  let match = importPattern.exec(loaded.source);
  while (match) {
    const specifier = match[1] ?? '';
    const packageName = packageRootForImport(specifier);
    const stack = packageName ? technologyForPackageName(packageName) : undefined;
    if (packageName && stack) {
      const specifierStart = match.index + match[0].lastIndexOf(specifier);
      const evidenceId = createEvidence(
        builder,
        loaded.file.relativePath,
        loaded.source,
        { start: specifierStart, end: specifierStart + specifier.length },
        'technology',
        'source-import',
        `Source import usage: ${specifier}`,
        'usage',
      );
      addTechnologyFact(builder, stack.id, packageName, evidenceId, false, stack.id === 'firebase' ? 'Firebase' : undefined, 'source import');
    }
    match = importPattern.exec(loaded.source);
  }
}

function addPackageDependencies(
  builder: AnalyzerStoreBuilder,
  parsed: ParsedPackageJson,
  source: string,
  packageStates: Map<string, PackageState>,
): void {
  const ownerId = packageIdForPath(parsed.packagePath);
  const ownerState = packageStates.get(parsed.packagePath);
  if (!ownerState?.isWorkspacePackage) return;
  const declarations: PackageDependencyDeclaration[] = [];

  parsed.dependencies.forEach((dependency) => {
    const evidenceId = createEvidence(builder, parsed.filePath, source, dependency.propertyRange, 'dependency', 'package-dependency', `${dependency.dependencyType}: ${dependency.packageName}`, 'declaration');
    declarations.push(dependencyDeclaration(dependency, parsed.filePath, evidenceId));
    const workspaceTarget = dependency.versionRange.startsWith('workspace:')
      ? [...packageStates.values()].find((candidate) => candidate.isWorkspacePackage && candidate.parsed.name === dependency.packageName)
      : undefined;
    const dependencyType: AnalyzerDependencyType = workspaceTarget ? 'workspaceDependency' : dependency.dependencyType;
    let targetId: string;
    if (workspaceTarget) targetId = workspaceTarget.packageId;
    else {
      const stack = technologyForPackageName(dependency.packageName);
      targetId = stack
        ? addTechnologyFact(builder, stack.id, dependency.packageName, evidenceId, false, stack.id === 'firebase' ? 'Firebase' : undefined)
        : addExternalPackageFact(builder, dependency, evidenceId);
    }
    addRelation(builder, ownerId, targetId, 'depends-on', evidenceId ? [evidenceId] : [], {
      dependencyType,
      packageName: dependency.packageName,
      versionRange: dependency.versionRange,
    }, `${dependency.dependencyType}`);
    if (dependency.versionRange.startsWith('workspace:') && !workspaceTarget) {
      addWarning(builder, `Workspace dependency ${dependency.packageName} did not match a discovered workspace package`, parsed.filePath, 'workspace-dependency');
    }
  });

  const existing = builder.getFact(ownerId);
  if (existing?.kind === 'workspace-package') {
    builder.addFact({ ...existing, dependencies: declarations });
  }
}

function processPackageManager(builder: AnalyzerStoreBuilder, parsed: ParsedPackageJson, source: string): void {
  if (!parsed.packageManager || !parsed.packageManager.toLowerCase().startsWith('pnpm')) return;
  const evidenceId = createEvidence(builder, parsed.filePath, source, parsed.packageManagerRange, 'technology', 'package-manager', 'pnpm packageManager declaration', 'declaration');
  addTechnologyFact(builder, 'pnpm', 'pnpm', evidenceId, true);
}

function processConfigTechnology(builder: AnalyzerStoreBuilder, loaded: LoadedSource): void {
  if (loaded.file.name.toLowerCase().startsWith('vite.config.')) {
    addConfiguredTechnologyFact(builder, loaded, 'vite', 'Vite configuration file');
  } else if (loaded.file.name.toLowerCase().startsWith('tsconfig') && loaded.file.name.toLowerCase().endsWith('.json')) {
    addConfiguredTechnologyFact(builder, loaded, 'typescript', 'TypeScript configuration file');
  }
}

function processWrangler(
  builder: AnalyzerStoreBuilder,
  loaded: LoadedSource,
  packageStates: Map<string, PackageState>,
): void {
  let parsed;
  try {
    parsed = parseWranglerConfig(loaded.file.relativePath, loaded.source);
  } catch {
    addWarning(builder, `Could not parse ${loaded.file.relativePath}`, loaded.file.relativePath, 'wrangler-parser');
    return;
  }
  if (!parsed.workerName && !parsed.main && parsed.d1Bindings.length === 0 && parsed.b2KeyRanges.length === 0) return;
  const packageState = findNearestPackage(loaded.file.relativePath, packageStates);
  const packageId = packageState?.packageId;
  const workerEvidenceIds = [
    createEvidence(builder, loaded.file.relativePath, loaded.source, parsed.workerNameRange, 'runtime', 'cloudflare-worker', 'Cloudflare Worker name', 'usage'),
    createEvidence(builder, loaded.file.relativePath, loaded.source, parsed.mainRange, 'runtime', 'cloudflare-worker', 'Cloudflare Worker entrypoint', 'usage'),
  ].filter((value): value is string => Boolean(value));
  const runtimeId = `runtime:cloudflare-workers:${loaded.file.relativePath}`;
  const runtime: RuntimeFact = {
    id: runtimeId,
    kind: 'runtime',
    label: 'Cloudflare Workers',
    filePath: loaded.file.relativePath,
    evidenceIds: workerEvidenceIds,
    metadata: {
      runtime: 'Cloudflare Workers',
      dictionaryStackId: 'cloudflare-workers',
      ...(parsed.workerName ? { workerName: parsed.workerName } : {}),
      ...(parsed.main ? { main: parsed.main } : {}),
      configPath: loaded.file.relativePath,
    },
    runtimeType: 'cloudflare-workers',
    ...(packageId ? { packageId } : {}),
    configPath: loaded.file.relativePath,
  };
  builder.addFact(runtime);
  if (packageId) addRelation(builder, packageId, runtimeId, 'uses', workerEvidenceIds, { source: loaded.file.relativePath });

  parsed.d1Bindings.forEach((binding, index) => {
    const evidenceId = createEvidence(builder, loaded.file.relativePath, loaded.source, binding.range, 'resource', 'cloudflare-d1', 'Cloudflare D1 binding', 'usage');
    const bindingName = binding.binding ?? binding.databaseName ?? binding.databaseId ?? `binding-${index + 1}`;
    const resourceId = `resource:${loaded.file.relativePath}:d1:${bindingName}`;
    const resource: ResourceFact = {
      id: resourceId,
      kind: 'resource',
      label: `Cloudflare D1 · ${bindingName}`,
      filePath: loaded.file.relativePath,
      evidenceIds: evidenceId ? [evidenceId] : [],
      metadata: {
        resourceType: 'database',
        dictionaryStackId: 'cloudflare-d1',
        binding: bindingName,
        ...(binding.databaseName ? { databaseName: binding.databaseName } : {}),
        ...(binding.databaseId ? { databaseId: binding.databaseId } : {}),
      },
      resourceType: 'database',
      binding: bindingName,
      dictionaryStackId: 'cloudflare-d1',
      ...(packageId ? { packageId } : {}),
    };
    builder.addFact(resource);
    addRelation(builder, runtimeId, resourceId, 'binds-to', evidenceId ? [evidenceId] : [], { binding: bindingName });
  });

  if (parsed.b2KeyRanges.length > 0) {
    const evidenceId = createEvidence(builder, loaded.file.relativePath, loaded.source, parsed.b2KeyRanges[0].range, 'resource', 'backblaze-b2', 'Explicit Backblaze B2 configuration key', 'usage');
    const resourceId = `resource:${loaded.file.relativePath}:b2`;
    const resource: ResourceFact = {
      id: resourceId,
      kind: 'resource',
      label: 'Backblaze B2',
      filePath: loaded.file.relativePath,
      evidenceIds: evidenceId ? [evidenceId] : [],
      metadata: {
        resourceType: 'storage',
        dictionaryStackId: 'backblaze-b2',
        detectedKeys: parsed.b2KeyRanges.map((entry) => entry.key),
      },
      resourceType: 'storage',
      dictionaryStackId: 'backblaze-b2',
      ...(packageId ? { packageId } : {}),
    };
    builder.addFact(resource);
    addRelation(builder, runtimeId, resourceId, 'binds-to', evidenceId ? [evidenceId] : [], { keys: parsed.b2KeyRanges.map((entry) => entry.key) });
  }
}

function processFirebase(builder: AnalyzerStoreBuilder, loaded: LoadedSource, packageStates: Map<string, PackageState>): void {
  const lowerPath = loaded.file.relativePath.toLowerCase();
  if (!lowerPath.endsWith('firebase.json') && !lowerPath.endsWith('.firebaserc')) return;
  let parsed;
  try {
    parsed = parseFirebaseConfig(loaded.source);
  } catch {
    addWarning(builder, `Could not parse ${loaded.file.relativePath}`, loaded.file.relativePath, 'firebase-parser');
    return;
  }
  const packageState = findNearestPackage(loaded.file.relativePath, packageStates);
  const packageId = packageState?.packageId;
  const firebaseEvidence = createFileEvidence(builder, loaded.file.relativePath, loaded.source, 'technology', 'firebase-config', 'Firebase configuration', 'usage');
  const technologyId = addTechnologyFact(builder, 'firebase', undefined, firebaseEvidence, true, 'Firebase');
  if (packageId) addRelation(builder, packageId, technologyId, 'uses', [firebaseEvidence], { source: loaded.file.relativePath });

  if (parsed.authEmulatorRange) {
    const evidenceId = createEvidence(builder, loaded.file.relativePath, loaded.source, parsed.authEmulatorRange, 'resource', 'firebase-auth-emulator', 'Firebase Auth emulator configuration', 'usage');
    const resourceId = `resource:${loaded.file.relativePath}:firebase-auth`;
    const resource: ResourceFact = {
      id: resourceId,
      kind: 'resource',
      label: 'Firebase Auth Emulator',
      filePath: loaded.file.relativePath,
      evidenceIds: evidenceId ? [evidenceId] : [],
      metadata: { resourceType: 'auth', dictionaryStackId: 'firebase-authentication' },
      resourceType: 'auth',
      dictionaryStackId: 'firebase-authentication',
      ...(packageId ? { packageId } : {}),
    };
    builder.addFact(resource);
    if (packageId) addRelation(builder, packageId, resourceId, 'binds-to', evidenceId ? [evidenceId] : [], { source: loaded.file.relativePath });
  }
}

function processDotnet(builder: AnalyzerStoreBuilder, loaded: LoadedSource): void {
  const lowerName = loaded.file.name.toLowerCase();
  if (!lowerName.endsWith('.csproj') && !lowerName.endsWith('.sln') && !lowerName.endsWith('.slnx')) return;
  const parsed = parseDotnetProject(loaded.source);
  const evidenceIds = [
    createEvidence(builder, loaded.file.relativePath, loaded.source, parsed.projectNameRange, 'project', 'dotnet-project', '.NET project name'),
    createEvidence(builder, loaded.file.relativePath, loaded.source, parsed.useWpfRange, 'project', 'dotnet-wpf', 'UseWPF project property'),
  ].filter((value): value is string => Boolean(value));
  if (evidenceIds.length === 0) evidenceIds.push(createFileEvidence(builder, loaded.file.relativePath, loaded.source, 'project', 'dotnet-project', '.NET project file'));
  const fallbackName = loaded.file.name.replace(/\.(?:csproj|slnx?|)$/i, '');
  const fact: DotnetProjectFact = {
    id: `dotnet-project:${loaded.file.relativePath}`,
    kind: 'dotnet-project',
    label: parsed.projectName ?? fallbackName,
    filePath: loaded.file.relativePath,
    evidenceIds,
    metadata: {
      path: loaded.file.relativePath,
      projectName: parsed.projectName ?? fallbackName,
      useWpf: parsed.useWpf,
      ...(parsed.projectReferences.length > 0 ? { projectReferences: parsed.projectReferences.map((reference) => reference.include) } : {}),
    },
    projectPath: loaded.file.relativePath,
    projectName: parsed.projectName ?? fallbackName,
    useWpf: parsed.useWpf,
    projectReferences: parsed.projectReferences.map((reference) => reference.include),
  };
  builder.addFact(fact);
  parsed.projectReferences.forEach((reference, index) => {
    const evidenceId = createEvidence(builder, loaded.file.relativePath, loaded.source, reference.range, 'project', 'dotnet-project-reference', `ProjectReference ${reference.include}`);
    addRelation(builder, fact.id, `dotnet-project:${resolveRelativePath(loaded.file.relativePath, reference.include)}`, 'uses', evidenceId ? [evidenceId] : [], { projectReference: reference.include }, `${index}`);
  });
}

export async function scanProjectFiles(files: AnalyzerSourceFile[]): Promise<AnalyzerProjectStore> {
  const builder = new AnalyzerStoreBuilder();
  const loadedSources = await loadSources(files, builder);
  const byPath = new Map(loadedSources.map((entry) => [entry.file.relativePath, entry]));
  const packageSources = loadedSources.filter((entry) => isNamedFile(entry.file.relativePath, 'package.json'));
  const parsedPackages: ParsedPackageJson[] = [];
  packageSources.forEach((entry) => {
    try {
      const parsed = parsePackageJson(entry.file.relativePath, entry.source);
      parsedPackages.push(parsed);
      addManifestFact(builder, parsed, entry.source);
    } catch {
      addWarning(builder, `Could not parse ${entry.file.relativePath}`, entry.file.relativePath, 'package-json-parser', 'error');
    }
  });

  const workspaceSources = loadedSources.filter((entry) => isNamedFile(entry.file.relativePath, 'pnpm-workspace.yaml') || isNamedFile(entry.file.relativePath, 'pnpm-workspace.yml'));
  const workspace: WorkspaceState = { patterns: [] };
  if (workspaceSources.length > 0) {
    const selectedWorkspace = workspaceSources.sort((a, b) => a.file.relativePath.length - b.file.relativePath.length)[0];
    try {
      workspace.config = parsePnpmWorkspace(selectedWorkspace.file.relativePath, selectedWorkspace.source);
      workspace.patterns = workspace.config.patterns;
    } catch {
      addWarning(builder, `Could not parse ${selectedWorkspace.file.relativePath}`, selectedWorkspace.file.relativePath, 'pnpm-workspace-parser', 'error');
    }
    if (workspaceSources.length > 1) addWarning(builder, 'Multiple pnpm workspace files found; the shortest path was used', selectedWorkspace.file.relativePath, 'pnpm-workspace');
  }

  const rootPackage = parsedPackages.find((parsed) => parsed.packagePath === '.');
  const rootSource = rootPackage ? byPath.get(rootPackage.filePath) : undefined;
  addProjectFact(builder, rootPackage, rootSource, loadedSources[0]);
  const workspaceLinks = addWorkspaceFacts(builder, 'project:root', workspace);

  const packageStates = new Map<string, PackageState>();
  parsedPackages.forEach((parsed) => {
    const isWorkspacePackage = parsed.packagePath === '.' || matchesWorkspacePatterns(parsed.packagePath, workspace.patterns.map((pattern) => pattern.pattern));
    packageStates.set(parsed.packagePath, { parsed, packageId: packageIdForPath(parsed.packagePath), isWorkspacePackage });
    const source = byPath.get(parsed.filePath)?.source ?? '';
    if (!isWorkspacePackage) return;
    const packageFact = makeWorkspacePackageFact(parsed, source, builder, parsed.packagePath === '.');
    if (workspaceLinks.patternIds.length > 0 && parsed.packagePath !== '.') {
      workspaceLinks.patternIds.forEach((patternId, index) => {
        const pattern = workspace.patterns[index];
        if (pattern && isPositiveWorkspacePattern(pattern.pattern) && globToRegExp(pattern.pattern).test(parsed.packagePath)) {
          const evidenceId = builder.getFact(patternId)?.evidenceIds[0];
          addRelation(builder, patternId, packageFact.id, 'matches', evidenceId ? [evidenceId] : [], { packagePath: parsed.packagePath });
        }
      });
    }
    processPackageManager(builder, parsed, source);
  });

  parsedPackages.forEach((parsed) => addPackageDependencies(builder, parsed, byPath.get(parsed.filePath)?.source ?? '', packageStates));

  loadedSources.forEach((loaded) => {
    processConfigTechnology(builder, loaded);
    if (!isConfigFile(loaded.file)) processSourceImports(builder, loaded);
    if (loaded.file.name.toLowerCase().startsWith('wrangler.')) processWrangler(builder, loaded, packageStates);
    processFirebase(builder, loaded, packageStates);
    processDotnet(builder, loaded);
  });

  const projectFact = builder.getFact('project:root');
  if (projectFact?.kind === 'project') {
    packageStates.forEach((state) => {
      if (state.isWorkspacePackage) addRelation(builder, projectFact.id, state.packageId, 'contains', state.parsed.nameRange ? [makeEvidence(state.parsed.filePath, byPath.get(state.parsed.filePath)?.source ?? '', state.parsed.nameRange, 'manifest', 'project-package', 'Workspace package')].map((evidence) => builder.addEvidence(evidence)) : [], { packagePath: state.parsed.packagePath });
    });
    builder.forEachFact((fact) => {
      if (fact.kind === 'dotnet-project' || fact.kind === 'runtime' || fact.kind === 'resource' || (fact.kind === 'technology' && fact.explicit)) {
        addRelation(builder, projectFact.id, fact.id, 'contains', fact.evidenceIds, { kind: fact.kind });
      }
    });
  }

  return builder.build(files);
}
