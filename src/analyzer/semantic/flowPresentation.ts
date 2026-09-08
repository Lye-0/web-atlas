import { analyzerDirectionColors, analyzerEdgeDirection } from '../edgeDirection';
import { semanticDepths, semanticOverviewId, summarizeSemanticGraph, type SemanticPosition } from './presentation';
import type { SemanticEdge, SemanticGraph, SemanticNode } from './types';
import { semanticRegionIdentity } from './flowRegions';
import { layoutSemanticCloud } from './flowCloud';
import type { SemanticExplorerModel } from './semanticExplorer';

export interface FlowPoint { x: number; y: number; z: number }
export interface FlowEdgePath { edge: SemanticEdge; points: FlowPoint[]; svgPath: string; color: string; selected: boolean; direction?: 'incoming' | 'outgoing' | 'internal' }

export function presentSemanticFlow(graph: SemanticGraph, expanded: ReadonlySet<string>, overview: boolean): SemanticGraph {
  if (!overview || graph.nodes.length <= 120) return graph;
  const groupSizes = new Map<string, number>();
  for (const node of graph.nodes) { const id = semanticOverviewId(node); groupSizes.set(id, (groupSizes.get(id) ?? 0) + 1); }
  const open = new Set([...expanded, ...[...groupSizes].filter(([, count]) => count === 1).map(([id]) => id)]);
  const summarized = summarizeSemanticGraph(graph, open);
  const owners = new Map(summarized.nodes.flatMap(node => semanticMemberIds(node).map(id => [id, node.id] as const)));
  // Display endpoints may be groups; every line still has its original canonical relation ID.
  return { ...summarized, edges: graph.edges.map(edge => ({ ...edge, source: owners.get(edge.source)!, target: owners.get(edge.target)!,
    provenance: edge.provenance ?? { edges: [edge] } })) };
}

export function semanticMemberIds(node: SemanticNode): string[] {
  return node.attributes.overview && Array.isArray(node.attributes.members) ? node.attributes.members : [node.id];
}

/** SCC depth follows source→target; grouping never invents or reverses a relationship. */
export function layoutSemanticFlow(graph: SemanticGraph, mode: '2d' | '3d', explorer?: SemanticExplorerModel): SemanticPosition[] {
  if (mode === '3d') return layoutSemanticCloud(graph, explorer);
  const depths = semanticDepths(graph);
  const groups = new Map<string, { label: string; stages: Map<number, SemanticNode[]>; columns: number; rows: number; offset: number }>();
  for (const node of graph.nodes) {
    const identity = semanticRegionIdentity(node), depth = depths.get(node.id) ?? 0;
    const group = groups.get(identity.id) ?? { label: identity.label, stages: new Map(), columns: 1, rows: 1, offset: 0 };
    const stage = group.stages.get(depth) ?? []; stage.push(node); group.stages.set(depth, stage); groups.set(identity.id, group);
  }
  const ordered = [...groups].sort(([idA, a], [idB, b]) => a.label.localeCompare(b.label) || idA.localeCompare(idB));
  const widths = new Map<number, number>(); let offset = 0;
  for (const [, group] of ordered) {
    const maximum = Math.max(1, ...[...group.stages.values()].map(nodes => nodes.length));
    group.columns = Math.max(1, Math.ceil(Math.sqrt(maximum / 6)));
    group.rows = Math.ceil(maximum / group.columns);
    group.offset = offset; offset += group.rows * 86 + 96;
    for (const [depth, nodes] of group.stages) widths.set(depth, Math.max(widths.get(depth) ?? 0, Math.min(group.columns, nodes.length) * 242 + 86));
  }
  const stageX = new Map<number, number>(); let x = 0;
  for (const [depth, width] of [...widths].sort(([a], [b]) => a - b)) { stageX.set(depth, x); x += width; }
  const result: SemanticPosition[] = [];
  for (const [, group] of ordered) for (const [depth, nodes] of [...group.stages].sort(([a], [b]) => a - b)) {
    nodes.sort((a, b) => (a.path ?? '').localeCompare(b.path ?? '') || (a.line ?? 0) - (b.line ?? 0) || a.id.localeCompare(b.id));
    nodes.forEach((node, index) => {
      result.push({ node, x: stageX.get(depth)! + index % group.columns * 242, y: group.offset + Math.floor(index / group.columns) * 86, z: 0 });
    });
  }
  return result;
}

function cubicCurve(start: FlowPoint, c1: FlowPoint, c2: FlowPoint, end: FlowPoint) {
  const points = Array.from({ length: 49 }, (_, index) => {
    const t = index / 48, u = 1 - t;
    return { x: u ** 3 * start.x + 3 * u ** 2 * t * c1.x + 3 * u * t ** 2 * c2.x + t ** 3 * end.x,
      y: u ** 3 * start.y + 3 * u ** 2 * t * c1.y + 3 * u * t ** 2 * c2.y + t ** 3 * end.y,
      z: u ** 3 * start.z + 3 * u ** 2 * t * c1.z + 3 * u * t ** 2 * c2.z + t ** 3 * end.z };
  });
  return { points, svgPath: `M${start.x},${start.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${end.x},${end.y}` };
}

