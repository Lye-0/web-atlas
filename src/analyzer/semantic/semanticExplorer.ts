import type { SemanticEdge, SemanticGraph, SemanticNode } from './types';
import type { SemanticPosition } from './presentation';
import { analyzerEdgeDirection } from '../edgeDirection';

export interface ExplorerLocation { scopeId: string; centerId?: string; depth: number; direction: 'both' | 'incoming' | 'outgoing' }
export interface ExplorerScope {
  id: string; kind: 'project' | 'context' | 'directory' | 'file' | 'function' | 'group'; label: string; parentId?: string; path?: string;
  contextId?: string; childIds: string[]; nodeIds: string[]; memberIds: string[]; grounded?: boolean;
}
export interface ExplorerOwner {
  scopeId: string; filePath?: string; directoryPath?: string; contextId?: string; definitionAvailable: boolean;
  runtimeCandidateIds: string[];
}
export interface SemanticExplorerModel {
  view: SemanticGraph['view']; scopes: ReadonlyMap<string, ExplorerScope>; owners: ReadonlyMap<string, ExplorerOwner>; nodes: ReadonlyMap<string, SemanticNode>;
  runtimeMode: 'grounded' | 'mixed' | 'fallback';
}
export interface ExplorerChild {
  id: string; kind: ExplorerScope['kind'] | 'node'; label: string; subtitle: string; count: number; memberIds: string[]; node?: SemanticNode;
}

export const explorerProjectLocation: ExplorerLocation = { scopeId: 'project', depth: 1, direction: 'both' };
export const normalizeExplorerPath = (path: string) => path.replaceAll('\\', '/').replace(/^(?:\.\/)+/, '');
const scopeKey = (kind: string, context: string, path: string) => `${kind}:${JSON.stringify([context, path])}`;

