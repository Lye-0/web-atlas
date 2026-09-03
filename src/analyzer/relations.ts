import type { AnalyzerRelationKind, AnalyzerViewEdge } from './types';

export const analyzerRelationInverseLabels: Record<AnalyzerRelationKind, string> = {
  contains: 'contained-by',
  uses: 'used-by',
  'binds-to': 'bound-from',
  'uses-config': 'config-for',
  declares: 'declared-by',
  matches: 'matched-by',
  'depends-on': 'used-by',
  'resolves-to': 'resolved-from',
  executes: 'executed-by',
  starts: 'started-by',
  'runs-in': 'hosts',
  'expands-to': 'expanded-by',
  imports: 'imported-by',
};

export function relationLabelForNode(edge: Pick<AnalyzerViewEdge, 'sourceId' | 'targetId' | 'kind' | 'label'>, nodeId: string): string {
  if (edge.sourceId === nodeId) return edge.label;
  if (edge.targetId === nodeId) return analyzerRelationInverseLabels[edge.kind];
  return edge.label;
}
