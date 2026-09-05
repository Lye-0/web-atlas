import type { AnalyzerSemanticRegion, AnalyzerViewEdge, AnalyzerViewModel, AnalyzerViewNode } from './types';
import type { PositionedNode, PositionedSemanticRegion } from './layout';
import {
  ANALYZER_SPATIAL_DIRECTIONAL_GROUP_THRESHOLD,
  ANALYZER_SPATIAL_EXACT_COUNTERPART_LIMIT,
  spatialEdgeClass,
  spatialEdgeImportance,
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
    existing.aggregated ||= aggregated || existing.count > 1;
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
  return collectSpatialEdgeSet(
    view,
    visibleNodes,
    visibleRegions,
    regionById,
    expanded,
    zoomLevel,
    selectedNodeId,
    selectedRegionId,
    selectedEdgeId,
  ).edges;
}

export function collectSpatialEdgeSet(
  view: AnalyzerViewModel,
  visibleNodes: readonly PositionedNode[],
  visibleRegions: readonly PositionedSemanticRegion[],
  regionById: ReadonlyMap<string, AnalyzerSemanticRegion>,
  expanded: ReadonlySet<string>,
  zoomLevel: AnalyzerSpatialZoomLevel,
  selectedNodeId?: string,
  selectedRegionId?: string,
  selectedEdgeId?: string,
  groupIncidents = true,
): { edges: SpatialPresentationEdge[]; groupedCount: number } {
  if (!selectedNodeId && !selectedRegionId && !selectedEdgeId) return { edges: [], groupedCount: 0 };
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
  // Selection is semantic state: camera distance must never replace it.
  if (selectionKind === 'none') return { edges: [], groupedCount: 0 };
  const effectiveSelectionKind = selectionKind;
  const selectedModuleId = effectiveSelectionKind === 'module' ? selectedNodeId : undefined;
  const forceRegionEndpoints = spatialUsesRegionAggregation(zoomLevel, effectiveSelectionKind);
  const allowLocalModules = spatialShowsLocalModuleEdges(zoomLevel, effectiveSelectionKind);
  const incomingDegree = selectedModuleId
    ? view.edges.filter((edge) => edge.targetId === selectedModuleId).length
    : 0;
  const outgoingDegree = selectedModuleId
    ? view.edges.filter((edge) => edge.sourceId === selectedModuleId).length
    : 0;
  const groupIncoming = groupIncidents && incomingDegree > ANALYZER_SPATIAL_DIRECTIONAL_GROUP_THRESHOLD;
  const groupOutgoing = groupIncidents && outgoingDegree > ANALYZER_SPATIAL_DIRECTIONAL_GROUP_THRESHOLD;
  const preferredKind = effectiveSelectionKind === 'package'
    ? 'workspace-package'
    : undefined;
  const grouped = new Map<string, SpatialPresentationEdge>();

  const counterpartRegion = (node: AnalyzerViewNode): string | undefined => (
    nearestVisibleRegionId(node, new Set(), visibleRegionIds, regionById, expanded, false, selectedModuleId)
      ?? regionEndpointForNode(node, visibleRegionIds, regionById, expanded, preferredKind)
  );
  const counterpartCounts = new Map<string, number>();
  if (selectedModuleId) {
    view.edges.forEach((edge) => {
      if (edge.sourceId !== selectedModuleId && edge.targetId !== selectedModuleId) return;
      const incoming = edge.targetId === selectedModuleId;
      const other = nodeById.get(incoming ? edge.sourceId : edge.targetId);
      const regionId = other && counterpartRegion(other);
      if (!regionId) return;
      const key = `${incoming}:${regionId}`;
      counterpartCounts.set(key, (counterpartCounts.get(key) ?? 0) + 1);
    });
  }

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
      ? counterpartCounts.get(`${incoming}:${otherRegionId}`) ?? 0
      : 0;
    const counterpartVisible = visibleNodeIds.has(otherNode.id);
    const keepExactIncident = selectedIncident
      && counterpartVisible
      && (!directionalGroup || counterpartGroupSize <= ANALYZER_SPATIAL_EXACT_COUNTERPART_LIMIT);
    const preserveExactModule = zoomLevel !== 'far'
      && (keepExactIncident || explicitlySelected)
      && effectiveSelectionKind !== 'directory'
      && effectiveSelectionKind !== 'package';
    const sameDirectory = nodeDirectoryId(sourceNode, regionById) === nodeDirectoryId(targetNode, regionById);
    const localVisible = allowLocalModules
      && sameDirectory
      && visibleNodeIds.has(sourceNode.id)
      && visibleNodeIds.has(targetNode.id);
    const useRegionEndpoints = (forceRegionEndpoints && !preserveExactModule)
      || (Boolean(selectedRegionId) && !preserveExactModule)
      || (effectiveSelectionKind !== 'module' && !preserveExactModule && !localVisible);

    let sourceId: string | undefined;
    let targetId: string | undefined;
    if (effectiveSelectionKind === 'module' && selectedIncident && selectedModuleId) {
      // Low-degree directions stay exact Module→Module.  Missing counterparts
      // are omitted; they must not collapse onto a parent Region.
      if (!directionalGroup && !explicitlySelected) {
        if (!counterpartVisible) return;
        sourceId = edge.sourceId;
        targetId = edge.targetId;
      } else if (keepExactIncident || explicitlySelected) {
        sourceId = edge.sourceId;
        targetId = edge.targetId;
      } else {
        const regionId = counterpartRegion(otherNode);
        if (!regionId || moduleIds.has(regionId)) return;
        sourceId = incoming ? regionId : selectedModuleId;
        targetId = incoming ? selectedModuleId : regionId;
      }
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
  const selectedEdges = ordered.filter(edge => edge.selected || edge.connected);
  return { edges: selectedEdges, groupedCount: selectedEdges.length };
}