function curve(a: FlowPoint, b: FlowPoint, bend: number | undefined, mode: '2d' | '3d') {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const length = Math.hypot(dx, dy, dz);
  if (length < .01) {
    const side = (bend ?? 0) < 0 ? 1 : -1, extra = Math.abs(bend ?? 0);
    const start = mode === '2d' ? { x: a.x + 110, y: a.y + side * 10, z: a.z } : { x: a.x, y: a.y, z: a.z };
    const end = mode === '2d' ? { x: a.x + 42, y: a.y + side * 34, z: a.z } : { x: b.x, y: b.y, z: b.z };
    const c1 = { x: a.x + (mode === '2d' ? 200 : 58) + extra, y: start.y, z: a.z };
    const c2 = { x: a.x + (mode === '2d' ? 164 : 48), y: a.y + side * ((mode === '2d' ? 112 : 56) + extra), z: a.z };
    return cubicCurve(start, c1, c2, end);
  }
  // 3D dots use screen-pixel sizes: a world-space trim leaves a zoom-dependent gap.
  // Center endpoints share the dots' exact transform; label placement is independent.
  const boundary = mode === '2d' ? 1 / Math.max(Math.abs(dx / length) / 106, Math.abs(dy / length) / 30) + 4 : 0;
  const normalLength = Math.hypot(dx, dy);
  const normal = normalLength > .0001 ? { x: -dy / normalLength, y: dx / normalLength, z: 0 }
    : { x: dz >= 0 ? 1 : -1, y: 0, z: 0 };
  const trim = Math.min(.45, boundary / length);
  const start = { x: a.x + dx * trim, y: a.y + dy * trim, z: a.z + dz * trim };
  const end = { x: b.x - dx * trim, y: b.y - dy * trim, z: b.z - dz * trim };
  // A gentle arch also distinguishes a single connection from the node/lane grid.
  const arc = bend ?? Math.min(mode === '2d' ? 56 : 38, Math.max(6, length * (1 - 2 * trim) * .18));
  const control = (t: number) => ({ x: start.x + (end.x - start.x) * t + normal.x * arc * 4 / 3,
    y: start.y + (end.y - start.y) * t + normal.y * arc * 4 / 3, z: start.z + (end.z - start.z) * t });
  return cubicCurve(start, control(1 / 3), control(2 / 3), end);
}

export function semanticFlowEdgePaths(graph: SemanticGraph, positions: readonly SemanticPosition[], selection: ReadonlySet<string>, selectedEdgeId: string | undefined, mode: '2d' | '3d', selectedOnly = false): FlowEdgePath[] {
  const byId = new Map(positions.map(position => [position.node.id, position]));
  const pairs = new Map<string, SemanticEdge[]>();
  for (const edge of graph.edges) {
    const key = JSON.stringify([edge.source, edge.target].sort());
    const pair = pairs.get(key) ?? []; pair.push(edge); pairs.set(key, pair);
  }
  const slots = new Map<string, { index: number; count: number }>();
  for (const pair of pairs.values()) pair.forEach((edge, index) => slots.set(edge.id, { index, count: pair.length }));
  return graph.edges.flatMap(edge => {
    const source = edge.provenance?.edges[0]?.source ?? edge.source;
    const target = edge.provenance?.edges.at(-1)?.target ?? edge.target;
    const direction = analyzerEdgeDirection(source, target, selection) ?? analyzerEdgeDirection(edge.source, edge.target, selection);
    const selected = Boolean(direction || edge.id === selectedEdgeId || edge.provenance?.edges.some(item => item.id === selectedEdgeId));
    if (selectedOnly && !selected) return [];
    const a = byId.get(edge.source), b = byId.get(edge.target); if (!a || !b) return [];
    const slot = slots.get(edge.id)!;
    const spacing = Math.min(32, (mode === '2d' ? 144 : 80) / Math.max(1, slot.count - 1));
    const bend = slot.count > 1 ? (slot.index - (slot.count - 1) / 2 + (slot.count % 2 ? .25 : 0)) * spacing * (edge.source.localeCompare(edge.target) > 0 ? -1 : 1) : undefined;
    return [{ edge, ...curve(a, b, bend, mode), direction, selected, color: direction ? analyzerDirectionColors[direction] : selected ? analyzerDirectionColors.outgoing : '#496660' }];
  });
}

export function sampleFlowPath(points: readonly FlowPoint[], progress: number): FlowPoint {
  const lengths = [0];
  for (let index = 1; index < points.length; index++) lengths.push(lengths[index - 1]! + Math.hypot(points[index]!.x - points[index - 1]!.x, points[index]!.y - points[index - 1]!.y, points[index]!.z - points[index - 1]!.z));
  const distance = ((progress % 1) + 1) % 1 * lengths.at(-1)!;
  const index = Math.max(1, lengths.findIndex(length => length >= distance));
  const t = (distance - lengths[index - 1]!) / Math.max(.0001, lengths[index]! - lengths[index - 1]!);
  const a = points[index - 1]!, b = points[index]!;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}
