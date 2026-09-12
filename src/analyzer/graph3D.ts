import type { AnalyzerSemanticRegion, AnalyzerViewEdge, AnalyzerViewModel, AnalyzerViewNode } from './types';
import { buildAggregationGroups, type AggregationGroup, type AggregationPoint } from './autoAggregation';

export type Graph3DVector = [number, number, number];
export interface Graph3DPoint extends AggregationPoint { original: AnalyzerViewNode; primitive: 'panel' | 'point' }
export interface Graph3DRegion { original: AnalyzerSemanticRegion; center: Graph3DVector; size: Graph3DVector; memberIds: string[] }
/** Rendering data only. Original objects and IDs are retained, never synthesized facts. */
export interface AnalyzerGraph3D { source: AnalyzerViewModel; points: Graph3DPoint[]; regions: Graph3DRegion[]; edges: AnalyzerViewEdge[]; groups: AggregationGroup[] }
export interface Graph3DCamera { schema: 1; view: AnalyzerViewModel['view']; input: string; position: Graph3DVector; target: Graph3DVector; zoom: number }
export function compatibleGraph3DCamera(camera: Graph3DCamera | undefined, model: AnalyzerViewModel, input: string): camera is Graph3DCamera {
  return Boolean(camera && camera.schema === 1 && camera.view === model.view && camera.input === input && camera.zoom > 0 && Number.isFinite(camera.zoom)
    && camera.position.length === 3 && camera.target.length === 3 && [...camera.position, ...camera.target].every(Number.isFinite));
}

