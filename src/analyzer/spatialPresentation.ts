import type { AnalyzerRegionKind } from './types';

export type AnalyzerSpatialZoomLevel = 'far' | 'medium' | 'near';
export type AnalyzerSpatialEdgeClass = 'local' | 'cross-directory' | 'cross-package';

/** The renderer keeps a small amount of depth so the map remains an atlas, not a block sculpture. */
export const ANALYZER_SPATIAL_TILT_DEGREES = 24;
export const ANALYZER_SPATIAL_INITIAL_SCALE = 0.5;
export const ANALYZER_SPATIAL_REGION_ELEVATION = 4;
export const ANALYZER_SPATIAL_MODULE_ELEVATION = 18;
export const ANALYZER_SPATIAL_LOCAL_EDGE_ALTITUDE = 25;
export const ANALYZER_SPATIAL_DIRECTORY_EDGE_ALTITUDE = 38;
export const ANALYZER_SPATIAL_PACKAGE_EDGE_ALTITUDE = 54;

export function spatialModuleBudget(zoomLevel: AnalyzerSpatialZoomLevel): number {
  if (zoomLevel === 'far') return 0;
  if (zoomLevel === 'medium') return 220;
  return 900;
}

export function spatialEdgeBudget(zoomLevel: AnalyzerSpatialZoomLevel): number {
  if (zoomLevel === 'far') return 120;
  if (zoomLevel === 'medium') return 420;
  return 1200;
}

export function spatialRegionDepthElevation(regionKind: AnalyzerRegionKind, depth = 0): number {
  if (regionKind === 'workspace-package') return 2;
  return ANALYZER_SPATIAL_REGION_ELEVATION + Math.min(12, Math.max(0, depth) * 1.5);
}

export function spatialModuleElevation(regionDepth = 0): number {
  return ANALYZER_SPATIAL_MODULE_ELEVATION + Math.min(10, Math.max(0, regionDepth) * 0.75);
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

export function spatialEdgeAltitude(edgeClass: AnalyzerSpatialEdgeClass): number {
  if (edgeClass === 'cross-package') return ANALYZER_SPATIAL_PACKAGE_EDGE_ALTITUDE;
  if (edgeClass === 'cross-directory') return ANALYZER_SPATIAL_DIRECTORY_EDGE_ALTITUDE;
  return ANALYZER_SPATIAL_LOCAL_EDGE_ALTITUDE;
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
  if (selected || matched || selectedEdgeEndpoint) return true;
  return zoomLevel !== 'far' && hierarchyVisible;
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