/** Ownership is recorded source membership or an explicit runtime boundary, never call reachability. */
export function buildSemanticExplorer(graph: SemanticGraph, knownFiles: ReadonlySet<string>): SemanticExplorerModel {
  if (graph.view === 'architecture-map') return buildArchitectureExplorer(graph);
  const files = new Set([...knownFiles].map(normalizeExplorerPath)), nodes = new Map(graph.nodes.map(node => [node.id, node]));
  const scopes = new Map<string, ExplorerScope>(), owners = new Map<string, ExplorerOwner>();
  const addScope = (scope: Omit<ExplorerScope, 'childIds' | 'nodeIds' | 'memberIds'>) => {
    const existing = scopes.get(scope.id); if (existing) return existing;
    const created: ExplorerScope = { ...scope, childIds: [], nodeIds: [], memberIds: [] }; scopes.set(scope.id, created);
    if (scope.parentId) scopes.get(scope.parentId)!.childIds.push(scope.id);
    return created;
  };
  addScope({ id: 'project', kind: 'project', label: 'プロジェクト' });
  const runtimes = graph.nodes.filter(node => node.attributes.resourceType === 'runtime');
  const entries = new Map<string, Set<string>>();
  for (const edge of graph.edges) if (edge.kind === 'runtime-entry' && runtimes.some(runtime => runtime.id === edge.source)) {
    const candidates = entries.get(edge.target) ?? new Set<string>(); candidates.add(edge.source); entries.set(edge.target, candidates);
  }
  let groundedCount = 0, unknownCount = 0;
  for (const node of graph.nodes) {
    const path = node.path ? normalizeExplorerPath(node.path) : undefined;
    const localPath = node.kind !== 'external' && path && files.has(path) ? path : undefined;
    let parentId = 'project', contextId: string | undefined;
    const candidates = new Set<string>();
    if (graph.view === 'runtime-flow') {
      if (node.kind !== 'external') for (const runtime of runtimes) {
        const entry = typeof runtime.attributes.entryPath === 'string' ? normalizeExplorerPath(runtime.attributes.entryPath) : undefined;
        if (runtime.id === node.id || entry && localPath === entry || entries.get(node.id)?.has(runtime.id)) candidates.add(runtime.id);
      }
      const service = node.confidence === 'observed' && typeof node.attributes['service.name'] === 'string' ? node.attributes['service.name'] : undefined;
      const runtime = candidates.size === 1 ? nodes.get([...candidates][0]!) : undefined;
      if (runtime || service) {
        contextId = runtime ? `context:runtime:${runtime.id}` : `context:service:${service}`;
        addScope({ id: contextId, kind: 'context', label: runtime?.label ?? `実測サービス: ${service}`, parentId: 'project', contextId, grounded: true });
        groundedCount++;
      } else {
        contextId = 'context:unclassified';
        addScope({ id: contextId, kind: 'context', label: '実行環境未判定・所属別表示', parentId: 'project', contextId, grounded: false });
        unknownCount++;
      }
      parentId = contextId;
    }
    let directoryPath: string | undefined;
    if (localPath) {
      const parts = localPath.split('/'); parts.pop(); directoryPath = parts.join('/');
      for (let depth = 1; depth <= parts.length; depth++) {
        const directory = parts.slice(0, depth).join('/'), id = scopeKey('directory', contextId ?? '', directory);
        addScope({ id, kind: 'directory', label: parts[depth - 1] || '/', path: directory, parentId, contextId }); parentId = id;
      }
      const id = scopeKey('file', contextId ?? '', localPath);
      addScope({ id, kind: 'file', label: localPath.split('/').at(-1)!, path: localPath, parentId, contextId }); parentId = id;
      if (graph.view === 'data-flow' && typeof node.attributes.owner === 'string' && node.data) {
        const functionId = scopeKey('function', localPath, node.attributes.owner);
        addScope({ id: functionId, kind: 'function', label: String(node.attributes.ownerName ?? '所属する処理'), path: localPath, parentId, contextId }); parentId = functionId;
      }
    } else {
      const external = node.kind === 'external';
      const group = external ? 'unresolved-calls' : `membership:${node.group}`;
      const id = scopeKey('group', contextId ?? '', group);
      addScope({ id, kind: 'group', label: external ? '定義先が未特定の呼び出し' : node.group || '所属情報なし', parentId, contextId }); parentId = id;
    }
    scopes.get(parentId)!.nodeIds.push(node.id);
    owners.set(node.id, { scopeId: parentId, filePath: localPath, directoryPath, contextId, definitionAvailable: Boolean(localPath && node.kind !== 'span' && node.kind !== 'log'), runtimeCandidateIds: [...candidates] });
    let scope: ExplorerScope | undefined = scopes.get(parentId);
    while (scope) { scope.memberIds.push(node.id); scope = scope.parentId ? scopes.get(scope.parentId) : undefined; }
  }
  const rank = { project: 0, context: 1, directory: 2, file: 3, function: 4, group: 5 };
  for (const scope of scopes.values()) {
    scope.childIds.sort((a, b) => rank[scopes.get(a)!.kind] - rank[scopes.get(b)!.kind] || scopes.get(a)!.label.localeCompare(scopes.get(b)!.label) || a.localeCompare(b));
    scope.nodeIds.sort((a, b) => nodes.get(a)!.label.localeCompare(nodes.get(b)!.label) || (nodes.get(a)!.line ?? 0) - (nodes.get(b)!.line ?? 0) || a.localeCompare(b));
  }
  return { view: graph.view, scopes, owners, nodes, runtimeMode: groundedCount ? unknownCount ? 'mixed' : 'grounded' : 'fallback' };
}

export function explorerRegionIdentity(model: SemanticExplorerModel, nodeId: string): { id: string; label: string; kind: 'directory' | 'group' } {
  const owner = model.owners.get(nodeId), scope = owner ? model.scopes.get(owner.scopeId) : undefined;
  const context = owner?.contextId ? model.scopes.get(owner.contextId) : undefined;
  if (context?.grounded) return { id: context.id, label: context.label, kind: 'group' };
  if (owner?.directoryPath !== undefined) return { id: scopeKey('directory', owner.contextId ?? '', owner.directoryPath), label: owner.directoryPath || 'プロジェクト直下', kind: 'directory' };
  return { id: scope?.id ?? 'group:unknown', label: scope?.label ?? '所属情報なし', kind: 'group' };
}

