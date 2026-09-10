import type { SemanticNode } from './types';
import type { SemanticPosition } from './presentation';
import { explorerRegionIdentity, type SemanticExplorerModel } from './semanticExplorer';

export interface SemanticRegionIdentity { id: string; label: string; kind: 'directory' | 'group' }
export interface SemanticMapRect { x: number; y: number; width: number; height: number }
export interface SemanticFlowRegion extends SemanticRegionIdentity, SemanticMapRect { z: number; depth?: number; count: number; nodeIds: string[] }

/** Source locations come from recorded paths; runtime-only objects retain their known group. */
export function semanticRegionIdentity(node: SemanticNode): SemanticRegionIdentity {
  if (node.architecture) return { id: node.architecture.parentId ?? 'architecture-project', label: node.group || 'プロジェクト', kind: 'group' };
  if (node.kind === 'external') return { id: 'group:unresolved-calls', label: '定義先が未特定の呼び出し', kind: 'group' };
  const paths = node.path ? [node.path] : node.attributes.overview && Array.isArray(node.attributes.files) ? node.attributes.files : [];
  const directories = paths.map(path => path.replaceAll('\\', '/').replace(/^\.\//, '').split('/').slice(0, -1));
  if (directories.length) {
    const common = [...directories[0]!];
    for (const directory of directories.slice(1)) while (common.length && !common.every((part, index) => directory[index] === part)) common.pop();
    if (common.length || directories.every(directory => directory.length === 0)) {
      const path = common.join('/') || '.';
      return { id: `directory:${path}`, label: path === '.' ? 'プロジェクト直下' : path, kind: 'directory' };
    }
  }
  return { id: `group:${node.group}`, label: node.group || '所属情報なし', kind: 'group' };
}

export function semanticFlowRegions(positions: readonly SemanticPosition[], mode: '2d' | '3d', explorer?: SemanticExplorerModel): SemanticFlowRegion[] {
  const groups = new Map<string, { identity: SemanticRegionIdentity; positions: SemanticPosition[] }>();
  for (const position of positions) {
    const identity = explorer ? explorerRegionIdentity(explorer, position.node.id) : semanticRegionIdentity(position.node);
    const group = groups.get(identity.id) ?? { identity, positions: [] };
    group.positions.push(position); groups.set(identity.id, group);
  }
  return [...groups.values()].map(({ identity, positions: members }) => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    const ids = new Set<string>();
    for (const point of members) {
      minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x); minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y); minZ = Math.min(minZ, point.z); maxZ = Math.max(maxZ, point.z);
      const originals = point.node.attributes.overview && Array.isArray(point.node.attributes.members) ? point.node.attributes.members : [point.node.id];
      for (const id of originals) ids.add(id);
    }
    const horizontal = mode === '2d' ? 132 : 18, above = mode === '2d' ? 64 : 18, below = mode === '2d' ? 48 : 18;
    return { ...identity, x: minX - horizontal, y: minY - above, width: maxX - minX + horizontal * 2, height: maxY - minY + above + below,
      z: minZ - 20, depth: maxZ - minZ + 40, count: ids.size, nodeIds: members.map(point => point.node.id) };
  });
}

export function semanticMapBounds(regions: readonly SemanticMapRect[]): SemanticMapRect {
  if (!regions.length) return { x: 0, y: 0, width: 1, height: 1 };
  let x = Infinity, y = Infinity, right = -Infinity, bottom = -Infinity;
  for (const region of regions) { x = Math.min(x, region.x); y = Math.min(y, region.y); right = Math.max(right, region.x + region.width); bottom = Math.max(bottom, region.y + region.height); }
  return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
}

export function semanticVisibleRegions(regions: readonly SemanticFlowRegion[], viewport: SemanticMapRect) {
  const intersecting = regions.map(region => ({ region, area: Math.max(0, Math.min(region.x + region.width, viewport.x + viewport.width) - Math.max(region.x, viewport.x))
    * Math.max(0, Math.min(region.y + region.height, viewport.y + viewport.height) - Math.max(region.y, viewport.y)) })).filter(item => item.area > 0).sort((a, b) => b.area - a.area || a.region.label.localeCompare(b.region.label));
  if (!intersecting.length) return { label: '領域の外', ids: [] as string[] };
  const all = regions.every(region => region.x >= viewport.x && region.y >= viewport.y && region.x + region.width <= viewport.x + viewport.width && region.y + region.height <= viewport.y + viewport.height);
  return { label: all ? `全体 · ${regions.length}領域` : intersecting.length <= 2 ? intersecting.map(item => item.region.label).join(' / ') : `${intersecting[0]!.region.label} ほか${intersecting.length - 1}領域`, ids: intersecting.map(item => item.region.id) };
}
