import type { AnalyzerGraph3D } from './graph3D';
import type { AnalyzerViewSession } from './session';
import { analyzerDirectionColors, analyzerEdgeDirection } from './edgeDirection';

/** Resolve typed selection to existing relation endpoints, never to invented edges. */
export function graph3DSelectionContext(graph: AnalyzerGraph3D, state: Pick<AnalyzerViewSession, 'selectedNodeId' | 'selectedRegionId' | 'selectedEdgeId'>) {
  const ids = new Set<string>();
  if (state.selectedNodeId) {
    ids.add(state.selectedNodeId);
    const node = graph.source.nodes.find(node => node.id === state.selectedNodeId);
    if (node?.presentation?.role === 'summary') node.presentation.childNodeIds?.forEach(id => ids.add(id));
    if (graph.source.view === 'architecture') for (const region of graph.regions) if (region.memberIds.includes(state.selectedNodeId)) ids.add(region.original.id);
  }
  if (state.selectedRegionId) {
    ids.add(state.selectedRegionId);
    const region = graph.regions.find(region => region.original.id === state.selectedRegionId);
    region?.memberIds.forEach(id => ids.add(id));
    if (graph.source.view === 'architecture') {
      let parent = region?.original.parentRegionId;
      while (parent && !ids.has(parent)) { ids.add(parent); parent = graph.regions.find(region => region.original.id === parent)?.original.parentRegionId; }
    }
  }
  const edges = graph.edges.filter(edge => edge.id === state.selectedEdgeId || Boolean(analyzerEdgeDirection(edge.sourceId, edge.targetId, ids))
    && !(graph.source.view === 'module-dependency' && state.selectedRegionId && ids.has(edge.sourceId) && ids.has(edge.targetId)));
  return { ids, edges };
}

export function graph3DRelationColor(source: string, target: string, ids: ReadonlySet<string>, explicitSelection = false) {
  const direction = analyzerEdgeDirection(source, target, ids);
  return direction ? analyzerDirectionColors[direction] : explicitSelection ? analyzerDirectionColors.outgoing : '#496660';
}
