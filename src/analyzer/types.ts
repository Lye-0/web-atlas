export type AnalyzerViewId = 'architecture' | 'workspace' | 'command' | 'dependencies';

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
  | 'dotnet-project';

export type AnalyzerEvidenceKind =
  | 'manifest'
  | 'workspace'
  | 'script'
  | 'dependency'
  | 'technology'
  | 'runtime'
  | 'resource'
  | 'project';

export type AnalyzerDependencyType = 'dependency' | 'devDependency' | 'peerDependency' | 'optionalDependency' | 'workspaceDependency';

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
  | 'expands-to';

export type AnalyzerNodeType =
  | 'project'
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
  | 'dotnet-project';

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
  | DotnetProjectFact;

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
  evidence: AnalyzerEvidence[];
  warnings: AnalyzerWarning[];
  entryScriptId?: string;
}

export const analyzerViewLabels: Record<AnalyzerViewId, string> = {
  architecture: 'Architecture Overview',
  workspace: 'Workspace Flow',
  command: 'Command Flow',
  dependencies: 'Package Dependency',
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
};

export const nodeTypeLabels: Record<AnalyzerNodeType, string> = {
  project: 'Project',
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
};

export function packageIdForPath(packagePath: string): string {
  return `package:${packagePath || '.'}`;
}

export function scriptIdFor(packageId: string, scriptName: string): string {
  return `script:${packageId}:${scriptName}`;
}