function buildArchitectureExplorer(graph: SemanticGraph): SemanticExplorerModel {
  const nodes = new Map(graph.nodes.map(n => [n.id, n])), owners = new Map<string, ExplorerOwner>();
  const scopes = new Map<string, ExplorerScope>([['project', { id: 'project', kind: 'project', label: 'プロジェクト', childIds: [], nodeIds: [], memberIds: [] }]]);
  for (const node of graph.nodes) scopes.set(node.id, { id: node.id, kind: 'group', label: node.label, parentId: node.architecture?.parentId ?? 'project', childIds: [], nodeIds: [], memberIds: [], grounded: true });
  for (const node of graph.nodes) {
    const parent = node.architecture?.parentId ?? 'project';
    scopes.get(parent)?.childIds.push(node.id);
    owners.set(node.id, { scopeId: parent, contextId: node.architecture?.parentId, definitionAvailable: false, runtimeCandidateIds: [] });
    let scope = scopes.get(node.id); const visited = new Set<string>();
    while (scope && !visited.has(scope.id)) { visited.add(scope.id); scope.memberIds.push(node.id); scope = scope.parentId ? scopes.get(scope.parentId) : undefined; }
  }
  return { view: graph.view, scopes, nodes, owners, runtimeMode: 'grounded' };
}

export function explorerLocationForNode(model: SemanticExplorerModel, id: string): ExplorerLocation {
  return { scopeId: model.owners.get(id)?.scopeId ?? 'project', centerId: model.view !== 'architecture-map' && model.nodes.has(id) ? id : undefined, depth: 1, direction: 'both' };
}

export function resolveExplorerLocation(model: SemanticExplorerModel, location: ExplorerLocation): ExplorerLocation {
  if (location.centerId && model.nodes.has(location.centerId)) return { ...location, scopeId: model.owners.get(location.centerId)?.scopeId ?? 'project' };
  return { ...location, scopeId: model.scopes.has(location.scopeId) ? location.scopeId : 'project', centerId: undefined };
}

export function explorerBreadcrumbs(model: SemanticExplorerModel, location: ExplorerLocation): ExplorerScope[] {
  const result: ExplorerScope[] = []; let scope = model.scopes.get(location.scopeId);
  while (scope) { result.unshift(scope); scope = scope.parentId ? model.scopes.get(scope.parentId) : undefined; }
  return result;
}

export function explorerParentLocation(model: SemanticExplorerModel, location: ExplorerLocation): ExplorerLocation {
  return { ...explorerProjectLocation, scopeId: location.centerId ? location.scopeId : model.scopes.get(location.scopeId)?.parentId ?? 'project' };
}

export function explorerChildren(model: SemanticExplorerModel, location: ExplorerLocation, visibleIds?: ReadonlySet<string>): ExplorerChild[] {
  if (location.centerId) return [];
  const scope = model.scopes.get(location.scopeId); if (!scope) return [];
  return [...scope.childIds.flatMap(id => {
    const child = model.scopes.get(id)!, memberIds = child.memberIds.filter(id => !visibleIds || visibleIds.has(id));
    return memberIds.length ? [{ id, kind: child.kind, label: child.label, subtitle: child.path ?? (child.kind === 'context' && child.grounded ? '設定・実行記録で確認' : ''), count: memberIds.length, memberIds }] : [];
  }), ...scope.nodeIds.filter(id => !visibleIds || visibleIds.has(id)).map(id => {
    const node = model.nodes.get(id)!;
    return { id, kind: 'node' as const, label: node.label, subtitle: `${node.path ?? node.group}${node.line ? `:${node.line}` : ''}`, count: 1, memberIds: [id], node };
  })];
}

