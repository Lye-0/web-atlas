import type { AnalyzerSemanticRegion, AnalyzerViewEdge, AnalyzerViewModel, AnalyzerViewNode } from './types';
import type { PositionedNode, PositionedSemanticRegion } from './layout';
import {
  ANALYZER_SPATIAL_DIRECTIONAL_GROUP_THRESHOLD,
  ANALYZER_SPATIAL_EXACT_COUNTERPART_LIMIT,
  spatialEdgeBudget,
  spatialEdgeClass,
  spatialEdgeImportance,
  spatialLocalEdgeBudget,
  spatialNodeBelongsToRegion,
  spatialSelectionKind,
  spatialShowsLocalModuleEdges,
  spatialUsesRegionAggregation,
  type AnalyzerSpatialZoomLevel,
} from './spatialPresentation';

export interface SpatialPresentationEdge {
  id: string;
  edge: AnalyzerViewEdge;
  sourceId: string;
  targetId: string;
  /** Every Fact edge represented by this presentation relation. */
  edgeIds: string[];
  count: number;
  selected: boolean;
  connected: boolean;
  dimmed: boolean;
  aggregated: boolean;
  importance: number;
}

function regionPathForNode(node: AnalyzerViewNode): string[] {
  const value = node.metadata.regionPath;
  return Array.isArray(value) ? value : [];
}

function isDirectoryRegion(region: AnalyzerSemanticRegion | undefined): boolean {
  return region?.regionKind === 'directory';
}

export function spatialRegionVisible(
  region: AnalyzerSemanticRegion,
  regionById: ReadonlyMap<string, AnalyzerSemanticRegion>,
  expanded: ReadonlySet<string>,
): boolean {
  if (expanded.size === 0) return true;
  let parentId = region.parentRegionId;
  const visited = new Set<string>();
  while (parentId && !visited.has(parentId)) {
    const parent = regionById.get(parentId);
    if (!parent) break;
    if (isDirectoryRegion(parent) && !expanded.has(parent.id)) return false;
    visited.add(parentId);
    parentId = parent.parentRegionId;
  }
  return true;
}

function nearestVisibleRegionId(
  node: AnalyzerViewNode,
  visibleNodeIds: ReadonlySet<string>,
  visibleRegionIds: ReadonlySet<string>,
  regionById: ReadonlyMap<string, AnalyzerSemanticRegion>,
  expanded: ReadonlySet<string>,
  allowModule = true,
  selectedNodeId?: string,
): string | undefined {
  if (allowModule && (visibleNodeIds.has(node.id) || node.id === selectedNodeId)) return node.id;
  const path = regionPathForNode(node);
  for (let index = path.length - 1; index >= 0; index -= 1) {
    const regionId = path[index];
    const region = regionId ? regionById.get(regionId) : undefined;
    if (region && visibleRegionIds.has(region.id) && spatialRegionVisible(region, regionById, expanded)) {
      if (isDirectoryRegion(region) && expanded.has(region.id) && allowModule) continue;
      return region.id;
    }
  }
  return path.find((regionId) => visibleRegionIds.has(regionId));
}

function regionEndpointForNode(
  node: AnalyzerViewNode,
  visibleRegionIds: ReadonlySet<string>,
  regionById: ReadonlyMap<string, AnalyzerSemanticRegion>,
  expanded: ReadonlySet<string>,
  preferredKind?: AnalyzerSemanticRegion['regionKind'],
): string | undefined {
  const path = regionPathForNode(node);
  if (preferredKind === 'workspace-package') {
    const packageId = path.find((regionId) => regionById.get(regionId)?.regionKind === 'workspace-package');
    if (packageId && visibleRegionIds.has(packageId)) return packageId;
  }
  for (let index = path.length - 1; index >= 0; index -= 1) {
    const regionId = path[index];
    const region = regionId ? regionById.get(regionId) : undefined;
    if (region && visibleRegionIds.has(region.id) && spatialRegionVisible(region, regionById, expanded)) return region.id;
  }
  return path.find((regionId) => visibleRegionIds.has(regionId));
}

function nodeDirectoryId(node: AnalyzerViewNode, regionById: ReadonlyMap<string, AnalyzerSemanticRegion>): string {
  const path = regionPathForNode(node);
  for (let index = path.length - 1; index >= 0; index -= 1) {
    const regionId = path[index];
    if (regionId && isDirectoryRegion(regionById.get(regionId))) return regionId;
  }
  return path.at(-1) ?? node.id;
}

function addGroupedEdge(
  grouped: Map<string, SpatialPresentationEdge>,
  edge: AnalyzerViewEdge,
  sourceId: string,
  targetId: string,
  selected: boolean,
  connected: boolean,
  aggregated: boolean,
  importance: number,
): void {
  const key = `${sourceId}:${targetId}`;
  const existing = grouped.get(key);
  if (existing) {
    existing.edgeIds.push(edge.id);
    existing.count += 1;
    existing.selected ||= selected;
    existing.connected ||= connected;
    existing.edge = selected ? edge : existing.edge;
    existing.dimmed &&= !selected && !connected;
    existing.aggregated ||= aggregated;
    existing.importance = Math.max(existing.importance, importance);
    return;
  }
  grouped.set(key, {
    id: aggregated ? `spatial-bundle:${sourceId}:${targetId}` : edge.id,
    edge,
    sourceId,
    targetId,
    edgeIds: [edge.id],
    count: 1,
    selected,
    connected,
    dimmed: false,
    aggregated,
    importance,
  });
}

