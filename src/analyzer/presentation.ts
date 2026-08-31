import type { AnalyzerViewEdge, AnalyzerViewCounts, AnalyzerViewModel, AnalyzerViewNode } from './types';

export interface AnalyzerPresentationOptions {
  expandedPresentationIds: ReadonlySet<string>;
  filter: string;
  search: string;
  selectedEdgeId?: string;
  selectedNodeId?: string;
}

export function analyzerSummaryExpanded(summaryId: string, expandedPresentationIds: ReadonlySet<string>): boolean {
  return expandedPresentationIds.has(summaryId);
}

export function analyzerSummarySubtitle(node: AnalyzerViewNode, expanded: boolean): string | undefined {
  if (!node.subtitle) return undefined;
  if (/· expand for details$/.test(node.subtitle)) {
    return expanded ? node.subtitle.replace(/· expand for details$/, '· expanded · Collapse') : node.subtitle;
  }
  if (/· expanded(?: · Collapse)?$/.test(node.subtitle)) {
    return expanded ? node.subtitle : node.subtitle.replace(/· expanded(?: · Collapse)?$/, '· expand for details');
  }
  return `${node.subtitle} · ${expanded ? 'expanded · Collapse' : 'expand for details'}`;
}

export function presentationParentId(view: AnalyzerViewModel, nodeId: string): string | undefined {
  return view.nodes.find((node) => node.id === nodeId)?.presentation?.parentId;
}

export function presentationAncestorIds(view: AnalyzerViewModel, nodeId: string): string[] {
  const ancestors: string[] = [];
  const visited = new Set<string>();
  let parentId = presentationParentId(view, nodeId);
  while (parentId && !visited.has(parentId)) {
    ancestors.push(parentId);
    visited.add(parentId);
    parentId = presentationParentId(view, parentId);
  }
  return ancestors;
}

export function presentationOwnsNode(view: AnalyzerViewModel, presentationId: string, nodeId: string): boolean {
  return presentationAncestorIds(view, nodeId).includes(presentationId);
}

export function nodeMatchesSearch(node: AnalyzerViewNode, search: string): boolean {
  if (!search.trim()) return true;
  const haystack = [node.label, node.subtitle, ...Object.values(node.metadata).flatMap((value) => Array.isArray(value) ? value : value === undefined ? [] : [String(value)])]
    .join(' ')
    .toLowerCase();
  return haystack.includes(search.trim().toLowerCase());
}

export function analyzerViewCounts(view: AnalyzerViewModel, visibleNodes: AnalyzerViewNode[] = view.nodes): AnalyzerViewCounts {
  const totalNodes = view.nodes.filter((node) => node.presentation?.role !== 'summary').length;
  const visibleNodeCount = Math.min(totalNodes, visibleNodes.length);
  return {
    visibleNodes: visibleNodeCount,
    totalNodes,
    hiddenNodes: Math.max(0, totalNodes - visibleNodeCount),
  };
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
    if (options.expandedPresentationIds.has(summary.id) || searchExpanded) expandedGroupIds.add(summary.id);
  });

  const selectedContextIds = new Set<string>();
  if (options.selectedNodeId) {
    selectedContextIds.add(options.selectedNodeId);
    view.edges.forEach((edge) => {
      if (edge.sourceId === options.selectedNodeId) selectedContextIds.add(edge.targetId);
      if (edge.targetId === options.selectedNodeId) selectedContextIds.add(edge.sourceId);
    });
  }
  if (options.selectedEdgeId) {
    const selectedEdge = view.edges.find((edge) => edge.id === options.selectedEdgeId);
    if (selectedEdge) {
      selectedContextIds.add(selectedEdge.sourceId);
      selectedContextIds.add(selectedEdge.targetId);
    }
  }

  const presentationVisibleIds = new Set<string>();
  view.nodes.forEach((node) => {
    if (node.presentation?.role === 'summary'
      && node.presentation.hideWhenExpanded
      && expandedGroupIds.has(node.id)
      && options.selectedNodeId !== node.id) return;
    const parentId = node.presentation?.parentId;
    if (!parentId) {
      presentationVisibleIds.add(node.id);
      return;
    }
    if (expandedGroupIds.has(parentId)
      || searchMatchedIds.has(node.id)
      || options.selectedNodeId === node.id
      || selectedContextIds.has(node.id)
      || (options.filter !== 'all' && node.type === options.filter)) presentationVisibleIds.add(node.id);
  });

  const visibleNodes = view.nodes.filter((node) => presentationVisibleIds.has(node.id)
    && (options.filter === 'all' || node.type === options.filter || selectedContextIds.has(node.id)));
  const visibleIds = new Set(visibleNodes.map((node) => node.id));
  const parentByChildId = new Map(view.nodes.flatMap((node) => node.presentation?.parentId
    ? [[node.id, node.presentation.parentId] as const]
    : []));
  const resolvedEdges = new Map<string, AnalyzerViewEdge>();

  view.edges.forEach((edge) => {
    const parentId = edge.presentation?.parentId;
    if (edge.presentation?.displayKind === 'bundle'
      && parentId
      && expandedGroupIds.has(parentId)
      && edge.id !== options.selectedEdgeId) return;
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
    counts: analyzerViewCounts(view, visibleNodes),
    clusters: view.clusters
      .map((cluster) => ({ ...cluster, nodeIds: cluster.nodeIds.filter((nodeId) => visibleIds.has(nodeId)) }))
      .filter((cluster) => cluster.nodeIds.length > 0),
  };
}
