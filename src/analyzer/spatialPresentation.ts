import { ANALYZER_MODULE_NODE_WIDTH } from './layout';
import type { AnalyzerRegionKind } from './types';

export type AnalyzerSpatialZoomLevel = 'far' | 'medium' | 'near';
export type AnalyzerSpatialEdgeClass = 'local' | 'cross-directory' | 'cross-package';
export type AnalyzerSpatialSelectionKind = 'none' | 'module' | 'directory' | 'package' | 'edge';

/** Pitch from vertical: enough depth to read planes, shallow enough to keep the map readable. */
export const ANALYZER_SPATIAL_TILT_DEGREES = 17;
export const ANALYZER_SPATIAL_YAW_DEGREES = 0;
/** Fallback only; live distance is derived from world bounds. */
export const ANALYZER_SPATIAL_CAMERA_DISTANCE = 1600;
export const ANALYZER_SPATIAL_CAMERA_SCHEMA = 2;
export const ANALYZER_SPATIAL_INITIAL_SCALE = 0.5;
export const ANALYZER_SPATIAL_INCIDENT_EDGE_THRESHOLD = 8;
export const ANALYZER_SPATIAL_DIRECTIONAL_GROUP_THRESHOLD = 8;
export const ANALYZER_SPATIAL_EXACT_COUNTERPART_LIMIT = 2;
export const ANALYZER_SPATIAL_FULL_AGGREGATE_DISTANCE = 280;
export const ANALYZER_SPATIAL_MODULE_CARD_WIDTH_NEAR = ANALYZER_MODULE_NODE_WIDTH;
export const ANALYZER_SPATIAL_REGION_ELEVATION = 10;
export const ANALYZER_SPATIAL_MODULE_ELEVATION = 22;
export const ANALYZER_SPATIAL_LOCAL_EDGE_ALTITUDE = 28;
export const ANALYZER_SPATIAL_DIRECTORY_EDGE_ALTITUDE = 38;
export const ANALYZER_SPATIAL_PACKAGE_EDGE_ALTITUDE = 52;
export const ANALYZER_SPATIAL_PLANE_THICKNESS = 0.16;
export const ANALYZER_SPATIAL_MAX_XY_DETOUR = 64;

export function spatialModuleBudget(zoomLevel: AnalyzerSpatialZoomLevel): number {
  if (zoomLevel === 'far') return 0;
  if (zoomLevel === 'medium') return 220;
  return 900;
}

export function spatialEdgeBudget(zoomLevel: AnalyzerSpatialZoomLevel): number {
  if (zoomLevel === 'far') return 10;
  if (zoomLevel === 'medium') return 14;
  return 18;
}

export function spatialLocalEdgeBudget(zoomLevel: AnalyzerSpatialZoomLevel): number {
  if (zoomLevel === 'far') return 0;
  if (zoomLevel === 'medium') return 2;
  return 4;
}

export function spatialRegionDepthElevation(regionKind: AnalyzerRegionKind, depth = 0): number {
  if (regionKind === 'workspace-package') return 2;
  return ANALYZER_SPATIAL_REGION_ELEVATION + Math.min(16, Math.max(0, depth) * 3.2);
}

export function spatialModuleElevation(regionDepth = 0): number {
  return ANALYZER_SPATIAL_MODULE_ELEVATION + Math.min(10, Math.max(0, regionDepth) * 1.2);
}

export interface SpatialModuleBlockDimensions {
  width: number;
  height: number;
  depth: number;
  zOffset: number;
}

export function spatialModuleBlockDimensions(
  zoomLevel: AnalyzerSpatialZoomLevel,
  nodeHeight: number,
): SpatialModuleBlockDimensions {
  void zoomLevel;
  return {
    // Semantic zoom changes text, never the occupied footprint.
    width: ANALYZER_MODULE_NODE_WIDTH,
    height: nodeHeight,
    depth: 2,
    zOffset: -1,
  };
}

export function spatialRegionBorderStyle(
  selected: boolean,
  regionKind: AnalyzerRegionKind,
  depth = 0,
): { color: string; opacity: number; className: 'region-border' | 'region-border-selected' } {
  if (selected) return { color: '#4f8f96', opacity: 0.48, className: 'region-border-selected' };
  if (regionKind === 'workspace-package') return { color: '#6d958c', opacity: 0.72, className: 'region-border' };
  if (depth > 1) return { color: '#2f4a46', opacity: 0.28, className: 'region-border' };
  return { color: '#3d5c56', opacity: 0.5, className: 'region-border' };
}
export function spatialRegionFillOpacity(regionKind: AnalyzerRegionKind, depth = 0): number {
  if (regionKind === 'workspace-package') return 0.18;
  return Math.max(0.04, 0.1 - Math.max(0, depth) * 0.02);
}

export function spatialReadableUiTransform(elevation: number): string {
  return `translateZ(${elevation}px) rotateX(${-ANALYZER_SPATIAL_TILT_DEGREES}deg)`;
}

