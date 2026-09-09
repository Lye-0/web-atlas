import type { SemanticEdge, SemanticEvidence, SemanticGraph, SemanticNode, SemanticRelationSource } from './types';
import { layoutSemanticCloud } from './flowCloud';
import { architectureRelationClass, architectureRelationCounts } from './architectureRelations';
import { uniqueArchitectureEvidence } from './architectureEvidence';

const id = (...parts: string[]) => `architecture:${JSON.stringify(parts)}`;
type Point = { x: number; y: number; z: number };
export interface ArchitectureProjection {
  scopeId?: string; detailIds: string[]; contextIds: string[]; peripheralIds: string[];
  internalRelations: SemanticEdge[]; boundaryRelations: SemanticEdge[];
  positions: ReadonlyMap<string, Point>;
  requestGroups: { id: string; memberIds: string[]; label: string }[];
  representedNodeIds: string[]; detailCount: number; contextCount: number;
  detailEntityCount: number; contextEntityCount: number; requestCount: number; internalRecordCount: number; explicitNodeIds: string[];
}
export interface ArchitectureProjectionOptions {
  mode?: '2d' | '3d'; surroundings?: boolean; selectedNodeId?: string; selectedEdgeId?: string;
  allowedIds?: ReadonlySet<string>; expandedRequestGroupIds?: readonly string[];
}

/** Structural adjacency only. Keep every original relation and its evidence. */
export function aggregateArchitectureEdges(edges: readonly SemanticEdge[], owners: ReadonlyMap<string, string>): SemanticEdge[] {
  const grouped = new Map<string, { edge: SemanticEdge; originals: Map<string, SemanticRelationSource>; evidence: Map<string, SemanticEvidence> }>();
  for (const edge of edges) {
    const source = owners.get(edge.source), target = owners.get(edge.target); if (!source || !target) continue;
    const relationClass = architectureRelationClass(edge, source, target);
    const key = id('summary-edge', source, target, edge.kind, edge.confidence, edge.details?.environment ?? '', relationClass);
    let group = grouped.get(key);
    if (!group) {
      group = { edge: { ...edge, id: key, source, target, details: { ...edge.details, architectureRelation: relationClass } }, originals: new Map(), evidence: new Map() };
      grouped.set(key, group);
    }
    for (const original of edge.provenance?.edges ?? [edge]) group.originals.set(original.id, original);
    for (const item of edge.evidence) group.evidence.set(JSON.stringify([item.path, item.start, item.end, item.description]), item);
  }
  return [...grouped.values()].map(({ edge, originals, evidence }) => ({ ...edge, provenance: { edges: [...originals.values()] }, evidence: [...evidence.values()] }));
}

