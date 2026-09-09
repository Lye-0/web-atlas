import type { SemanticEdge, SemanticEvidence, SemanticGraph, SemanticRelationSource } from './types';
const id = (...parts: string[]) => `architecture:${JSON.stringify(parts)}`;
/** Semantic aggregation preserves relation kind, confidence, environment and every
 * original relation; it asserts structural adjacency, not end-to-end execution. */
export function aggregateArchitectureEdges(edges: SemanticEdge[], owners: ReadonlyMap<string, string>): SemanticEdge[] {
  const grouped = new Map<string, { edge: SemanticEdge; originals: Map<string, SemanticRelationSource>; evidence: Map<string, SemanticEvidence> }>();
  for (const edge of edges) {
    const source = owners.get(edge.source), target = owners.get(edge.target); if (!source || !target) continue;
    const key = id('summary-edge', source, target, edge.kind, edge.confidence, edge.details?.environment ?? '');
    let group = grouped.get(key);
    if (!group) { group = { edge: { ...edge, id: key, source, target }, originals: new Map(), evidence: new Map() }; grouped.set(key, group); }
    for (const original of edge.provenance?.edges ?? [edge]) group.originals.set(original.id, original);
    for (const item of edge.evidence) group.evidence.set(JSON.stringify([item.path, item.start, item.end, item.description]), item);
  }
  return [...grouped.values()].map(({ edge, originals, evidence }) => ({ ...edge, provenance: { edges: [...originals.values()] }, evidence: [...evidence.values()] }));
}

export function architectureScopeGraph(model: SemanticGraph, scopeId?: string, environment = '', includeAuxiliary = false): SemanticGraph {
  const byId = new Map(model.nodes.map(node => [node.id, node]));
  const allowed = model.nodes.filter(node => {
    const arch = node.architecture; if (!arch) return true;
    if (!includeAuxiliary && arch.auxiliary) return false;
    return !environment || !arch.environments.length || arch.kind === 'application' || arch.environments.includes(environment) || arch.environments.every(e => e.startsWith('except:')) && !arch.environments.includes(`except:${environment}`);
  });
  const ids = new Set(allowed.map(n => n.id)), owners = new Map<string, string>();
  const direct = new Set(allowed.filter(n => n.architecture?.parentId === scopeId).map(n => n.id));
  for (const node of allowed) {
    let owner = node, parent = owner.architecture?.parentId;
    while (parent && parent !== scopeId && byId.has(parent)) { owner = byId.get(parent)!; parent = owner.architecture?.parentId; }
    if (ids.has(owner.id)) owners.set(node.id, owner.id);
  }
  const relations = model.edges.filter(e => ids.has(e.source) && ids.has(e.target) && (!environment || !e.details?.environment || e.details.environment === environment));
  const projected = aggregateArchitectureEdges(relations, owners).filter(e => !scopeId || direct.has(e.source) || direct.has(e.target));
  const shown = new Set([...direct, ...projected.flatMap(e => [e.source, e.target])]);
  if (!scopeId) allowed.filter(n => !n.architecture?.parentId).forEach(n => shown.add(n.id));
  return { view: 'architecture-map', nodes: allowed.filter(n => shown.has(n.id)).map(n => scopeId && !direct.has(n.id) ? { ...n, attributes: { ...n.attributes, architectureContext: true } } : n), edges: projected };
}