export function spatialLabelScreenScale(scale: number): number {
  // Screen-facing labels should remain readable, but must not grow as the
  // world is zoomed out.  The old inverse scale made Far headings dominate
  // the map and collide with one another.
  return Math.min(1.08, Math.max(0.78, 0.72 + Math.max(0.25, Math.min(1.8, scale)) * 0.3));
}

export function spatialEdgeClass(
  sourcePackageId: string | undefined,
  targetPackageId: string | undefined,
  sourceRegionId: string,
  targetRegionId: string,
): AnalyzerSpatialEdgeClass {
  if (sourcePackageId !== targetPackageId && (sourcePackageId || targetPackageId)) return 'cross-package';
  if (sourceRegionId !== targetRegionId) return 'cross-directory';
  return 'local';
}

export function spatialEdgeAltitude(edgeClass: AnalyzerSpatialEdgeClass, zoomLevel?: AnalyzerSpatialZoomLevel): number {
  const farScale = zoomLevel === 'far' ? 0.38 : 1;
  if (edgeClass === 'cross-package') return ANALYZER_SPATIAL_PACKAGE_EDGE_ALTITUDE * farScale;
  if (edgeClass === 'cross-directory') return ANALYZER_SPATIAL_DIRECTORY_EDGE_ALTITUDE * farScale;
  return ANALYZER_SPATIAL_LOCAL_EDGE_ALTITUDE * farScale;
}

export function spatialModuleCardWidth(zoomLevel: AnalyzerSpatialZoomLevel): number {
  if (zoomLevel === 'near') return ANALYZER_SPATIAL_MODULE_CARD_WIDTH_NEAR;
  return ANALYZER_MODULE_NODE_WIDTH;
}

export function spatialEdgeEmptyReason(options: {
  factCount: number;
  renderedCount: number;
  candidateCount?: number;
  collectedCount?: number;
}): 'none' | 'no-dependency' | 'no-visible-relation' | 'density-budget' {
  if (options.renderedCount > 0) return 'none';
  if (options.factCount === 0) return 'no-dependency';
  const collected = options.collectedCount ?? 0;
  const candidates = options.candidateCount ?? collected;
  if (candidates > 0 && collected === 0) return 'density-budget';
  return 'no-visible-relation';
}

export function spatialEdgeImportance(edgeClass: AnalyzerSpatialEdgeClass): number {
  if (edgeClass === 'cross-package') return 3;
  if (edgeClass === 'cross-directory') return 2;
  return 1;
}

export function spatialModuleShouldRender({
  zoomLevel,
  hierarchyVisible,
  selected,
  matched,
  selectedEdgeEndpoint,
}: {
  zoomLevel: AnalyzerSpatialZoomLevel;
  hierarchyVisible: boolean;
  selected?: boolean;
  matched?: boolean;
  selectedEdgeEndpoint?: boolean;
}): boolean {
  if (zoomLevel === 'far') return false;
  if (selected || matched || selectedEdgeEndpoint) return true;
  return hierarchyVisible;
}

export function spatialSelectionKind({
  selectedNodeId,
  selectedRegionKind,
  selectedEdgeId,
}: {
  selectedNodeId?: string;
  selectedRegionKind?: AnalyzerRegionKind;
  selectedEdgeId?: string;
}): AnalyzerSpatialSelectionKind {
  if (selectedEdgeId) return 'edge';
  if (selectedNodeId) return 'module';
  if (selectedRegionKind === 'workspace-package') return 'package';
  if (selectedRegionKind === 'directory') return 'directory';
  return 'none';
}

export function spatialUsesRegionAggregation(
  zoomLevel: AnalyzerSpatialZoomLevel,
  selectionKind: AnalyzerSpatialSelectionKind,
): boolean {
  return zoomLevel === 'far' || selectionKind === 'directory' || selectionKind === 'package';
}

export function spatialShowsLocalModuleEdges(
  zoomLevel: AnalyzerSpatialZoomLevel,
  selectionKind: AnalyzerSpatialSelectionKind,
): boolean {
  return zoomLevel !== 'far' && selectionKind !== 'directory' && selectionKind !== 'package';
}

export function spatialNodeBelongsToRegion(
  regionPath: readonly string[] | undefined,
  regionId: string | undefined,
): boolean {
  if (!regionId || !regionPath) return false;
  return regionPath.includes(regionId);
}

export interface SpatialEdgeAggregation {
  sourceId: string;
  targetId: string;
  count: number;
}

/** Presentation-only grouping for a region-to-region edge budget. */
export function aggregateSpatialEdges(
  edges: readonly Pick<SpatialEdgeAggregation, 'sourceId' | 'targetId'>[],
): SpatialEdgeAggregation[] {
  const grouped = new Map<string, SpatialEdgeAggregation>();
  edges.forEach(({ sourceId, targetId }) => {
    if (sourceId === targetId) return;
    const key = `${sourceId}:${targetId}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.count += 1;
      return;
    }
    grouped.set(key, { sourceId, targetId, count: 1 });
  });
  return [...grouped.values()].sort((first, second) => first.sourceId.localeCompare(second.sourceId)
    || first.targetId.localeCompare(second.targetId));
}
