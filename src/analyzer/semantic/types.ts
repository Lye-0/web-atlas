export const semanticViewIds = ['runtime-flow', 'function-call-flow', 'data-flow', 'data-model', 'architecture-map'] as const;
export type SemanticViewId = typeof semanticViewIds[number];
export type SemanticExplorerViewId = SemanticViewId;
export const isSemanticView = (id: string): id is SemanticViewId => (semanticViewIds as readonly string[]).includes(id);
export type SemanticConfidence = 'source' | 'inferred' | 'observed' | 'unresolved';
export type SemanticKind = 'function' | 'entry' | 'request' | 'operation' | 'value' | 'model' | 'resource' | 'subsystem' | 'external' | 'span' | 'log';
export interface SemanticEvidence { path: string; start: number; end: number; line: number; endLine: number; description: string }
export interface SemanticField {
  name: string; type: string; optional: boolean; key?: 'primary' | 'foreign'; target?: string;
  id?: string; nullable?: boolean; allowsUndefined?: boolean; array?: boolean; readonly?: boolean;
  access?: 'public' | 'protected' | 'private'; static?: boolean; default?: string;
  defaultSource?: 'code' | 'validation' | 'database'; evidence?: SemanticEvidence[];
  sourceModelId?: string; origin?: string; referenceIds?: string[]; constraints?: string[];
}
export interface SemanticModel {
  domain: 'code' | 'validation' | 'storage';
  kind: 'interface' | 'object' | 'class' | 'literal-union' | 'union' | 'alias' | 'derived' | 'schema' | 'table' | 'enum';
  definition: string; expansion: 'expanded' | 'partial' | 'unexpanded' | 'failed'; reasons: string[];
  choices?: { label: string; fields?: SemanticField[]; evidence: SemanticEvidence[] }[];
  methods?: { name: string; signature: string; evidence: SemanticEvidence[] }[];
  constraints?: { id: string; kind: 'primary-key' | 'foreign-key' | 'unique' | 'index' | 'check' | 'orm-relation'; columns: string[]; targetModelId?: string; targetColumns?: string[]; expression: string; evidence: SemanticEvidence[] }[];
}
export interface SemanticData {
  role: 'declaration' | 'assignment' | 'use' | 'property-read' | 'property-write' | 'argument' | 'parameter' | 'return' | 'termination' | 'call-result' | 'operation' | 'literal' | 'unknown';
  expression: string; declarationId?: string; objectId?: string; propertyPath?: string[];
  callSiteId?: string; argumentIndex?: number; contextId?: string; conditional?: boolean;
  resolution?: 'resolved' | 'unresolved' | 'partial'; reasons?: string[];
}
export interface SemanticCrossLink { targetId: string; view: 'data-flow' | 'data-model'; reason: string; fieldId?: string; evidence: SemanticEvidence[] }
export interface SemanticNode {
  architecture?: import('./architecture').ArchitectureEntity;
  id: string; kind: SemanticKind; label: string; path?: string; line?: number; endLine?: number;
  language?: string; group: string; confidence: SemanticConfidence; evidence: SemanticEvidence[];
  signature?: string; fields?: SemanticField[]; attributes: Record<string, string | number | boolean | string[]>;
  model?: SemanticModel; data?: SemanticData; links?: SemanticCrossLink[];
}
export interface SemanticEdge {
  id: string; source: string; target: string; label: string; kind: string;
  views: SemanticViewId[]; confidence: SemanticConfidence; evidence: SemanticEvidence[];
  /** Original source relations behind a display aggregate or compressed runtime path. */
  provenance?: { edges: SemanticRelationSource[]; intermediateNodeIds?: string[] };
  details?: { environment?: string; reason?: string; callSiteId?: string; argumentIndex?: number; fieldId?: string; propertyPath?: string[]; conditional?: boolean; contextId?: string; sourceEdgeIds?: string[] };
}
export type SemanticRelationSource = Pick<SemanticEdge, 'id' | 'source' | 'target' | 'kind' | 'label' | 'confidence' | 'evidence'>;
export interface SemanticCoverage { path: string; language: string; status: 'parsed' | 'partial' | 'unsupported' | 'skipped'; message?: string }
export interface SemanticAnalysis {
  architecture?: import('./architecture').ArchitectureModel;
  nodes: SemanticNode[]; edges: SemanticEdge[]; coverage: SemanticCoverage[]; warnings: string[];
  /** Pre-refinement fields used only by the accepted Runtime / Function Call detail presentation. */
  flowFieldsByNode?: Record<string, SemanticField[]>;
  stats: { files: number; functions: number; models: number; unresolved: number; elapsedMs: number };
}
export interface SemanticInput {
  sources: Record<string, string>;
  imports: { from: string; to: string; specifier: string }[];
  resources: { id: string; label: string; type: string; path?: string; binding?: string; entryPath?: string; evidence?: SemanticEvidence[] }[];
}
export interface SemanticGraph { view: SemanticViewId; nodes: SemanticNode[]; edges: SemanticEdge[]; }

export const confidenceLabels: Record<SemanticConfidence, string> = { source: 'ソースで確認', inferred: '推定', observed: '実測', unresolved: '未解決' };
export const kindLabels: Record<SemanticKind, string> = { function: 'Function', entry: 'Entry point', request: 'API request', operation: 'Operation', value: 'Data', model: 'Model / Schema', resource: 'Resource', subsystem: 'Subsystem', external: 'External call', span: 'Span', log: 'Log' };
export const semanticQuestions: Record<SemanticViewId, string> = {
  'runtime-flow': 'どこから処理が始まり、どの実行環境・サービスへ進むか',
  'function-call-flow': 'どの関数が、どの関数を呼び出すか',
  'data-flow': 'データがどこで生まれ、変換され、どこへ渡るか',
  'data-model': 'Type・Schema・Entity・Tableが、どのような構造と関係を持つか',
  'architecture-map': 'システムがどのような責務・Subsystemで構成されているか',
};
