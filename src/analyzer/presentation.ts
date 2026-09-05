import type {
  AnalyzerSemanticRegion,
  AnalyzerViewEdge,
  AnalyzerViewCounts,
  AnalyzerViewModel,
  AnalyzerViewNode,
  AnalyzerPresentationGroup,
} from './types';

export interface AnalyzerPresentationOptions {
  expandedPresentationIds: ReadonlySet<string>;
  filter: string;
  search: string;
  selectedEdgeId?: string;
  selectedNodeId?: string;
  selectedRegionId?: string;
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

export function analyzerPresentationCount(node: AnalyzerViewNode): number {
  const metadataCount = node.metadata.childCount;
  if (typeof metadataCount === 'number' && Number.isFinite(metadataCount)) return Math.max(0, Math.round(metadataCount));
  return node.presentation?.childNodeIds?.length ?? 0;
}

export function analyzerPresentationCountLabel(node: AnalyzerViewNode): string {
  if (typeof node.metadata.stepCount === 'number' || node.metadata.commandType === 'branch-summary') return 'STEPS';
  if (typeof node.metadata.packageCount === 'number' || node.type === 'external-package' || node.type === 'workspace-package') return 'PACKAGES';
  if (node.type === 'dotnet-project') return 'PROJECTS';
  if (node.type === 'technology') return 'TECHNOLOGIES';
  return 'ITEMS';
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

export function regionMatchesSearch(region: AnalyzerSemanticRegion, search: string): boolean {
  if (!search.trim()) return true;
  const haystack = [
    region.label,
    region.subtitle,
    ...Object.values(region.metadata).flatMap((value) => Array.isArray(value) ? value : value === undefined ? [] : [String(value)]),
  ].join(' ').toLowerCase();
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

function regionById(view: AnalyzerViewModel): Map<string, AnalyzerSemanticRegion> {
  return new Map((view.regions ?? []).map((region) => [region.id, region]));
}

/** Returns the nearest promoted Region parent, ignoring legacy Project metadata. */
export function analyzerRegionParentId(view: AnalyzerViewModel, regionId: string): string | undefined {
  const regions = regionById(view);
  const region = regions.get(regionId);
  if (!region) return undefined;
  if (region.parentRegionId && region.parentRegionId !== regionId && regions.has(region.parentRegionId)) return region.parentRegionId;
  const legacyParentId = region.metadata.stackMapParentId;
  return typeof legacyParentId === 'string' && legacyParentId !== regionId && regions.has(legacyParentId)
    ? legacyParentId
    : undefined;
}

/** Returns direct promoted child Regions, with a legacy-safe derived fallback. */
export function analyzerRegionChildIds(view: AnalyzerViewModel, regionId: string): string[] {
  const regions = regionById(view);
  const region = regions.get(regionId);
  if (!region) return [];
  const childIds = new Set<string>();
  (region.childRegionIds ?? []).forEach((childId) => {
    const child = regions.get(childId);
    if (childId !== regionId && child && (!child.parentRegionId || child.parentRegionId === regionId)) childIds.add(childId);
  });
  regions.forEach((candidate) => {
    if (candidate.id !== regionId && analyzerRegionParentId(view, candidate.id) === regionId) childIds.add(candidate.id);
  });
  return [...childIds].sort((first, second) => {
    const firstRegion = regions.get(first);
    const secondRegion = regions.get(second);
    return (firstRegion?.subtitle ?? firstRegion?.label ?? first).localeCompare(secondRegion?.subtitle ?? secondRegion?.label ?? second) || first.localeCompare(second);
  });
}

/** Returns ancestor Region IDs from nearest parent to the outermost promoted Region. */
export function analyzerRegionAncestorIds(view: AnalyzerViewModel, regionId: string): string[] {
  const ancestors: string[] = [];
  const visited = new Set<string>([regionId]);
  let parentId = analyzerRegionParentId(view, regionId);
  while (parentId && !visited.has(parentId)) {
    ancestors.push(parentId);
    visited.add(parentId);
    parentId = analyzerRegionParentId(view, parentId);
  }
  return ancestors;
}

/** Returns all promoted descendant Region IDs without following malformed cycles. */
export function analyzerRegionDescendantIds(view: AnalyzerViewModel, regionId: string): string[] {
  const descendants: string[] = [];
  const visited = new Set<string>([regionId]);
  const visit = (currentId: string): void => {
    analyzerRegionChildIds(view, currentId).forEach((childId) => {
      if (visited.has(childId)) return;
      visited.add(childId);
      descendants.push(childId);
      visit(childId);
    });
  };
  visit(regionId);
  return descendants;
}

function analyzerRegionProjectId(view: AnalyzerViewModel, region: AnalyzerSemanticRegion): string | undefined {
  const nodeIds = new Set(view.nodes.map((node) => node.id));
  const explicitProjectId = region.metadata.stackMapProjectId;
  if (typeof explicitProjectId === 'string' && nodeIds.has(explicitProjectId)) return explicitProjectId;
  const legacyParentId = region.metadata.stackMapParentId;
  return typeof legacyParentId === 'string' && nodeIds.has(legacyParentId) ? legacyParentId : undefined;
}

/** Returns the Region hierarchy plus its Stack Usage nodes and Project context. */
export function analyzerRegionContextEntityIds(view: AnalyzerViewModel, regionId: string, includeDescendants = true): ReadonlySet<string> {
  const regions = regionById(view);
  const regionIds = [regionId, ...analyzerRegionAncestorIds(view, regionId)];
  if (includeDescendants) regionIds.push(...analyzerRegionDescendantIds(view, regionId));
  const contextIds = new Set<string>();
  [...new Set(regionIds)].forEach((currentId) => {
    const region = regions.get(currentId);
    if (!region) return;
    contextIds.add(currentId);
    region.childIds.forEach((childId) => contextIds.add(childId));
    const projectId = analyzerRegionProjectId(view, region);
    if (projectId) contextIds.add(projectId);
  });
  return contextIds;
}

export function analyzerStackCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'STACK' : 'STACKS'}`;
}

function stackMapFilterContextIds(view: AnalyzerViewModel, filter: string): ReadonlySet<string> {
  if (view.view !== 'architecture' || filter === 'all') return new Set();
  const nodeById = new Map(view.nodes.map((node) => [node.id, node]));
  const contextIds = new Set<string>();
  const addRegionContext = (regionId: string, includeDescendants: boolean): void => {
    analyzerRegionContextEntityIds(view, regionId, includeDescendants).forEach((entityId) => contextIds.add(entityId));
  };
  if (filter === 'stack-scope') {
    (view.regions ?? []).forEach((region) => addRegionContext(region.id, true));
    return contextIds;
  }
  view.nodes.filter((node) => node.type === filter).forEach((node) => {
    contextIds.add(node.id);
    const regionId = node.metadata.stackMapRegionId;
    if (typeof regionId === 'string' && nodeById.has(node.id)) addRegionContext(regionId, false);
  });
  return contextIds;
}

export function presentAnalyzerView(view: AnalyzerViewModel, options: AnalyzerPresentationOptions): AnalyzerViewModel {
  const nodeById = new Map(view.nodes.map((node) => [node.id, node]));
  const regionById = new Map((view.regions ?? []).map((region) => [region.id, region]));
  const parentByChildId = new Map(view.nodes.flatMap((node) => node.presentation?.parentId
    ? [[node.id, node.presentation.parentId] as const]
    : []));
  const hasSearch = Boolean(options.search.trim());
  const searchMatchedIds = new Set(hasSearch
    ? view.nodes.filter((node) => nodeMatchesSearch(node, options.search)).map((node) => node.id)
    : []);
  const searchMatchedRegionIds = new Set(hasSearch
    ? (view.regions ?? []).filter((region) => regionMatchesSearch(region, options.search)).map((region) => region.id)
    : []);
  const stackMapContextIds = new Set(stackMapFilterContextIds(view, options.filter));

  const selectedContextIds = new Set<string>();
  if (options.selectedNodeId) {
    selectedContextIds.add(options.selectedNodeId);
    view.edges.forEach((edge) => {
      if (edge.sourceId === options.selectedNodeId) selectedContextIds.add(edge.targetId);
      if (edge.targetId === options.selectedNodeId) selectedContextIds.add(edge.sourceId);
    });
  }
  if (options.selectedRegionId) {
    const selectedRegion = regionById.get(options.selectedRegionId);
    if (selectedRegion) {
      analyzerRegionContextEntityIds(view, selectedRegion.id, true).forEach((entityId) => selectedContextIds.add(entityId));
      view.edges.forEach((edge) => {
        if (edge.sourceId === selectedRegion.id) selectedContextIds.add(edge.targetId);
        if (edge.targetId === selectedRegion.id) selectedContextIds.add(edge.sourceId);
      });
    }
  }
  searchMatchedRegionIds.forEach((regionId) => {
    const region = regionById.get(regionId);
    if (!region) return;
    analyzerRegionContextEntityIds(view, region.id, true).forEach((entityId) => stackMapContextIds.add(entityId));
  });
  if (options.selectedEdgeId) {
    const selectedEdge = view.edges.find((edge) => edge.id === options.selectedEdgeId);
    if (selectedEdge) {
      selectedContextIds.add(selectedEdge.sourceId);
      selectedContextIds.add(selectedEdge.targetId);
    }
  }

  const presentationAncestorIdsFor = (nodeId: string): string[] => {
    const ancestors: string[] = [];
    const visited = new Set<string>();
    let parentId = parentByChildId.get(nodeId);
    while (parentId && !visited.has(parentId)) {
      ancestors.push(parentId);
      visited.add(parentId);
      parentId = parentByChildId.get(parentId);
    }
    return ancestors;
  };
  const relevantNode = (nodeId: string): boolean => searchMatchedIds.has(nodeId)
    || options.selectedNodeId === nodeId
    || selectedContextIds.has(nodeId)
    || (options.filter !== 'all' && nodeById.get(nodeId)?.type === options.filter);
  const expandedGroupIds = new Set<string>();
  view.nodes.filter((node) => node.presentation?.role === 'summary').forEach((summary) => {
    const hasRelevantDescendant = view.nodes.some((node) => relevantNode(node.id)
      && presentationAncestorIdsFor(node.id).includes(summary.id));
    if (options.expandedPresentationIds.has(summary.id) || hasRelevantDescendant) expandedGroupIds.add(summary.id);
  });

  const presentationGroups: AnalyzerPresentationGroup[] = view.nodes
    .filter((node) => node.presentation?.role === 'summary')
    .map((summary) => ({
      id: summary.id,
      label: summary.label,
      count: analyzerPresentationCount(summary),
      countLabel: analyzerPresentationCountLabel(summary),
      childNodeIds: [...(summary.presentation?.childNodeIds ?? [])],
      ...(summary.presentation?.parentId ? { parentId: summary.presentation.parentId } : {}),
      expanded: expandedGroupIds.has(summary.id),
    }));

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
    const ancestors = presentationAncestorIdsFor(node.id);
    const pathExpanded = ancestors.every((ancestorId) => expandedGroupIds.has(ancestorId));
    if (pathExpanded || relevantNode(node.id)) presentationVisibleIds.add(node.id);
  });

  const visibleNodes = view.nodes.filter((node) => presentationVisibleIds.has(node.id)
    && (options.filter === 'all' || node.type === options.filter || selectedContextIds.has(node.id) || stackMapContextIds.has(node.id)));
  const visibleIds = new Set(visibleNodes.map((node) => node.id));
  const visibleRegionIds = new Set<string>();
  const retainRegionAndAncestors = (regionId: string): void => {
    visibleRegionIds.add(regionId);
    analyzerRegionAncestorIds(view, regionId).forEach((ancestorId) => visibleRegionIds.add(ancestorId));
  };
  (view.regions ?? []).forEach((region) => {
    if (searchMatchedRegionIds.has(region.id)
      || selectedContextIds.has(region.id)
      || stackMapContextIds.has(region.id)
      || region.childIds.some((childId) => visibleIds.has(childId))) retainRegionAndAncestors(region.id);
  });
  const resolvedEdges = new Map<string, AnalyzerViewEdge>();
  const presentationPathExpanded = (presentationId: string): boolean => {
    const visited = new Set<string>();
    let currentId: string | undefined = presentationId;
    while (currentId && !visited.has(currentId)) {
      if (!expandedGroupIds.has(currentId)) return false;
      visited.add(currentId);
      currentId = parentByChildId.get(currentId);
    }
    return true;
  };

  view.edges.forEach((edge) => {
    const parentId = edge.presentation?.parentId;
    if (edge.presentation?.displayKind === 'bundle'
      && parentId
      && presentationPathExpanded(parentId)
      && edge.id !== options.selectedEdgeId) return;
    if (edge.presentation?.initiallyHidden
      && (!parentId || !presentationPathExpanded(parentId))
      && edge.id !== options.selectedEdgeId) return;

    const resolveEndpoint = (nodeId: string): string | undefined => {
      if (visibleRegionIds.has(nodeId)) return nodeId;
      const visited = new Set<string>();
      let currentId: string | undefined = nodeId;
      while (currentId && !visited.has(currentId)) {
        if (visibleIds.has(currentId)) return currentId;
        visited.add(currentId);
        currentId = parentByChildId.get(currentId);
      }
      return undefined;
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
    regions: (view.regions ?? [])
      .filter((region) => visibleRegionIds.has(region.id))
      .map((region) => ({
        ...region,
        childIds: region.childIds.filter((childId) => visibleIds.has(childId)),
        ...(region.childRegionIds ? { childRegionIds: region.childRegionIds.filter((childId) => visibleRegionIds.has(childId)) } : {}),
      })),
    presentationGroups,
  };
}
