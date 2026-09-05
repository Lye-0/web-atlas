import type { AnalyzerViewEdge, AnalyzerViewModel } from './types';

export type AnalyzerFocusEmphasis = 'primary' | 'secondary' | 'deep';

export function analyzerFocusDepths(view: AnalyzerViewModel, focusNodeId: string): ReadonlyMap<string, number> {
  if (!view.nodes.some((node) => node.id === focusNodeId)) return new Map();
  const adjacency = new Map<string, Set<string>>();
  view.nodes.forEach((node) => adjacency.set(node.id, new Set()));
  view.edges.forEach((edge) => {
    adjacency.get(edge.sourceId)?.add(edge.targetId);
    adjacency.get(edge.targetId)?.add(edge.sourceId);
  });

  const depths = new Map<string, number>([[focusNodeId, 0]]);
  const queue = [focusNodeId];
  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (!nodeId) continue;
    const nextDepth = (depths.get(nodeId) ?? 0) + 1;
    adjacency.get(nodeId)?.forEach((neighborId) => {
      if (depths.has(neighborId)) return;
      depths.set(neighborId, nextDepth);
      queue.push(neighborId);
    });
  }
  return depths;
}

export function analyzerFocusedEdgeEmphasis(
  view: AnalyzerViewModel,
  edge: AnalyzerViewEdge,
  selectedNodeId: string | undefined,
): AnalyzerFocusEmphasis | undefined {
  const fallback = edge.presentation?.emphasis;
  if (view.view !== 'architecture' || !selectedNodeId) return fallback;

  const degree = new Set(view.edges.flatMap((candidate) => {
    if (candidate.sourceId === selectedNodeId) return [candidate.targetId];
    if (candidate.targetId === selectedNodeId) return [candidate.sourceId];
    return [];
  })).size;
  if (degree < 4) return fallback;

  const depths = analyzerFocusDepths(view, selectedNodeId);
  const sourceDepth = depths.get(edge.sourceId);
  const targetDepth = depths.get(edge.targetId);
  if (sourceDepth === undefined || targetDepth === undefined) return fallback;
  const edgeDepth = Math.max(sourceDepth, targetDepth);
  if (edgeDepth <= 1) return 'primary';
  if (edgeDepth === 2) return 'secondary';
  return 'deep';
}
