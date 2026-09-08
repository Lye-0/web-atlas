import type { SemanticAnalysis, SemanticEdge, SemanticGraph, SemanticNode, SemanticViewId } from './types';
import type { TraceImport } from './traces';

function runtimeGraph(analysis: SemanticAnalysis): { nodes: SemanticNode[]; edges: SemanticEdge[] } {
  const byId = new Map(analysis.nodes.map(node => [node.id, node]));
  const edges = analysis.edges.filter(edge => edge.views.includes('runtime-flow') && byId.get(edge.target)?.kind !== 'external');
  const kept = new Set(analysis.nodes.filter(node => ['entry', 'request', 'resource'].includes(node.kind) || node.attributes.entry).map(node => node.id));
  for (const edge of edges) if (!['calls', 'callback'].includes(edge.kind)) { kept.add(edge.source); kept.add(edge.target); }
  const outgoing = new Map<string, SemanticEdge[]>();
  edges.forEach(edge => outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge]));
  const incoming = new Map<string, SemanticEdge[]>();
  edges.forEach(edge => incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge]));
  const reachable = (links: Map<string, SemanticEdge[]>, reverse: boolean) => {
    const found = new Set(kept), queue = [...kept];
    for (let index = 0; index < queue.length; index++) for (const edge of links.get(queue[index]!) ?? []) {
      const next = reverse ? edge.source : edge.target;
      if (!found.has(next)) { found.add(next); queue.push(next); }
    }
    return found;
  };
  const forward = reachable(outgoing, false), backward = reachable(incoming, true);
  const relevant = new Set([...forward].filter(id => backward.has(id)));
  const junctions = new Map<string, string>();
  // Keep branching/merging boundaries. Only unambiguous serial helpers may disappear.
  // This retains every branch's evidence without enumerating exponentially many complete paths.
  for (const id of relevant) if (!kept.has(id)) {
    const inCount = (incoming.get(id) ?? []).filter(edge => relevant.has(edge.source)).length;
    const outCount = (outgoing.get(id) ?? []).filter(edge => relevant.has(edge.target)).length;
    if (inCount > 1 || outCount > 1) { kept.add(id); junctions.set(id, inCount > 1 && outCount > 1 ? '分岐・合流' : inCount > 1 ? '合流' : '分岐'); }
  }
  const projected: SemanticEdge[] = [];
  for (const id of kept) {
    const queue = (outgoing.get(id) ?? []).map(edge => ({ edge, path: [edge] })); const seen = new Set<string>();
    for (let i = 0; i < queue.length; i++) {
      const { edge, path } = queue[i]!;
      if (kept.has(edge.target)) {
        projected.push(path.length === 1 ? edge : { ...edge, id: `runtime:${id}:${edge.target}:${path.map(item => item.id).join('|')}`, source: id,
          label: `${path.length}段階の静的関係${path.some(item => item.kind === 'callback') ? '（callbackを含む）' : ''}`, kind: 'processing-path', evidence: path.flatMap(item => item.evidence),
          provenance: { edges: path.flatMap(item => item.provenance?.edges ?? [item]), intermediateNodeIds: path.slice(0, -1).map(item => item.target) },
          confidence: path.some(item => item.confidence === 'unresolved') ? 'unresolved' : path.some(item => item.confidence !== 'source') ? 'inferred' : 'source' });
      } else if (!seen.has(edge.target)) {
        seen.add(edge.target); for (const next of outgoing.get(edge.target) ?? []) queue.push({ edge: next, path: [...path, next] });
      }
    }
  }
  return { nodes: analysis.nodes.filter(node => kept.has(node.id)).map(node => junctions.has(node.id) ? { ...node, attributes: { ...node.attributes, runtimeJunction: junctions.get(node.id)! } } : node), edges: projected };
}

