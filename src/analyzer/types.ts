export type AnalyzerViewId = 'architecture' | 'workspace' | 'command' | 'dependencies' | 'module-dependency';

export type AnalyzerFactKind =
  | 'project'
  | 'workspace-config'
  | 'workspace-pattern'
  | 'workspace-package'
  | 'package-manifest'
  | 'package-script'
  | 'command'
  | 'external-package'
  | 'technology'
  | 'runtime'
  | 'resource'
  | 'dotnet-project'
  | 'module'
  | 'module-dependency'
  | 'module-directory';

export type AnalyzerEvidenceKind =
  | 'manifest'
  | 'workspace'
  | 'script'
  | 'dependency'
  | 'technology'
  | 'runtime'
  | 'resource'
  | 'project'
  | 'module';

/** Describes how an Evidence item participates in Stack Map attribution. */
export type AnalyzerEvidenceRole = 'declaration' | 'usage' | 'scope';

/** Describes the strength of a signal considered for Semantic Region promotion. */
export type AnalyzerScopeEvidenceStrength = 'structural' | 'explicit-boundary' | 'usage-only';

export type AnalyzerDependencyType = 'dependency' | 'devDependency' | 'peerDependency' | 'optionalDependency' | 'workspaceDependency';

export type AnalyzerModuleDependencyKind = 'import' | 'import-type' | 're-export' | 'dynamic-import' | 'require';

export interface AnalyzerModuleImportReference {
  kind: AnalyzerModuleDependencyKind;
  specifier: string;
  start: number;
  end: number;
  resolvedPath?: string;
  reason?: 'computed' | 'unresolved' | 'external' | 'ambiguous';
}

export type AnalyzerRelationKind =
  | 'contains'
  | 'uses'
  | 'binds-to'
  | 'uses-config'
  | 'declares'
  | 'matches'
  | 'depends-on'
  | 'resolves-to'
  | 'executes'
  | 'starts'
  | 'runs-in'
  | 'expands-to'
  | 'imports';

export type AnalyzerNodeType =
  | 'project'
  | 'stack-scope'
  | 'stack-usage'
  | 'application'
  | 'workspace-package'
  | 'workspace-config'
  | 'workspace-pattern'
  | 'package-script'
  | 'command'
  | 'external-package'
  | 'technology'
  | 'runtime'
  | 'resource'
  | 'dotnet-project'
  | 'module';

export type AnalyzerRegionKind = 'scope' | 'runtime' | 'subsystem' | 'module-group' | 'workspace-package' | 'directory';
export type AnalyzerRegionScopeKind = 'physical' | 'logical';
export type AnalyzerRegionPortSide = 'top' | 'right' | 'bottom' | 'left';

export type AnalyzerFilter =
  | 'all'
  | 'stack-scope'
  | 'stack-usage'
  | 'application'
  | 'workspace-package'
  | 'workspace-config'
  | 'workspace-pattern'
  | 'package-script'
  | 'command'
  | 'technology'
  | 'runtime'
  | 'resource'
  | 'dotnet-project'
  | 'external-package'
  | 'module';

export type AnalyzerMetadataValue = string | number | boolean | string[] | undefined;
export type AnalyzerMetadata = Record<string, AnalyzerMetadataValue>;

export interface SourcePosition {
  line: number;
  column: number;
}

export interface SourceRange {
  start: SourcePosition;
  end: SourcePosition;
}

export interface AnalyzerEvidence {
  id: string;
  filePath: string;
  contextStartLine: number;
  contextEndLine: number;
  highlightRanges: SourceRange[];
  kind: AnalyzerEvidenceKind;
  detectorId: string;
  /** Declaration, actual usage, or an explicit scope boundary signal. */
  role?: AnalyzerEvidenceRole;
  /** Repository-relative scope path supplied by an explicit config boundary. */
  scopePath?: string;
  /** Promotion strength; usage-only signals never create a Semantic Region. */
  scopeStrength?: AnalyzerScopeEvidenceStrength;
  description?: string;
}

export interface AnalyzerWarning {
  id: string;
  message: string;
  severity: 'warning' | 'error';
  filePath?: string;
  detectorId?: string;
}

export interface AnalyzerSourceFile {
  relativePath: string;
  name: string;
  extension: string;
  size: number;
  readText: () => Promise<string>;
}

export interface PackageDependencyDeclaration {
  packageName: string;
  versionRange: string;
  dependencyType: AnalyzerDependencyType;
  sourcePath: string;
  valueStartOffset: number;
  valueEndOffset: number;
  evidenceId?: string;
}

export interface AnalyzerFactBase {
  id: string;
  kind: AnalyzerFactKind;
  label: string;
  filePath?: string;
  evidenceIds: string[];
  metadata: AnalyzerMetadata;
}

export interface ProjectFact extends AnalyzerFactBase {
  kind: 'project';
  relativePath: '.';
}