interface ArchitectureIndex {
  byId: ReadonlyMap<string, SemanticNode>; ancestors: ReadonlyMap<string, string[]>;
  positions: ReadonlyMap<string, Point>; scopes: Map<string, PreparedArchitectureScope>;
}
const indices = new WeakMap<SemanticGraph, ArchitectureIndex>();
function architectureIndex(model: SemanticGraph): ArchitectureIndex {
  const cached = indices.get(model); if (cached) return cached;
  const byId = new Map(model.nodes.map(node => [node.id, node])), ancestors = new Map<string, string[]>();
  for (const node of model.nodes) {
    const chain = [node.id]; let parent = node.architecture?.parentId;
    while (parent && byId.has(parent) && !chain.includes(parent)) { chain.push(parent); parent = byId.get(parent)?.architecture?.parentId; }
    ancestors.set(node.id, chain);
  }
  // Reserve local footprints once using Architecture objects, never source Facts.
  // Visibility and selection cannot move another root or its descendants.
  const layoutNodes = model.nodes.filter(node => node.architecture?.parentId || !model.nodes.some(child => child.architecture?.parentId === node.id))
    .map(node => ({ ...node, path: node.architecture?.request ? `architecture-layout:${requestGroupId(node)}` : `architecture-layout:${node.id}`,
      architecture: { ...node.architecture!, parentId: node.architecture?.request?.ownerId ?? ancestors.get(node.id)!.at(-1)! } }));
  const layout = layoutSemanticCloud({ view: 'architecture-map', nodes: layoutNodes, edges: [] });
  const positions = new Map<string, Point>(layout.map(point => [point.node.id, { x: point.x * 2.5, y: point.y * 2.5, z: point.z * 1.5 }]));
  for (const node of [...model.nodes].sort((a, b) => ancestors.get(b.id)!.length - ancestors.get(a.id)!.length)) {
    if (positions.has(node.id)) continue;
    const children = model.nodes.filter(child => child.architecture?.parentId === node.id).map(child => positions.get(child.id)).filter((point): point is Point => Boolean(point));
    positions.set(node.id, children.length ? { x: children.reduce((n, p) => n + p.x, 0) / children.length, y: children.reduce((n, p) => n + p.y, 0) / children.length, z: children.reduce((n, p) => n + p.z, 0) / children.length } : { x: 0, y: 0, z: 0 });
  }
  const anchors = new Map(positions);
  for (const node of model.nodes) {
    const point = anchors.get(node.id)!;
    const owner = node.architecture?.request?.ownerId ?? ancestors.get(node.id)!.at(-1)!;
    const anchor = anchors.get(owner) ?? point;
    // Keep local detail spacing, with a compact and invariant frame of roots.
    positions.set(node.id, { x: point.x - anchor.x * .6, y: point.y - anchor.y * .6, z: point.z - anchor.z * .6 });
  }
  const result = { byId, ancestors, positions, scopes: new Map() }; indices.set(model, result); return result;
}

export interface PreparedArchitectureScope {
  model: SemanticGraph; scopeId?: string; allowed: SemanticNode[]; direct: ReadonlySet<string>;
  ancestors: ReadonlySet<string>; projected: SemanticEdge[]; positions: ReadonlyMap<string, Point>;
  owners: ReadonlyMap<string, string>;
}
export function prepareArchitectureScope(model: SemanticGraph, scopeId?: string, environment = '', includeAuxiliary = false, allowedIds?: ReadonlySet<string>): PreparedArchitectureScope {
  const index = architectureIndex(model);
  const key = JSON.stringify([scopeId, environment, includeAuxiliary, allowedIds ? [...allowedIds].sort() : null]);
  const cached = index.scopes.get(key); if (cached) return cached;
  const allowed = model.nodes.filter(node => {
    const arch = node.architecture;
    if (allowedIds && !allowedIds.has(node.id)) return false;
    if (!includeAuxiliary && index.ancestors.get(node.id)!.some(id => index.byId.get(id)?.architecture?.auxiliary)) return false;
    return !arch || !environment || !arch.environments.length || arch.kind === 'application' || arch.environments.includes(environment)
      || arch.environments.every(e => e.startsWith('except:')) && !arch.environments.includes(`except:${environment}`);
  });
  const ids = new Set(allowed.map(n => n.id)), owners = new Map<string, string>();
  const ancestors = new Set(scopeId ? index.ancestors.get(scopeId) ?? [] : []);
  const direct = new Set(allowed.filter(n => n.architecture?.parentId === scopeId).map(n => n.id));
  for (const node of allowed) {
    const chain = index.ancestors.get(node.id)!, scopeAt = scopeId ? chain.indexOf(scopeId) : -1;
    const owner = scopeAt > 0 ? chain[scopeAt - 1]! : ancestors.has(node.id) ? node.id : chain.at(-1)!;
    if (ids.has(owner)) owners.set(node.id, owner);
  }
  const relations = model.edges.filter(e => ids.has(e.source) && ids.has(e.target) && (!environment || !e.details?.environment || e.details.environment === environment));
  const result = { model, scopeId, allowed, direct, ancestors, projected: aggregateArchitectureEdges(relations, owners), positions: index.positions, owners };
  index.scopes.set(key, result); return result;
}

function requestGroupId(node: SemanticNode) {
  const arch = node.architecture!, request = arch.request!;
  return `architecture-display:${JSON.stringify(['requests', request.ownerId, request.kind, [...arch.environments].sort(), arch.auxiliary])}`;
}

