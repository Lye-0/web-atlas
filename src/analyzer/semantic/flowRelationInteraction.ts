import type { SemanticGraph, SemanticViewId } from './types';

export type SemanticFlowHoverTarget = { kind: 'node' | 'edge'; id: string };
export type SemanticFlowHoverInput = { source: string; modality: 'pointer' | 'focus' };
export type SemanticFlowHoverHandler = (target?: SemanticFlowHoverTarget, input?: SemanticFlowHoverInput) => void;
export type SemanticFlowNodeRole = 'selected' | 'incoming' | 'outgoing' | 'both' | 'source' | 'target' | 'source-target';

/** Roles are relative to the selected canonical nodes, or explicitly to an edge's endpoints. */
export function semanticFlowNodeRoles(graph: SemanticGraph, selectedIds: ReadonlySet<string>, selectedEdgeId?: string): Map<string, SemanticFlowNodeRole> {
  const roles = new Map<string, SemanticFlowNodeRole>();
  const selectedEdge = graph.edges.find(edge => edge.id === selectedEdgeId || edge.provenance?.edges.some(original => original.id === selectedEdgeId));
  if (selectedEdge) {
    roles.set(selectedEdge.source, selectedEdge.source === selectedEdge.target ? 'source-target' : 'source');
    if (selectedEdge.source !== selectedEdge.target) roles.set(selectedEdge.target, 'target');
    return roles;
  }
  const merge = (id: string, role: 'incoming' | 'outgoing') => {
    if (selectedIds.has(id)) return;
    const previous = roles.get(id);
    roles.set(id, previous && previous !== role ? 'both' : role);
  };
  for (const edge of graph.edges) {
    const source = edge.provenance?.edges[0]?.source ?? edge.source;
    const target = edge.provenance?.edges.at(-1)?.target ?? edge.target;
    if (selectedIds.has(source) || selectedIds.has(edge.source)) merge(edge.target, 'outgoing');
    if (selectedIds.has(target) || selectedIds.has(edge.target)) merge(edge.source, 'incoming');
  }
  for (const node of graph.nodes) if (selectedIds.has(node.id)) roles.set(node.id, 'selected');
  return roles;
}

export function semanticFlowNodeRelationKinds(graph: SemanticGraph, selectedIds: ReadonlySet<string>, selectedEdgeId?: string): Map<string, Set<string>> {
  const kinds = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    const source = edge.provenance?.edges[0]?.source ?? edge.source, target = edge.provenance?.edges.at(-1)?.target ?? edge.target;
    if (selectedEdgeId ? edge.id !== selectedEdgeId && !edge.provenance?.edges.some(item => item.id === selectedEdgeId) : !selectedIds.has(source) && !selectedIds.has(target) && !selectedIds.has(edge.source) && !selectedIds.has(edge.target)) continue;
    for (const id of [edge.source, edge.target]) {
      const values = kinds.get(id) ?? new Set<string>(); values.add(edge.kind); kinds.set(id, values);
    }
  }
  return kinds;
}

export function semanticFlowRoleLabel(role: SemanticFlowNodeRole, view: SemanticViewId, kinds?: ReadonlySet<string>): string {
  if (role === 'selected') return '選択中';
  if (role === 'source') return '始点（Source）';
  if (role === 'target') return '終点（Target）';
  if (role === 'source-target') return '始点・終点（自己関係）';
  if (view === 'data-flow') return role === 'incoming' ? '由来・入力' : role === 'outgoing' ? '結果・利用先' : '由来・利用先の両方';
  if (view === 'data-model') return role === 'incoming' ? '参照する元・派生する型' : role === 'outgoing' ? '参照先・派生元' : '参照する元・先の両方';
  if (view === 'function-call-flow' && kinds?.size === 1 && kinds.has('calls')) return role === 'incoming' ? '呼び出し元' : role === 'outgoing' ? '呼び出し先' : '呼び出し元・先';
  if (view === 'function-call-flow' && kinds?.size === 1 && kinds.has('callback')) return role === 'incoming' ? 'コールバック元' : role === 'outgoing' ? 'コールバック先' : 'コールバック元・先';
  return role === 'incoming' ? '入る関係' : role === 'outgoing' ? '出る関係' : '入る・出る関係';
}

/** Return only existing displayed relations: node targets select the pair, edge targets the exact ID. */
export function resolveSemanticFlowHover(graph: SemanticGraph, selectedIds: ReadonlySet<string>, selectedEdgeId: string | undefined, hoverTarget?: SemanticFlowHoverTarget): { edgeIds: Set<string>; nodeIds: Set<string> } {
  const edgeIds = new Set<string>(), nodeIds = new Set<string>();
  if (!hoverTarget) return { edgeIds, nodeIds };
  const visible = new Set(graph.nodes.map(node => node.id));
  if (hoverTarget.kind === 'node' && !visible.has(hoverTarget.id)) return { edgeIds, nodeIds };
  for (const edge of graph.edges) {
    if (!visible.has(edge.source) || !visible.has(edge.target)) continue;
    const source = edge.provenance?.edges[0]?.source ?? edge.source;
    const target = edge.provenance?.edges.at(-1)?.target ?? edge.target;
    const selectedEdge = edge.id === selectedEdgeId || Boolean(edge.provenance?.edges.some(original => original.id === selectedEdgeId));
    const matches = hoverTarget.kind === 'edge'
      ? edge.id === hoverTarget.id || Boolean(edge.provenance?.edges.some(original => original.id === hoverTarget.id))
      : selectedEdgeId ? selectedEdge && (edge.source === hoverTarget.id || edge.target === hoverTarget.id)
        : edge.source === hoverTarget.id && (selectedIds.has(target) || selectedIds.has(edge.target)) || edge.target === hoverTarget.id && (selectedIds.has(source) || selectedIds.has(edge.source));
    if (matches) { edgeIds.add(edge.id); nodeIds.add(edge.source); nodeIds.add(edge.target); }
  }
  return { edgeIds, nodeIds };
}