export interface WorkspaceConfigFact extends AnalyzerFactBase {
  kind: 'workspace-config';
  manager: 'pnpm';
  patterns: string[];
}

export interface WorkspacePatternFact extends AnalyzerFactBase {
  kind: 'workspace-pattern';
  pattern: string;
  configId: string;
}

export interface PackageManifestFact extends AnalyzerFactBase {
  kind: 'package-manifest';
  packagePath: string;
  packageId: string;
}

export interface WorkspacePackageFact extends AnalyzerFactBase {
  kind: 'workspace-package';
  packagePath: string;
  packageName: string;
  manifestPath: string;
  scripts: Record<string, string>;
  dependencies: PackageDependencyDeclaration[];
  isRoot: boolean;
}

export interface PackageScriptFact extends AnalyzerFactBase {
  kind: 'package-script';
  packageId: string;
  packagePath: string;
  packageName: string;
  scriptName: string;
  command: string;
  sourcePath: string;
  commandStartOffset: number;
  commandEndOffset: number;
}

export interface CommandFact extends AnalyzerFactBase {
  kind: 'command';
  commandType: 'pnpm-script' | 'pnpm-exec' | 'cli' | 'concurrently' | 'unknown';
  command: string;
  packageId?: string;
  scriptName?: string;
}

export interface ExternalPackageFact extends AnalyzerFactBase {
  kind: 'external-package';
  packageName: string;
  versionRanges: string[];
  dependencyTypes: AnalyzerDependencyType[];
}

export interface TechnologyFact extends AnalyzerFactBase {
  kind: 'technology';
  dictionaryStackId?: string;
  packageNames: string[];
  explicit: boolean;
}

export interface RuntimeFact extends AnalyzerFactBase {
  kind: 'runtime';
  runtimeType: string;
  packageId?: string;
  configPath?: string;
}

export interface ResourceFact extends AnalyzerFactBase {
  kind: 'resource';
  resourceType: 'database' | 'storage' | 'auth' | 'other';
  binding?: string;
  dictionaryStackId?: string;
  packageId?: string;
}

export interface DotnetProjectFact extends AnalyzerFactBase {
  kind: 'dotnet-project';
  projectPath: string;
  projectName: string;
  useWpf: boolean;
  projectReferences: string[];
}

export interface ModuleFact extends AnalyzerFactBase {
  kind: 'module';
  path: string;
  directoryId: string;
  directoryPath: string;
  packageId?: string;
  packagePath?: string;
  packageName?: string;
  language: string;
  extension: string;
  imports: AnalyzerModuleImportReference[];
  unresolvedImports: AnalyzerModuleImportReference[];
}

export interface ModuleDependencyFact extends AnalyzerFactBase {
  kind: 'module-dependency';
  fromModuleId: string;
  toModuleId: string;
  dependencyKind: AnalyzerModuleDependencyKind;
  specifier: string;
  sourcePath: string;
  targetPath: string;
}

export interface ModuleDirectoryFact extends AnalyzerFactBase {
  kind: 'module-directory';
  path: string;
  packageId?: string;
  parentDirectoryId?: string;
  childDirectoryIds: string[];
  moduleIds: string[];
  depth: number;
}

/** Descriptive alias for consumers that call source files Source Modules. */
export type SourceModuleFact = ModuleFact;

export type AnalyzerFact =
  | ProjectFact
  | WorkspaceConfigFact
  | WorkspacePatternFact
  | PackageManifestFact
  | WorkspacePackageFact
  | PackageScriptFact
  | CommandFact
  | ExternalPackageFact
  | TechnologyFact
  | RuntimeFact
  | ResourceFact
  | DotnetProjectFact
  | ModuleFact
  | ModuleDependencyFact
  | ModuleDirectoryFact;

export interface AnalyzerRelation {
  id: string;
  sourceId: string;
  targetId: string;
  kind: AnalyzerRelationKind;
  evidenceIds: string[];
  metadata: AnalyzerMetadata;
}

export interface AnalyzerProjectStore {
  files: AnalyzerSourceFile[];
  facts: AnalyzerFact[];
  relations: AnalyzerRelation[];
  evidence: AnalyzerEvidence[];
  sources: Record<string, string>;
  warnings: AnalyzerWarning[];
  scannedAt: string;
}

export interface AnalyzerViewNode {
  id: string;
  factId?: string;
  type: AnalyzerNodeType;
  label: string;
  subtitle?: string;
  clusterId?: string;
  evidenceIds: string[];
  metadata: AnalyzerMetadata;
  presentation?: AnalyzerNodePresentation;
}

export interface AnalyzerNodePresentation {
  role?: 'summary' | 'detail';
  parentId?: string;
  childNodeIds?: string[];
  hideWhenExpanded?: boolean;
}