interface Volume { size: Graph3DVector; points: Graph3DPoint[]; regions: Graph3DRegion[] }
function translate(volume: Volume, axis: number, amount: number): Volume {
  return { ...volume, points: volume.points.map(point => ({ ...point, x: point.x + (axis === 0 ? amount : 0), y: point.y + (axis === 1 ? amount : 0), z: point.z + (axis === 2 ? amount : 0) })),
    regions: volume.regions.map(region => ({ ...region, center: region.center.map((v, i) => v + (i === axis ? amount : 0)) as Graph3DVector })) };
}
/** Recursive balanced box packing: sibling volumes are disjoint on the split axis. */
function pack(volumes: Volume[], gap: number, depth = 0): Volume {
  if (!volumes.length) return { size: [40, 40, 40], points: [], regions: [] };
  if (volumes.length === 1) return volumes[0]!;
  const weights = volumes.map(volume => volume.size.reduce((a, b) => a * b, 1));
  const half = weights.reduce((a, b) => a + b, 0) / 2;
  let split = 1, weight = weights[0]!;
  while (split < volumes.length - 1 && weight < half) weight += weights[split++]!;
  const a = pack(volumes.slice(0, split), gap, depth + 1), b = pack(volumes.slice(split), gap, depth + 1);
  const panelPacking = volumes.some(volume => volume.points.some(point => point.primitive === 'panel'));
  const axes = panelPacking ? [0, 1] : [0, 1, 2].map(i => (i + depth) % 3);
  const candidates = axes.map(axis => {
    const size = a.size.map((v, d) => d === axis ? v + b.size[d]! + gap : Math.max(v, b.size[d]!)) as Graph3DVector;
    return { axis, size, score: Math.max(...size) + Math.hypot(...size) * .1 };
  }).sort((a, b) => a.score - b.score);
  const { axis, size } = candidates[0]!;
  const first = translate(a, axis, -(b.size[axis]! + gap) / 2), second = translate(b, axis, (a.size[axis]! + gap) / 2);
  return { size, points: [...first.points, ...second.points], regions: [...first.regions, ...second.regions] };
}
const cache = new WeakMap<AnalyzerViewModel, AnalyzerGraph3D>();
export function layoutAnalyzerGraph3D(source: AnalyzerViewModel): AnalyzerGraph3D {
  const cached = cache.get(source); if (cached) return cached;
  const isCloud = source.view === 'dependencies' || source.view === 'module-dependency';
  const nodes = source.nodes.filter(node => source.view === 'module-dependency' ? node.type === 'module' : source.view === 'dependencies' ? node.presentation?.role !== 'summary' : true);
  let points: Graph3DPoint[] = nodes.map(original => ({ id: original.id, original, primitive: isCloud ? 'point' : 'panel', x: 0, y: 0, z: 0, category: original.type }));
  let regions: Graph3DRegion[] = [];
  if (source.view === 'architecture' || source.view === 'module-dependency') {
    const originals = source.regions ?? [];
    const byId = new Map(originals.map(region => [region.id, region]));
    const assigned = new Set<string>();
    const children = new Map<string, AnalyzerSemanticRegion[]>();
    for (const region of originals) if (region.parentRegionId && byId.has(region.parentRegionId)) children.set(region.parentRegionId, [...children.get(region.parentRegionId) ?? [], region]);
    const leaf = (point: Graph3DPoint): Volume => ({ size: isCloud ? [36, 36, 36] : [230, 150, 350], points: [point], regions: [] });
    const build = (region: AnalyzerSemanticRegion, ancestors: AnalyzerSemanticRegion[], visiting: Set<string>): Volume => {
      if (visiting.has(region.id)) return pack([], 0);
      const path = [...ancestors, region], next = new Set(visiting).add(region.id);
      const nested = (children.get(region.id) ?? []).sort((a, b) => a.id.localeCompare(b.id)).map(child => build(child, path, next));
      const direct = points.filter(point => region.childIds.includes(point.id) && !assigned.has(point.id)).sort((a, b) => a.id.localeCompare(b.id));
      direct.forEach(point => { assigned.add(point.id); point.group = { id: region.id, label: region.label, level: path.length, minimumMembers: 6 }; point.parentGroups = ancestors.map((parent, index) => ({ id: parent.id, label: parent.label, level: index + 1, minimumMembers: 6 })); });
      const content = pack([...nested, ...direct.map(leaf)], isCloud ? 24 : 70);
      const size = content.size.map(value => value + (isCloud ? 38 : 70)) as Graph3DVector;
      return { ...content, size, regions: [...content.regions, { original: region, center: [0, 0, 0], size, memberIds: content.points.map(point => point.id) }] };
    };
    const roots = originals.filter(region => !region.parentRegionId || !byId.has(region.parentRegionId)).sort((a, b) => a.id.localeCompare(b.id));
    const volumes = roots.map((region, index) => {
      const volume = build(region, [], new Set());
      return isCloud ? volume : translate(volume, 2, (index - (roots.length - 1) / 2) * 150);
    });
    const packed = pack([...volumes, ...points.filter(point => !assigned.has(point.id)).map(leaf)], isCloud ? 90 : 150);
    points = packed.points; regions = packed.regions;
  } else if (source.view === 'dependencies') {
    const grouped = new Map<string, Graph3DPoint[]>();
    for (const point of points) {
      const id = String(point.original.metadata.externalGroupId ?? point.original.type);
      point.group = { id, label: source.nodes.find(node => node.id === point.original.presentation?.parentId)?.label ?? id, minimumMembers: 6 };
      grouped.set(id, [...grouped.get(id) ?? [], point]);
    }
    points = pack([...grouped].sort(([a], [b]) => a.localeCompare(b)).map(([, members]) => pack(members.sort((a, b) => a.id.localeCompare(b.id)).map(point => ({ size: [48, 48, 48], points: [point], regions: [] })), 20)), 150).points;
  } else {
    const lanes = [...new Set(points.map(point => String(point.original.metadata.laneId ?? point.original.metadata.branchPath ?? point.original.type)))].sort();
    const occupied = new Map<string, number>();
    points = points.map(point => {
      const node = point.original;
      const rank = source.view === 'command' ? Number(node.metadata.executionRank ?? 0) : ({ project: 0, 'workspace-config': 1, 'workspace-pattern': 2, 'workspace-package': 3 } as Record<string, number>)[node.type] ?? 3;
      const lane = lanes.indexOf(String(node.metadata.laneId ?? node.metadata.branchPath ?? node.type));
      const key = `${rank}:${lane}`, slot = occupied.get(key) ?? 0; occupied.set(key, slot + 1);
      return { ...point, x: rank * 280, y: -slot * 120 - (source.view === 'command' ? lane * 150 : 0), z: (lane - (lanes.length - 1) / 2) * 180 + slot % 3 * 100 };
    });
  }
  const ids = new Set([...points.map(point => point.id), ...regions.map(region => region.original.id)]);
  const edges = source.edges.filter(edge => edge.presentation?.displayKind !== 'bundle' && ids.has(edge.sourceId) && ids.has(edge.targetId));
  const result = { source, points, regions, edges, groups: buildAggregationGroups(points) };
  cache.set(source, result); return result;
}
