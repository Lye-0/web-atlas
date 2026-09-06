import { analyzerDirectionColors, analyzerEdgeDirection } from '../edgeDirection';
import { semanticDepths, semanticOverviewId, summarizeSemanticGraph, type SemanticPosition } from './presentation';
import type { SemanticEdge, SemanticGraph, SemanticNode } from './types';

export interface FlowPoint { x: number; y: number; z: number }
export interface FlowEdgePath { edge: SemanticEdge; points: FlowPoint[]; color: string; selected: boolean; direction?: 'incoming' | 'outgoing' | 'internal' }

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
export function layoutSemanticFlow(graph: SemanticGraph, mode: '2d' | '3d'): SemanticPosition[] {
  const depths = semanticDepths(graph);
  const stages = new Map<number, SemanticNode[]>();
  for (const node of graph.nodes) {
    const depth = depths.get(node.id) ?? 0;
    const stage = stages.get(depth) ?? []; stage.push(node); stages.set(depth, stage);
  }
  const result: SemanticPosition[] = [];
  for (const [depth, nodes] of [...stages].sort(([a], [b]) => a - b)) {
    nodes.sort((a, b) => a.group.localeCompare(b.group) || (a.path ?? '').localeCompare(b.path ?? '') || (a.line ?? 0) - (b.line ?? 0) || a.id.localeCompare(b.id));
    if (mode === '3d') {
      // Stable compact planes: every canonical target is present, with depth revealing progression.
      const columns = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
      nodes.forEach((node, index) => result.push({ node, x: depth * 250, y: (index % columns - (columns - 1) / 2) * 50,
        z: (Math.floor(index / columns) - (Math.ceil(nodes.length / columns) - 1) / 2) * 50 }));
    } else {
      const columns = Math.max(1, Math.ceil(Math.sqrt(nodes.length / 6)));
      // Parallel lanes within one stage keep long graphs navigable without classifying by kind alone.
      const beforeWidth = [...stages].filter(([other]) => other < depth).reduce((sum, [, previous]) => sum + Math.max(1, Math.ceil(Math.sqrt(previous.length / 6))) * 242 + 86, 0);
      nodes.forEach((node, index) => result.push({ node, x: beforeWidth + index % columns * 242, y: Math.floor(index / columns) * 86, z: 0 }));
    }
  }
  return result;
}

function curve(a: FlowPoint, b: FlowPoint, bend: number, mode: '2d' | '3d'): FlowPoint[] {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const length = Math.hypot(dx, dy, dz);
  if (length < .01) {
    const side = bend < 0 ? 1 : -1, extra = Math.abs(bend);
    const start = mode === '2d' ? { x: a.x + 110, y: a.y + side * 10, z: a.z } : { x: a.x + 8, y: a.y, z: a.z };
    const end = mode === '2d' ? { x: a.x + 42, y: a.y + side * 34, z: a.z } : { x: a.x, y: a.y + side * 8, z: a.z };
    const c1 = { x: a.x + (mode === '2d' ? 200 : 58) + extra, y: start.y, z: a.z };
    const c2 = { x: a.x + (mode === '2d' ? 164 : 48), y: a.y + side * ((mode === '2d' ? 112 : 56) + extra), z: a.z };
    return Array.from({ length: 33 }, (_, index) => {
      const t = index / 32, u = 1 - t;
      return { x: u ** 3 * start.x + 3 * u ** 2 * t * c1.x + 3 * u * t ** 2 * c2.x + t ** 3 * end.x,
        y: u ** 3 * start.y + 3 * u ** 2 * t * c1.y + 3 * u * t ** 2 * c2.y + t ** 3 * end.y, z: a.z };
    });
  }
  const boundary = mode === '2d' ? 1 / Math.max(Math.abs(dx / length) / 106, Math.abs(dy / length) / 30) + 4 : 7;
  const normalLength = Math.hypot(dx, dy);
  const normal = normalLength > .0001 ? { x: -dy / normalLength, y: dx / normalLength, z: 0 }
    : { x: dz >= 0 ? 1 : -1, y: 0, z: 0 };
  return Array.from({ length: 25 }, (_, index) => {
    const t = index / 24;
    const trimmed = boundary / length + t * Math.max(0, 1 - boundary * 2 / length);
    const offset = Math.sin(t * Math.PI) * bend;
    return { x: a.x + dx * trimmed + normal.x * offset, y: a.y + dy * trimmed + normal.y * offset, z: a.z + dz * trimmed };
  });
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
    const direction = analyzerEdgeDirection(source, target, selection);
    const selected = Boolean(direction || edge.id === selectedEdgeId || edge.provenance?.edges.some(item => item.id === selectedEdgeId));
    if (selectedOnly && !selected) return [];
    const a = byId.get(edge.source), b = byId.get(edge.target); if (!a || !b) return [];
    const slot = slots.get(edge.id)!;
    const spacing = Math.min(32, (mode === '2d' ? 144 : 80) / Math.max(1, slot.count - 1));
    const bend = slot.count > 1 ? (slot.index - (slot.count - 1) / 2) * spacing * (edge.source.localeCompare(edge.target) > 0 ? -1 : 1) : 0;
    return [{ edge, points: curve(a, b, bend, mode), direction, selected, color: direction ? analyzerDirectionColors[direction] : selected ? analyzerDirectionColors.outgoing : '#496660' }];
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