export interface AnalyzerRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AnalyzerGraphPort {
  id: string;
  side: AnalyzerRegionPortSide;
}

export type GraphPort = AnalyzerGraphPort;

/** A selectable semantic container, kept separate from Nodes and Summaries. */
export interface AnalyzerSemanticRegion {
  id: string;
  entityKind: 'region';
  regionKind: AnalyzerRegionKind;
  label: string;
  subtitle?: string;
  childIds: string[];
  ports: AnalyzerGraphPort[];
  selectable: boolean;
  evidenceIds: string[];
  factId?: string;
  scopeKind?: AnalyzerRegionScopeKind;
  /** Nearest promoted Semantic Region containing this Region, when nested. */
  parentRegionId?: string;
  /** Direct promoted child Regions. Stack `childIds` remain direct Stack Usage nodes. */
  childRegionIds?: string[];
  /** Zero-based depth among promoted Regions. */
  depth?: number;
  /** Layout fills this after the region's children have been positioned. */
  bounds?: AnalyzerRect;
  metadata: AnalyzerMetadata;
}

export type SemanticRegion = AnalyzerSemanticRegion;

/** Capability-level endpoint shape shared by Node, Region, and Summary routing. */
export type AnalyzerSelection =
  | { kind: 'node'; id: string }
  | { kind: 'region'; id: string }
  | { kind: 'edge'; id: string }
  | { kind: 'summary'; id: string };

export interface AnalyzerPresentationGroup {
  id: string;
  label: string;
  count: number;
  countLabel: string;
  childNodeIds: string[];
  parentId?: string;
  expanded: boolean;
}

/** A view-level usage of one canonical Dictionary Stack inside one scope. */
export interface AnalyzerStackUsage {
  id: string;
  stackId: string;
  scopeId: string;
  evidenceIds: string[];
  sourceFactIds: string[];
  roles: string[];
}

export interface AnalyzerViewEdge {
  id: string;
  sourceId: string;
  targetId: string;
  kind: AnalyzerRelationKind;
  label: string;
  evidenceIds: string[];
  metadata: AnalyzerMetadata;
  presentation?: AnalyzerEdgePresentation;
}

export interface AnalyzerEdgePresentation {
  parentId?: string;
  initiallyHidden?: boolean;
  displayKind?: 'bundle';
  emphasis?: 'primary' | 'secondary' | 'deep';
}

export interface AnalyzerViewCounts {
  visibleNodes: number;
  totalNodes: number;
  hiddenNodes: number;
}

export interface AnalyzerCluster {
  id: string;
  label: string;
  nodeIds: string[];
  tone: 'neutral' | 'accent' | 'warm' | 'cool' | 'violet';
}

export interface AnalyzerViewModel {
  view: AnalyzerViewId;
  nodes: AnalyzerViewNode[];
  edges: AnalyzerViewEdge[];
  clusters: AnalyzerCluster[];
  regions?: AnalyzerSemanticRegion[];
  presentationGroups?: AnalyzerPresentationGroup[];
  stackUsages?: AnalyzerStackUsage[];
  counts?: AnalyzerViewCounts;
  evidence: AnalyzerEvidence[];
  warnings: AnalyzerWarning[];
  entryScriptId?: string;
  projectLabel?: string;
}

export const analyzerViewLabels: Record<AnalyzerViewId, string> = {
  architecture: 'Stack Map',
  workspace: 'Workspace Flow',
  command: 'Command Flow',
  dependencies: 'Package Dependency',
  'module-dependency': 'Module Dependency',
};

export const relationLabels: Record<AnalyzerRelationKind, string> = {
  contains: 'contains',
  uses: 'uses',
  'binds-to': 'binds-to',
  'uses-config': 'uses-config',
  declares: 'declares',
  matches: 'matches',
  'depends-on': 'depends-on',
  'resolves-to': 'resolves-to',
  executes: 'executes',
  starts: 'starts',
  'runs-in': 'runs-in',
  'expands-to': 'expands-to',
  imports: 'imports',
};

export const nodeTypeLabels: Record<AnalyzerNodeType, string> = {
  project: 'Project',
  'stack-scope': 'Scope / Area',
  'stack-usage': 'Stack Usage',
  application: 'Application',
  'workspace-package': 'Workspace Package',
  'workspace-config': 'Workspace Config',
  'workspace-pattern': 'Workspace Pattern',
  'package-script': 'Package Script',
  command: 'Command',
  'external-package': 'External Package',
  technology: 'Technology',
  runtime: 'Runtime / Platform',
  resource: 'Resource',
  'dotnet-project': '.NET Application',
  module: 'Module',
};

export function packageIdForPath(packagePath: string): string {
  return `package:${packagePath || '.'}`;
}

export function scriptIdFor(packageId: string, scriptName: string): string {
  return `script:${packageId}:${scriptName}`;
}