export function projectArchitectureScope(base: PreparedArchitectureScope, options: ArchitectureProjectionOptions = {}): SemanticGraph {
  const { scopeId, direct, ancestors, projected, allowed } = base;
  const roots = new Set(allowed.filter(node => !node.architecture?.parentId && !ancestors.has(node.id)).map(node => node.id));
  const requestOwners = new Map(allowed.filter(node => node.architecture?.request).map(node => [node.id, requestGroupId(node)]));
  const isSelectedRelation = (edge: SemanticEdge) => {
    if (!options.selectedEdgeId) return false;
    if (edge.id === options.selectedEdgeId || edge.provenance?.edges.some(original => original.id === options.selectedEdgeId)) return true;
    return options.selectedEdgeId === id('summary-edge', requestOwners.get(edge.source) ?? edge.source, requestOwners.get(edge.target) ?? edge.target,
      edge.kind, edge.confidence, edge.details?.environment ?? '', edge.details?.architectureRelation ?? 'connection');
  };
  const selected = options.selectedNodeId ? base.owners.get(options.selectedNodeId) ?? options.selectedNodeId : undefined;
  const boundary = scopeId ? projected.filter(edge => edge.details?.architectureRelation !== 'internal'
    && (ancestors.has(edge.source) && (direct.has(edge.target) || roots.has(edge.target)) || ancestors.has(edge.target) && (direct.has(edge.source) || roots.has(edge.source)))) : [];
  const connections = projected.filter(edge => edge.details?.architectureRelation !== 'internal'
    && !ancestors.has(edge.source) && !ancestors.has(edge.target)
    && (!scopeId || direct.has(edge.source) || direct.has(edge.target) || edge.source === selected || edge.target === selected || isSelectedRelation(edge)));
  const shown = new Set([...direct, ...connections.flatMap(edge => [edge.source, edge.target])]);
  for (const edge of boundary) for (const endpoint of [edge.source, edge.target]) if (roots.has(endpoint)) shown.add(endpoint);
  if (options.mode === '3d' && options.surroundings !== false || !scopeId) for (const root of roots) shown.add(root);
  if (selected && !ancestors.has(selected) && allowed.some(node => node.id === selected)) shown.add(selected);
  const selectedRelation = projected.find(isSelectedRelation);
  if (selectedRelation) for (const endpoint of [selectedRelation.source, selectedRelation.target]) if (!ancestors.has(endpoint)) shown.add(endpoint);
  const internalRelations = projected.filter(edge => edge.details?.architectureRelation === 'internal' && (shown.has(edge.source) || ancestors.has(edge.source)));
  const internalByOwner = new Map<string, SemanticEdge[]>();
  for (const edge of internalRelations) { const edges = internalByOwner.get(edge.source) ?? []; edges.push(edge); internalByOwner.set(edge.source, edges); }
  // Reading priority belongs to the open scope, not the temporarily selected outer node.
  const connected = new Set([...connections.filter(edge => direct.has(edge.source) || direct.has(edge.target)), ...boundary].flatMap(edge => [edge.source, edge.target]));
  let nodes: SemanticNode[] = allowed.filter(node => shown.has(node.id)).map(node => ({ ...node, attributes: { ...node.attributes,
    architectureContext: Boolean(scopeId && !direct.has(node.id)), architecturePeripheral: Boolean(scopeId && !direct.has(node.id) && !connected.has(node.id)),
    architectureScopeRole: !scopeId ? '' : direct.has(node.id) ? 'inside' : connected.has(node.id) ? 'direct' : 'surrounding',
    architectureInternalCount: architectureRelationCounts(internalByOwner.get(node.id) ?? []).records,
  } }));
  const representedNodeIds = nodes.map(node => node.id);
  const groups = new Map<string, SemanticNode[]>();
  for (const node of nodes) if (node.architecture?.kind === 'unresolved' && node.architecture.request) {
    const key = requestGroupId(node), group = groups.get(key) ?? []; group.push(node); groups.set(key, group);
  }
  const requestGroups: ArchitectureProjection['requestGroups'] = [], groupOwners = new Map(nodes.map(node => [node.id, node.id]));
  const positions = new Map(base.positions);
  const protectedIds = new Set(options.selectedNodeId ? [options.selectedNodeId] : []);
  for (const edge of boundary) if (edge.id === options.selectedEdgeId) { protectedIds.add(edge.source); protectedIds.add(edge.target); }
  for (const edge of connections) if (edge.id === options.selectedEdgeId) { protectedIds.add(edge.source); protectedIds.add(edge.target); }
  for (const [groupId, members] of groups) {
    if (members.length < 2) continue;
    const label = `${({ http: 'HTTP接続先', process: 'プログラム起動先', auth: '認証サービス' })[members[0]!.architecture!.request!.kind]}・未特定`;
    requestGroups.push({ id: groupId, memberIds: members.map(node => node.id), label });
    if (options.expandedRequestGroupIds?.includes(groupId)) continue;
    const remaining = members.filter(node => !protectedIds.has(node.id));
    if (remaining.length < 2) continue;
    const first = remaining[0]!, ids = new Set(remaining.map(node => node.id));
    for (const member of remaining) groupOwners.set(member.id, groupId);
    const points = members.map(node => base.positions.get(node.id)!).filter(Boolean);
    positions.set(groupId, { x: points.reduce((n, p) => n + p.x, 0) / points.length, y: points.reduce((n, p) => n + p.y, 0) / points.length, z: points.reduce((n, p) => n + p.z, 0) / points.length });
    const group: SemanticNode = { ...first, id: groupId, label: `${label}：${remaining.length}対象`, evidence: uniqueArchitectureEvidence(remaining.flatMap(node => node.evidence)),
      architecture: { ...first.architecture!, request: undefined, memberIds: remaining.flatMap(node => node.architecture!.memberIds), files: [...new Set(remaining.flatMap(node => node.architecture!.files))] },
      attributes: { ...first.attributes, architectureRequestGroup: true, architectureRequestOwner: first.architecture!.request!.ownerId, requestIds: [...ids], requestCount: ids.size },
    };
    nodes = [...nodes.filter(node => !ids.has(node.id)), group];
  }
  const edges = [...groupOwners].some(([from, to]) => from !== to) ? aggregateArchitectureEdges(connections, groupOwners) : connections;
  const contextIds = nodes.filter(node => node.attributes.architectureContext).map(node => node.id);
  const represented = allowed.filter(node => shown.has(node.id));
  return { view: 'architecture-map', nodes, edges, architectureView: {
    scopeId, detailIds: nodes.filter(node => !node.attributes.architectureContext).map(node => node.id), contextIds,
    peripheralIds: nodes.filter(node => node.attributes.architecturePeripheral).map(node => node.id), internalRelations, boundaryRelations: boundary,
    positions, requestGroups, representedNodeIds, detailCount: representedNodeIds.filter(id => direct.has(id)).length,
    contextCount: representedNodeIds.filter(id => !direct.has(id)).length,
    detailEntityCount: represented.filter(node => direct.has(node.id) && node.architecture?.kind !== 'unresolved').length,
    contextEntityCount: represented.filter(node => !direct.has(node.id) && node.architecture?.kind !== 'unresolved').length,
    requestCount: represented.filter(node => node.architecture?.kind === 'unresolved').length,
    internalRecordCount: architectureRelationCounts(internalRelations.filter(edge => direct.has(edge.source))).records,
    explicitNodeIds: requestGroups.filter(group => options.expandedRequestGroupIds?.includes(group.id)).flatMap(group => group.memberIds),
  } };
}

export function architectureScopeGraph(model: SemanticGraph, scopeId?: string, environment = '', includeAuxiliary = false, options: ArchitectureProjectionOptions = {}): SemanticGraph {
  return projectArchitectureScope(prepareArchitectureScope(model, scopeId, environment, includeAuxiliary, options.allowedIds), options);
}
