import type { AnalyzerViewEdge, AnalyzerViewModel, AnalyzerViewNode } from './types';

export interface AnalyzerPresentationOptions {
  expandedPresentationIds: ReadonlySet<string>;
  filter: string;
  search: string;
  selectedEdgeId?: string;
  selectedNodeId?: string;
  showExternal: boolean;
}

export function nodeMatchesSearch(node: AnalyzerViewNode, search: string): boolean {
  if (!search.trim()) return true;
  const haystack = [node.label, node.subtitle, ...Object.values(node.metadata).flatMap((value) => Array.isArray(value) ? value : value === undefined ? [] : [String(value)])]
    .join(' ')
    .toLowerCase();
  return haystack.includes(search.trim().toLowerCase());
}

export function presentAnalyzerView(view: AnalyzerViewModel, options: AnalyzerPresentationOptions): AnalyzerViewModel {
  const nodeById = new Map(view.nodes.map((node) => [node.id, node]));
  const hasSearch = Boolean(options.search.trim());
  const searchMatchedIds = new Set(hasSearch
    ? view.nodes.filter((node) => nodeMatchesSearch(node, options.search)).map((node) => node.id)
    : []);
  const expandedGroupIds = new Set<string>();
  view.nodes.filter((node) => node.presentation?.role === 'summary').forEach((summary) => {
    const childIds = summary.presentation?.childNodeIds ?? [];
    const searchExpanded = hasSearch && childIds.some((childId) => searchMatchedIds.has(childId)
      || options.selectedNodeId === childId
      || (options.filter !== 'all' && nodeById.get(childId)?.type === options.filter));
    if (options.expandedPresentationIds.has(summary.id)
      || (summary.id === 'dependencies:external:summary' && options.showExternal)
      || searchExpanded) expandedGroupIds.add(summary.id);
  });

  const presentationVisibleIds = new Set<string>();
  view.nodes.forEach((node) => {
    const parentId = node.presentation?.parentId;
    if (!parentId) {
      presentationVisibleIds.add(node.id);
      return;
    }
    if (expandedGroupIds.has(parentId)
      || searchMatchedIds.has(node.id)
      || options.selectedNodeId === node.id
      || (options.filter !== 'all' && node.type === options.filter)) presentationVisibleIds.add(node.id);
  });

  const visibleNodes = view.nodes.filter((node) => presentationVisibleIds.has(node.id)
    && (options.filter === 'all' || node.type === options.filter));
  const visibleIds = new Set(visibleNodes.map((node) => node.id));
  const parentByChildId = new Map(view.nodes.flatMap((node) => node.presentation?.parentId
    ? [[node.id, node.presentation.parentId] as const]
    : []));
  const resolvedEdges = new Map<string, AnalyzerViewEdge>();

  view.edges.forEach((edge) => {
    const parentId = edge.presentation?.parentId;
    if (edge.presentation?.initiallyHidden
      && (!parentId || !expandedGroupIds.has(parentId))
      && edge.id !== options.selectedEdgeId) return;

    const resolveEndpoint = (nodeId: string): string | undefined => {
      if (visibleIds.has(nodeId)) return nodeId;
      const childParentId = parentByChildId.get(nodeId);
      return childParentId && visibleIds.has(childParentId) ? childParentId : undefined;
    };
    const sourceId = resolveEndpoint(edge.sourceId);
    const targetId = resolveEndpoint(edge.targetId);
    if (!sourceId || !targetId || sourceId === targetId) return;

    const key = `${sourceId}:${targetId}:${edge.kind}`;
    const previous = resolvedEdges.get(key);
    if (previous) {
      resolvedEdges.set(key, { ...previous, evidenceIds: [...new Set([...previous.evidenceIds, ...edge.evidenceIds])] });
    } else {
      resolvedEdges.set(key, { ...edge, sourceId, targetId });
    }
  });

  return {
    ...view,
    nodes: visibleNodes,
    edges: [...resolvedEdges.values()],
    clusters: view.clusters
      .map((cluster) => ({ ...cluster, nodeIds: cluster.nodeIds.filter((nodeId) => visibleIds.has(nodeId)) }))
      .filter((cluster) => cluster.nodeIds.length > 0),
  };
}
