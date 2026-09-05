export const semanticViewIds = ['runtime-flow', 'function-call-flow', 'data-flow', 'data-model', 'architecture-map'] as const;
export type SemanticViewId = typeof semanticViewIds[number];
export const isSemanticView = (id: string): id is SemanticViewId => (semanticViewIds as readonly string[]).includes(id);
export type SemanticConfidence = 'source' | 'inferred' | 'observed' | 'unresolved';
export type SemanticKind = 'function' | 'entry' | 'request' | 'operation' | 'value' | 'model' | 'resource' | 'subsystem' | 'external' | 'span' | 'log';
export interface SemanticEvidence { path: string; start: number; end: number; line: number; endLine: number; description: string }
export interface SemanticField { name: string; type: string; optional: boolean; key?: 'primary' | 'foreign'; target?: string }
export interface SemanticNode {
  id: string; kind: SemanticKind; label: string; path?: string; line?: number; endLine?: number;
  language?: string; group: string; confidence: SemanticConfidence; evidence: SemanticEvidence[];
  signature?: string; fields?: SemanticField[]; attributes: Record<string, string | number | boolean | string[]>;
}
export interface SemanticEdge {
  id: string; source: string; target: string; label: string; kind: string;
  views: SemanticViewId[]; confidence: SemanticConfidence; evidence: SemanticEvidence[];
}
export interface SemanticCoverage { path: string; language: string; status: 'parsed' | 'partial' | 'unsupported' | 'skipped'; message?: string }
export interface SemanticAnalysis {
  nodes: SemanticNode[]; edges: SemanticEdge[]; coverage: SemanticCoverage[]; warnings: string[];
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
