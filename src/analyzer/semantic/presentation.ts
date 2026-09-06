import type { SemanticEdge, SemanticEvidence, SemanticGraph, SemanticNode } from './types';

export const semanticPageSize = 240;
export const semanticGroupKey = (node: SemanticNode) => node.path ? `${node.group} / ${node.path.split('/').slice(0, -1).join('/') || '.'}` : node.group;
export const semanticOverviewId = (node: SemanticNode) => `overview:${node.group} / ${node.path?.split('/').slice(0, 2).join('/') ?? 'runtime'}`;
export function uniqueSemanticEvidence(items: readonly SemanticEvidence[]): SemanticEvidence[] {
  return [...new Map(items.map(item => [`${item.path}:${item.start}:${item.end}:${item.description}`, item])).values()];
}

/** Every original object remains addressable; summaries retain all member IDs. */
export function summarizeSemanticGraph(graph: SemanticGraph, expanded: ReadonlySet<string> = new Set()): SemanticGraph {
  const groups = new Map<string, SemanticNode>(); const owner = new Map<string, string>();
  for (const node of graph.nodes) {
    const key = `${node.group} / ${node.path?.split('/').slice(0, 2).join('/') ?? 'runtime'}`;
    const id = semanticOverviewId(node);
    if (expanded.has(id)) { groups.set(node.id, node); owner.set(node.id, node.id); continue; }
    owner.set(node.id, id);
    const existing = groups.get(id);
    if (existing) {
      (existing.attributes.members as string[]).push(node.id);
      existing.evidence.push(...node.evidence);
      if (node.path) (existing.attributes.files as string[]).push(node.path);
    } else groups.set(id, { id, kind: 'subsystem', label: key, group: node.group, confidence: 'inferred', evidence: [...node.evidence], attributes: { members: [node.id], files: node.path ? [node.path] : [], overview: true } });
  }
  for (const group of groups.values()) if (group.attributes.overview) {
    group.evidence = uniqueSemanticEvidence(group.evidence);
    group.attributes.files = [...new Set(group.attributes.files as string[])];
  }
  const edges = new Map<string, SemanticEdge>(); const counts = new Map<string, number>();
  for (const edge of graph.edges) {
    const source = owner.get(edge.source)!, target = owner.get(edge.target)!;
    if (source === edge.source && target === edge.target) { edges.set(edge.id, edge); continue; }
    // Different relationship kinds and confidence levels must never impersonate the first edge.
    const id = `summary:${JSON.stringify([source, target, edge.kind, edge.confidence])}`;
    counts.set(id, (counts.get(id) ?? 0) + 1);
    const originals = edge.provenance?.edges ?? [edge];
    const existing = edges.get(id);
    if (existing) { existing.evidence.push(...edge.evidence); existing.provenance!.edges.push(...originals); }
    else edges.set(id, { ...edge, id, source, target, evidence: [...edge.evidence], provenance: { edges: [...originals] } });
    edges.get(id)!.label = `${edge.kind} · ${counts.get(id)}関係`;
  }
  for (const edge of edges.values()) if (edge.id.startsWith('summary:')) edge.evidence = uniqueSemanticEvidence(edge.evidence);
  return { ...graph, nodes: [...groups.values()], edges: [...edges.values()] };
}

export interface SemanticPosition { node: SemanticNode; x: number; y: number; z: number }
/** Collapse cycles before assigning depth, so orbit exposes relationship stages. */
export function semanticDepths(graph: SemanticGraph): Map<string, number> {
  const outgoing = new Map(graph.nodes.map(node => [node.id, [] as string[]]));
  for (const edge of graph.edges) if (outgoing.has(edge.source) && outgoing.has(edge.target)) outgoing.get(edge.source)!.push(edge.target);
  const index = new Map<string, number>(), low = new Map<string, number>(), component = new Map<string, number>();
  const stack: string[] = []; const active = new Set<string>(); let next = 0, count = 0;
  const visit = (id: string) => {
    index.set(id, next); low.set(id, next++); stack.push(id); active.add(id);
    for (const target of outgoing.get(id) ?? []) {
      if (!index.has(target)) { visit(target); low.set(id, Math.min(low.get(id)!, low.get(target)!)); }
      else if (active.has(target)) low.set(id, Math.min(low.get(id)!, index.get(target)!));
    }
    if (low.get(id) === index.get(id)) { let member: string; do { member = stack.pop()!; active.delete(member); component.set(member, count); } while (member !== id); count++; }
  };
  for (const node of graph.nodes) if (!index.has(node.id)) visit(node.id);
  const links = Array.from({ length: count }, () => new Set<number>()), incoming = Array.from({ length: count }, () => 0), depths = incoming.slice();
  for (const edge of graph.edges) { const a = component.get(edge.source), b = component.get(edge.target); if (a !== undefined && b !== undefined && a !== b && !links[a]!.has(b)) { links[a]!.add(b); incoming[b]!++; } }
  const queue = incoming.flatMap((value, id) => value ? [] : [id]);
  for (let i = 0; i < queue.length; i++) { const id = queue[i]!; for (const target of links[id]!) { depths[target] = Math.max(depths[target]!, depths[id]! + 1); if (!--incoming[target]!) queue.push(target); } }
  return new Map([...component].map(([id, group]) => [id, depths[group]!]));
}
export function layoutSemanticGraph(graph: SemanticGraph, orbit: boolean): SemanticPosition[] {
  const categories = new Map<string, SemanticNode[]>();
  const runtimeRank: Record<string, number> = { entry: 0, function: 1, request: 2, operation: 3, resource: 4, model: 5, span: 1, log: 2 };
  for (const node of graph.nodes) {
    const key = graph.view === 'runtime-flow' ? `${runtimeRank[node.kind] ?? 3} ${node.kind}` : node.group;
    const items = categories.get(key) ?? []; items.push(node); categories.set(key, items);
  }
  const result: SemanticPosition[] = []; let left = 0;
  const depths = orbit ? semanticDepths(graph) : new Map<string, number>();
  for (const [, items] of [...categories].sort(([a], [b]) => a.localeCompare(b))) {
    const columns = Math.max(1, Math.ceil(Math.sqrt(items.length / 2)));
    items.sort((a, b) => (a.path ?? '').localeCompare(b.path ?? '') || (a.line ?? 0) - (b.line ?? 0));
    items.forEach((node, index) => result.push({ node, x: left + index % columns * 240, y: -Math.floor(index / columns) * 100, z: orbit ? -(depths.get(node.id) ?? 0) * 100 : 0 }));
    left += columns * 240 + 100;
  }
  return result;
}