/** Only traversal relations through the requested number of hops enter the local diagram. */
function explorerAdjacency(graph: SemanticGraph) {
  const incoming = new Map<string, SemanticEdge[]>(), outgoing = new Map<string, SemanticEdge[]>();
  for (const edge of graph.edges) {
    const before = incoming.get(edge.target) ?? []; before.push(edge); incoming.set(edge.target, before);
    const after = outgoing.get(edge.source) ?? []; after.push(edge); outgoing.set(edge.source, after);
  }
  return { incoming, outgoing };
}

export function explorerRelations(graph: SemanticGraph, centerId: string, depth = 1, direction: ExplorerLocation['direction'] = 'both'): SemanticGraph {
  if (!graph.nodes.some(node => node.id === centerId)) return { ...graph, nodes: [], edges: [] };
  const links = explorerAdjacency(graph);
  const visited = new Set([centerId]), includedEdges = new Set<string>(); let frontier = [centerId];
  for (let hop = 0; hop < Math.max(1, depth); hop++) {
    const next = new Set<string>();
    for (const id of frontier) {
      const edges = direction === 'incoming' ? links.incoming.get(id) ?? [] : direction === 'outgoing' ? links.outgoing.get(id) ?? [] : [...(links.incoming.get(id) ?? []), ...(links.outgoing.get(id) ?? [])];
      for (const edge of edges) {
        const target = edge.source === id ? edge.target : edge.source;
        includedEdges.add(edge.id);
        if (!visited.has(target)) { visited.add(target); next.add(target); }
      }
    }
    frontier = [...next];
  }
  return { ...graph, nodes: graph.nodes.filter(node => visited.has(node.id)), edges: graph.edges.filter(edge => includedEdges.has(edge.id)) };
}

/** Direction controls the selected object's lines; the local node set remains centered on its visit. */
export function explorerEdgeVisible(edge: SemanticEdge, selectedIds: ReadonlySet<string>, direction: ExplorerLocation['direction'], selectedEdgeId?: string) {
  if (direction === 'both' || !selectedIds.size || edge.id === selectedEdgeId || edge.provenance?.edges.some(item => item.id === selectedEdgeId)) return true;
  const relation = analyzerEdgeDirection(edge.provenance?.edges[0]?.source ?? edge.source, edge.provenance?.edges.at(-1)?.target ?? edge.target, selectedIds) ?? analyzerEdgeDirection(edge.source, edge.target, selectedIds);
  return !relation || relation === 'internal' || relation === direction;
}

/** Caller and callee columns are derived from the local relation center, independently of selection. */
export function layoutExplorerRelations(graph: SemanticGraph, centerId: string): SemanticPosition[] {
  const links = explorerAdjacency(graph);
  const distance = (incoming: boolean) => {
    const result = new Map([[centerId, 0]]), pending = [centerId];
    const adjacency = incoming ? links.incoming : links.outgoing;
    for (let index = 0; index < pending.length; index++) for (const edge of adjacency.get(pending[index]!) ?? []) {
      const target = incoming ? edge.source : edge.target;
      if (!result.has(target)) { result.set(target, result.get(pending[index]!)! + 1); pending.push(target); }
    }
    return result;
  };
  const incoming = distance(true), outgoing = distance(false), columns = new Map<number, SemanticNode[]>();
  for (const node of graph.nodes) {
    const column = node.id === centerId ? 0 : incoming.has(node.id) && (!outgoing.has(node.id) || incoming.get(node.id)! <= outgoing.get(node.id)!) ? -incoming.get(node.id)! : outgoing.get(node.id) ?? 1;
    const members = columns.get(column) ?? []; members.push(node); columns.set(column, members);
  }
  return [...columns].flatMap(([column, nodes]) => [...nodes].sort((a, b) => a.label.localeCompare(b.label) || (a.path ?? '').localeCompare(b.path ?? '') || (a.line ?? 0) - (b.line ?? 0) || a.id.localeCompare(b.id))
    .map((node, index) => ({ node, x: column * 320, y: (index - (nodes.length - 1) / 2) * 88, z: 0 })));
}
