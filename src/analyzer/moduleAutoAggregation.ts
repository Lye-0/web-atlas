import { buildAggregationGroups, type AggregationGroup, type AggregationProjection } from './autoAggregation';
import type { PositionedNode, PositionedSemanticRegion } from './layout';
import { moduleWorldAnchor, projectSpatialPoint, type SpatialCameraModel } from './spatialCoordinates';
import { spatialModuleElevation } from './spatialPresentation';
import type { AnalyzerEvidence, AnalyzerViewEdge } from './types';
import type { DisplayAggregation } from './autoAggregation';

/** Resolve a display group to an existing shared ancestor, never to an arbitrary member file. */
export function moduleAggregateRegions(groups: readonly DisplayAggregation[], modules: readonly PositionedNode[], regions: readonly PositionedSemanticRegion[]) {
  const paths = new Map(modules.map(({ node }) => [node.id, Array.isArray(node.metadata.regionPath) ? node.metadata.regionPath as string[] : []]));
  const visible = new Map(regions.map(region => [region.region.id, region]));
  const result = new Map<string, PositionedSemanticRegion>();
  for (const group of groups) {
    const members = group.memberIds.map(id => paths.get(id) ?? []);
    const common = [...members[0] ?? []].reverse().find(id => visible.has(id) && members.every(path => path.includes(id)));
    if (common) result.set(group.id, visible.get(common)!);
  }
  return result;
}

export function moduleRelationEvidenceCounts(edge: Pick<AnalyzerViewEdge, 'evidenceIds'>, evidenceById: ReadonlyMap<string, AnalyzerEvidence>): { evidenceCount: number; siteCount?: number } {
  const ids = [...new Set(edge.evidenceIds)], sites = new Set<string>();
  let complete = true;
  for (const id of ids) {
    const item = evidenceById.get(id);
    if (!item?.highlightRanges.length) { complete = false; continue; }
    for (const range of item.highlightRanges) sites.add(JSON.stringify([item.filePath, range.start.line, range.start.column, range.end.line, range.end.column]));
  }
  return { evidenceCount: ids.length, ...(complete ? { siteCount: sites.size } : {}) };
}

export function moduleAggregationInput(modules: readonly PositionedNode[]) {
  const points = modules.map(item => {
    const node = item.node, path = typeof node.metadata.modulePath === 'string' ? node.metadata.modulePath : node.label;
    const directory = typeof node.metadata.directoryPath === 'string' ? node.metadata.directoryPath : path.split('/').slice(0, -1).join('/');
    const regionPath = Array.isArray(node.metadata.regionPath) ? node.metadata.regionPath : [];
    const elevation = spatialModuleElevation(Math.max(0, regionPath.length - 1));
    const parent = directory.split('/').slice(0, -1).join('/');
    return { id: node.id, ...moduleWorldAnchor(item, elevation), category: 'モジュール',
      group: { id: JSON.stringify(['module-dependency', node.metadata.packageId ?? '', directory]), label: `${directory || 'プロジェクト直下'} · モジュール`, minimumMembers: 8 },
      parentGroups: [{ id: JSON.stringify(['module-dependency', 'parent-directory', node.metadata.packageId ?? '', parent]), label: `${parent || 'プロジェクト直下'} · 下位ディレクトリを含むモジュール集合`, minimumMembers: 16, level: 1, maximumProjectedSpan: 280 }] };
  });
  return { points, groups: buildAggregationGroups(points) };
}

/** The module renderer uses x/right, y/floor-depth, z/elevation. Preserve that basis. */
export function moduleAggregationProjection(camera: SpatialCameraModel): AggregationProjection {
  const origin = projectSpatialPoint({ x: 0, y: 0, z: 0 }, camera);
  const axes = [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }].map(point => projectSpatialPoint(point, camera));
  const width = Math.max(1, camera.viewportWidth), height = Math.max(1, camera.viewportHeight);
  return { width, height, zoom: camera.scale, matrix: [...axes.flatMap(point => [(point.x - origin.x) * 2 / width, (point.y - origin.y) * 2 / height, 0, 0]), origin.x * 2 / width, origin.y * 2 / height, 0, 1] };
}

export function moduleManualGroups(modules: readonly PositionedNode[], visibleIds: ReadonlySet<string>, expanded: ReadonlySet<string>, names: ReadonlyMap<string, string>): AggregationGroup[] {
  const input = moduleAggregationInput(modules);
  const byId = new Map(modules.map(item => [item.node.id, item.node]));
  return buildAggregationGroups(input.points.filter(point => !visibleIds.has(point.id)).map(point => {
    const path = byId.get(point.id)!.metadata.regionPath;
    const closed = (Array.isArray(path) ? path : []).find(id => names.has(id) && !expanded.has(id)) ?? 'manual-scope';
    return { ...point, parentGroups: [], group: { id: `module-manual:${closed}`, label: `${names.get(closed) ?? closed} · 手動で閉じた範囲`, minimumMembers: 1 } };
  }));
}