function architectureGraph(nodes: SemanticNode[], edges: SemanticEdge[]): { nodes: SemanticNode[]; edges: SemanticEdge[] } {
  const groups = new Map<string, SemanticNode>(); const owners = new Map<string, string>();
  for (const node of nodes) {
    if (node.kind === 'external' || node.kind === 'value' || node.kind === 'log') continue;
    const packageName = node.path?.match(/^(?:apps|packages|services)\/([^/]+)/)?.[1];
    const group = `${packageName ? `${packageName} / ` : ''}${node.group}`;
    const id = `subsystem:${group}`; owners.set(node.id, id);
    const existing = groups.get(id);
    if (existing) {
      existing.attributes.members = [...existing.attributes.members as string[], node.id];
      existing.attributes.files = [...new Set([...existing.attributes.files as string[], ...(node.path ? [node.path] : [])])];
      if (existing.evidence.length < 12) existing.evidence.push(...node.evidence.slice(0, 1));
    } else groups.set(id, { id, kind: 'subsystem', label: group, group: packageName ?? 'System', confidence: node.confidence === 'observed' ? 'observed' : 'inferred', evidence: node.evidence.slice(0, 1), attributes: { members: [node.id], files: node.path ? [node.path] : [], auxiliary: node.group === 'Tests' || Boolean(node.attributes.generated), basis: '配置ディレクトリとソース上の役割から分類' } });
  }
  const groupedEdges = new Map<string, SemanticEdge>();
  const counts = new Map<string, number>();
  for (const edge of edges) {
    const source = owners.get(edge.source), target = owners.get(edge.target);
    if (!source || !target || source === target || edge.kind === 'observed-at') continue;
    const id = `architecture:${source}:${target}:${edge.confidence === 'observed' ? 'observed' : 'static'}`;
    const existing = groupedEdges.get(id);
    counts.set(id, (counts.get(id) ?? 0) + 1);
    if (existing) { if (existing.evidence.length < 30) existing.evidence.push(...edge.evidence.slice(0, 1)); existing.label = `${counts.get(id)} connections`; }
    else groupedEdges.set(id, { ...edge, evidence: [...edge.evidence], id, source, target, kind: 'responsibility-dependency', label: '1 connection', views: ['architecture-map'] });
  }
  return { nodes: [...groups.values()], edges: [...groupedEdges.values()] };
}

export function projectSemanticView(analysis: SemanticAnalysis, view: SemanticViewId, traces?: TraceImport, layer: 'source' | 'observed' | 'combined' = 'source'): SemanticGraph {
  let nodes: SemanticNode[]; let edges: SemanticEdge[];
  if (view === 'runtime-flow') ({ nodes, edges } = runtimeGraph(analysis));
  else {
    edges = analysis.edges.filter(edge => edge.views.includes(view) || view === 'architecture-map' && ['calls', 'callback', 'uses-resource', 'http', 'handles', 'runtime-entry', 'registers-event', 'executes'].includes(edge.kind));
    const used = new Set(edges.flatMap(edge => [edge.source, edge.target]));
    nodes = analysis.nodes.filter(node => used.has(node.id)
      || view === 'function-call-flow' && node.kind === 'function' && !node.attributes.initializer
      || view === 'data-model' && node.kind === 'model' && !node.attributes.dataModelExcluded
      || view === 'data-flow' && (node.data || node.kind === 'value' && !node.attributes.dataFlowExcluded)
      || view === 'architecture-map' && ['function', 'entry', 'model', 'resource'].includes(node.kind));
  }
  if (layer === 'observed') { nodes = []; edges = []; }
  if (layer !== 'source' && traces && view !== 'data-model') {
    const traceEdges = traces.edges.filter(edge => edge.views.includes(view) && (layer === 'combined' || edge.kind !== 'observed-at'));
    const traceIds = new Set(traceEdges.flatMap(edge => [edge.source, edge.target]));
    nodes = [...nodes, ...traces.nodes.filter(node => view !== 'data-flow' ? node.kind !== 'value' : traceIds.has(node.id))]; edges = [...edges, ...traceEdges];
  }
  if (view === 'architecture-map') ({ nodes, edges } = architectureGraph(nodes, edges));
  if ((view === 'runtime-flow' || view === 'function-call-flow') && analysis.flowFieldsByNode) {
    const legacyFields = analysis.flowFieldsByNode;
    nodes = nodes.map(node => Object.hasOwn(legacyFields, node.id) ? { ...node, fields: legacyFields[node.id] } : node);
  }
  const ids = new Set(nodes.map(node => node.id));
  return { view, nodes, edges: edges.filter(edge => ids.has(edge.source) && ids.has(edge.target)) };
}

export function semanticNeighbours(graph: SemanticGraph, id: string, depth: number, direction: 'both' | 'incoming' | 'outgoing' = 'both'): Set<string> {
  const neighbours = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    if (direction !== 'incoming') { const next = neighbours.get(edge.source) ?? new Set(); next.add(edge.target); neighbours.set(edge.source, next); }
    if (direction !== 'outgoing') { const next = neighbours.get(edge.target) ?? new Set(); next.add(edge.source); neighbours.set(edge.target, next); }
  }
  const selected = new Set([id]); let frontier = [id];
  for (let hop = 0; hop < depth; hop++) {
    const next: string[] = [];
    for (const current of frontier) for (const target of neighbours.get(current) ?? []) if (!selected.has(target)) { selected.add(target); next.push(target); }
    frontier = next;
  }
  return selected;
}