export function collectSpatialEdges(
  view: AnalyzerViewModel,
  visibleNodes: readonly PositionedNode[],
  visibleRegions: readonly PositionedSemanticRegion[],
  regionById: ReadonlyMap<string, AnalyzerSemanticRegion>,
  expanded: ReadonlySet<string>,
  zoomLevel: AnalyzerSpatialZoomLevel,
  selectedNodeId?: string,
  selectedRegionId?: string,
  selectedEdgeId?: string,
): SpatialPresentationEdge[] {
  const visibleNodeIds = new Set(visibleNodes.map((positioned) => positioned.node.id));
  const visibleRegionIds = new Set(visibleRegions.map((positioned) => positioned.region.id));
  const nodeById = new Map(view.nodes.map((node) => [node.id, node]));
  const moduleIds = new Set(view.nodes.filter((node) => node.type === 'module').map((node) => node.id));
  const selectedRegion = selectedRegionId ? regionById.get(selectedRegionId) : undefined;
  const selectionKind = spatialSelectionKind({
    selectedNodeId,
    selectedRegionKind: selectedRegion?.regionKind,
    selectedEdgeId,
  });
  // Far is a repository/package map.  A selected module remains selected in
  // the session and detail panel, but must not turn the package map into an
  // incident-module view.
  const effectiveSelectionKind = zoomLevel === 'far' && selectionKind === 'module' ? 'none' : selectionKind;
  const selectedModuleId = effectiveSelectionKind === 'module' ? selectedNodeId : undefined;
  const forceRegionEndpoints = spatialUsesRegionAggregation(zoomLevel, effectiveSelectionKind);
  const allowLocalModules = spatialShowsLocalModuleEdges(zoomLevel, effectiveSelectionKind);
  const incomingDegree = selectedModuleId
    ? view.edges.filter((edge) => edge.targetId === selectedModuleId).length
    : 0;
  const outgoingDegree = selectedModuleId
    ? view.edges.filter((edge) => edge.sourceId === selectedModuleId).length
    : 0;
  const groupIncoming = incomingDegree > ANALYZER_SPATIAL_DIRECTIONAL_GROUP_THRESHOLD;
  const groupOutgoing = outgoingDegree > ANALYZER_SPATIAL_DIRECTIONAL_GROUP_THRESHOLD;
  const preferredKind = effectiveSelectionKind === 'package' || zoomLevel === 'far'
    ? 'workspace-package'
    : undefined;
  const grouped = new Map<string, SpatialPresentationEdge>();

  const counterpartRegion = (node: AnalyzerViewNode): string | undefined => (
    nearestVisibleRegionId(node, new Set(), visibleRegionIds, regionById, expanded, false, selectedModuleId)
      ?? regionEndpointForNode(node, visibleRegionIds, regionById, expanded, preferredKind)
  );

  view.edges.forEach((edge) => {
    const sourceNode = nodeById.get(edge.sourceId);
    const targetNode = nodeById.get(edge.targetId);
    if (!sourceNode || !targetNode) return;
    const explicitlySelected = edge.id === selectedEdgeId;
    const selectedIncident = Boolean(selectedModuleId && (edge.sourceId === selectedModuleId || edge.targetId === selectedModuleId));
    if (effectiveSelectionKind === 'module' && !selectedIncident && !explicitlySelected) return;
    if (effectiveSelectionKind === 'edge' && !explicitlySelected) return;

    const sourceTouchesSelectedRegion = spatialNodeBelongsToRegion(regionPathForNode(sourceNode), selectedRegionId);
    const targetTouchesSelectedRegion = spatialNodeBelongsToRegion(regionPathForNode(targetNode), selectedRegionId);
    if ((effectiveSelectionKind === 'directory' || effectiveSelectionKind === 'package') && !explicitlySelected
      && sourceTouchesSelectedRegion === targetTouchesSelectedRegion) return;
    if (selectedRegionId && sourceTouchesSelectedRegion && targetTouchesSelectedRegion && !explicitlySelected) return;

    const incoming = edge.targetId === selectedModuleId;
    const otherNode = incoming ? sourceNode : targetNode;
    const otherRegionId = selectedIncident ? counterpartRegion(otherNode) : undefined;
    const directionalGroup = incoming ? groupIncoming : groupOutgoing;
    const counterpartGroupSize = selectedIncident && selectedModuleId && otherRegionId
      ? view.edges.filter((candidate) => {
        const candidateIncoming = candidate.targetId === selectedModuleId;
        if (candidateIncoming !== incoming) return false;
        const candidateOther = nodeById.get(candidateIncoming ? candidate.sourceId : candidate.targetId);
        return candidateOther ? counterpartRegion(candidateOther) === otherRegionId : false;
      }).length
      : 0;
    const counterpartVisible = visibleNodeIds.has(otherNode.id);
    const keepExactIncident = selectedIncident
      && counterpartVisible
      && (!directionalGroup || counterpartGroupSize <= ANALYZER_SPATIAL_EXACT_COUNTERPART_LIMIT);
    const preserveExactModule = (keepExactIncident || explicitlySelected)
      && effectiveSelectionKind !== 'directory'
      && effectiveSelectionKind !== 'package';
    const sameDirectory = nodeDirectoryId(sourceNode, regionById) === nodeDirectoryId(targetNode, regionById);
    const localVisible = allowLocalModules
      && sameDirectory
      && visibleNodeIds.has(sourceNode.id)
      && visibleNodeIds.has(targetNode.id);
    const groupIncidentEndpoint = selectedIncident && !preserveExactModule;
    const useRegionEndpoints = (forceRegionEndpoints && !preserveExactModule)
      || (Boolean(selectedRegionId) && !preserveExactModule)
      || (!preserveExactModule && !localVisible)
      || groupIncidentEndpoint;

    let sourceId: string | undefined;
    let targetId: string | undefined;
    if (groupIncidentEndpoint && selectedModuleId) {
      const regionId = counterpartRegion(otherNode);
      if (!regionId) return;
      sourceId = edge.sourceId === selectedModuleId ? selectedModuleId : regionId;
      targetId = edge.targetId === selectedModuleId ? selectedModuleId : regionId;
    } else if (useRegionEndpoints) {
      sourceId = sourceTouchesSelectedRegion && selectedRegionId
        ? selectedRegionId
        : regionEndpointForNode(sourceNode, visibleRegionIds, regionById, expanded, preferredKind);
      targetId = targetTouchesSelectedRegion && selectedRegionId
        ? selectedRegionId
        : regionEndpointForNode(targetNode, visibleRegionIds, regionById, expanded, preferredKind);
    } else {
      sourceId = nearestVisibleRegionId(sourceNode, visibleNodeIds, visibleRegionIds, regionById, expanded, true, selectedModuleId);
      targetId = nearestVisibleRegionId(targetNode, visibleNodeIds, visibleRegionIds, regionById, expanded, true, selectedModuleId);
    }
    if (!sourceId || !targetId || sourceId === targetId) return;

    const sourcePackage = typeof sourceNode.metadata.packageId === 'string' ? sourceNode.metadata.packageId : undefined;
    const targetPackage = typeof targetNode.metadata.packageId === 'string' ? targetNode.metadata.packageId : undefined;
    const importance = spatialEdgeImportance(spatialEdgeClass(sourcePackage, targetPackage, sourceId, targetId));
    const selected = explicitlySelected;
    const connected = selectedIncident
      || explicitlySelected
      || Boolean(selectedRegionId && sourceTouchesSelectedRegion !== targetTouchesSelectedRegion);
    const aggregated = !moduleIds.has(sourceId) || !moduleIds.has(targetId);
    addGroupedEdge(grouped, edge, sourceId, targetId, selected, connected, aggregated, importance);
  });

  const ordered = [...grouped.values()].sort((first, second) =>
    Number(second.selected || second.connected) - Number(first.selected || first.connected)
    || second.importance - first.importance
    || second.count - first.count
    || first.id.localeCompare(second.id));
  if (effectiveSelectionKind === 'module' || effectiveSelectionKind === 'edge'
    || effectiveSelectionKind === 'directory' || effectiveSelectionKind === 'package') {
    return ordered.filter((edge) => edge.selected || edge.connected);
  }

  const localBudget = spatialLocalEdgeBudget(zoomLevel);
  const localByDirectory = new Map<string, SpatialPresentationEdge[]>();
  const aggregates: SpatialPresentationEdge[] = [];
  ordered.forEach((edge) => {
    if (edge.aggregated) {
      aggregates.push(edge);
      return;
    }
    const sourceNode = nodeById.get(edge.sourceId);
    const directoryId = sourceNode ? nodeDirectoryId(sourceNode, regionById) : edge.sourceId;
    const group = localByDirectory.get(directoryId) ?? [];
    group.push(edge);
    localByDirectory.set(directoryId, group);
  });
  const budgetedLocal = [...localByDirectory.values()].flatMap((group) => group
    .sort((first, second) => second.count - first.count || first.id.localeCompare(second.id))
    .slice(0, localBudget));
  const remaining = Math.max(0, spatialEdgeBudget(zoomLevel) - budgetedLocal.length);
  const budgetedAggregates = aggregates
    .sort((first, second) => second.importance - first.importance || second.count - first.count || first.id.localeCompare(second.id))
    .slice(0, remaining);
  return [...budgetedLocal, ...budgetedAggregates].sort((first, second) => first.id.localeCompare(second.id));
}
