import type { AnalyzerSemanticRegion, AnalyzerViewEdge, AnalyzerViewModel, AnalyzerViewNode } from './types';
import type { PositionedNode, PositionedSemanticRegion } from './layout';
import {
  spatialEdgeClass,
  spatialEdgeImportance,
  spatialNodeBelongsToRegion,
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

/** Each static dependency keeps its real module endpoints and its Fact identity. */
export function collectSpatialEdgeSet(
  view: AnalyzerViewModel,
  visibleNodes: readonly PositionedNode[],
  _visibleRegions: readonly PositionedSemanticRegion[],
  _regionById: ReadonlyMap<string, AnalyzerSemanticRegion>,
  _expanded: ReadonlySet<string>,
  _zoomLevel: AnalyzerSpatialZoomLevel,
  selectedNodeId?: string,
  selectedRegionId?: string,
  selectedEdgeId?: string,
): { edges: SpatialPresentationEdge[]; groupedCount: number } {
  if (!selectedNodeId && !selectedRegionId && !selectedEdgeId) return { edges: [], groupedCount: 0 };
  const nodes = new Map(view.nodes.map(node => [node.id, node]));
  // This set is hierarchy visibility, not viewport visibility. Offscreen routes remain.
  const visible = new Set(visibleNodes.map(item => item.node.id));
  const edges = view.edges.flatMap((edge): SpatialPresentationEdge[] => {
    const source = nodes.get(edge.sourceId), target = nodes.get(edge.targetId);
    if (!source || !target || !visible.has(source.id) || !visible.has(target.id)) return [];
    const selected = edge.id === selectedEdgeId;
    const incident = selectedNodeId && (source.id === selectedNodeId || target.id === selectedNodeId);
    const boundary = selectedRegionId && spatialNodeBelongsToRegion(regionPathForNode(source), selectedRegionId)
      !== spatialNodeBelongsToRegion(regionPathForNode(target), selectedRegionId);
    if (!selected && !incident && !boundary) return [];
    const importance = spatialEdgeImportance(spatialEdgeClass(
      typeof source.metadata.packageId === 'string' ? source.metadata.packageId : undefined,
      typeof target.metadata.packageId === 'string' ? target.metadata.packageId : undefined,
      regionPathForNode(source).at(-1) ?? source.id, regionPathForNode(target).at(-1) ?? target.id,
    ));
    return [{ id: edge.id, edge, sourceId: source.id, targetId: target.id, edgeIds: [edge.id], count: 1,
      selected, connected: true, dimmed: false, aggregated: false, importance }];
  });
  return { edges, groupedCount: 0 };
}
