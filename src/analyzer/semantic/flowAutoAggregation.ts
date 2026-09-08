import { buildAggregationGroups, projectAggregationRelations, shortAggregationLabels, type AggregationGroupIdentity, type AggregationPoint, type AutoAggregationResult, type DisplayAggregationRelation } from '../autoAggregation';
import type { SemanticPosition } from './presentation';
import type { SemanticExplorerModel } from './semanticExplorer';
import { confidenceLabels, kindLabels, type SemanticGraph, type SemanticNode, type SemanticEdge } from './types';

export function semanticAggregationInput(graph: SemanticGraph, positions: readonly SemanticPosition[], explorer?: SemanticExplorerModel) {
  const identities = new Map<string, AggregationGroupIdentity>();
  const identity = (value: AggregationGroupIdentity) => { const previous = identities.get(value.id); if (previous) return previous; identities.set(value.id, value); return value; };
  const points: AggregationPoint[] = positions.map(point => {
    const node = point.node, owner = explorer?.owners.get(node.id), scope = owner ? explorer?.scopes.get(owner.scopeId) : undefined;
    const unresolved = node.kind === 'external' && node.confidence === 'unresolved';
    const membership = unresolved ? node.path ?? node.evidence[0]?.path ?? '呼び出し箇所の所属未判定' : scope?.id ?? node.path ?? node.group;
    const label = unresolved ? `呼び出し箇所 ${membership}` : scope?.kind === 'function' ? `${scope.label} · ${scope.path}` : scope?.path ?? scope?.label ?? node.group;
    const role = node.data?.role;
    const domain = node.model?.domain;
    const domainLabel = domain === 'code' ? 'コード上の型' : domain === 'validation' ? '検証スキーマ' : domain === 'storage' ? '保存用の定義' : undefined;
    const roleLabel = role ? ({ declaration: '宣言した値', assignment: '代入', parameter: '仮引数', 'call-result': '処理結果', return: '戻り口・return', termination: '終了', operation: '操作', literal: '細かな定数', use: '使用箇所', argument: '実引数', 'property-read': '項目取得', 'property-write': '項目設定', unknown: '未解決の値' })[role] : undefined;
    const minimumMembers = role && ['declaration', 'parameter', 'call-result', 'return', 'termination'].includes(role) ? 24 : 8;
    const sourcePath = (owner?.filePath ?? node.path ?? node.evidence[0]?.path)?.replaceAll('\\', '/');
    const directory = sourcePath?.split('/').slice(0, -1).join('/');
    const family = unresolved ? 'unresolved-calls' : domain ?? 'entities';
    const contextId = owner?.contextId ?? '', contextLabel = owner?.contextId ? explorer?.scopes.get(owner.contextId)?.label : undefined;
    const collectionLabel = unresolved ? '定義先未特定の呼び出し集合' : domainLabel ? `${domainLabel}の集合` : graph.view === 'data-flow' ? '値・操作の集合（複数の役割）' : '対象の集合（種類別の内訳あり）';
    const parentGroups: AggregationGroupIdentity[] = [];
    if (graph.view === 'data-flow' && scope?.kind === 'function') parentGroups.push(identity({
      id: JSON.stringify([graph.view, 'owner-collection', scope.id, family, node.confidence]), label: `${scope.label} · ${scope.path} · ${collectionLabel} · ${confidenceLabels[node.confidence]}`,
      level: 1, minimumMembers: 4, maximumProjectedSpan: 220,
    }));
    if (sourcePath) parentGroups.push(identity({ id: JSON.stringify([graph.view, 'file-collection', contextId, sourcePath, family, node.confidence]),
      label: `${contextLabel ? `${contextLabel} · ` : ''}${unresolved ? '呼び出し箇所 ' : ''}${sourcePath} · ${collectionLabel} · ${confidenceLabels[node.confidence]}`, level: 2, minimumMembers: 12, maximumProjectedSpan: 320 }));
    if (directory !== undefined) parentGroups.push(identity({ id: JSON.stringify([graph.view, 'directory-collection', contextId, directory, family, node.confidence]),
      label: `${contextLabel ? `${contextLabel} · ` : ''}${unresolved ? '呼び出し箇所 ' : ''}${directory || 'プロジェクト直下'} · 所属別の${collectionLabel} · ${confidenceLabels[node.confidence]}`, level: 3, minimumMembers: 24, maximumProjectedSpan: 380 }));
    return { id: node.id, x: point.x, y: point.y, z: point.z,
      category: `${roleLabel ?? kindLabels[node.kind]}${domainLabel ? ` · ${domainLabel}` : ''} · ${confidenceLabels[node.confidence]}`, parentGroups,
      group: identity({ id: JSON.stringify([graph.view, membership, node.kind, domain ?? '', role ?? '', node.confidence]),
        label: `${label} · ${unresolved ? '定義先未特定' : roleLabel ?? domainLabel ?? kindLabels[node.kind]} · ${confidenceLabels[node.confidence]}`, minimumMembers }) };
  });
  return { points, groups: buildAggregationGroups(points) };
}

/** The source graph remains separately available for search, paths, detail and Evidence. */
export function projectAggregatedSemanticFlow(graph: SemanticGraph, allPositions: readonly SemanticPosition[], result: Pick<AutoAggregationResult, 'individualIds' | 'ownerById' | 'aggregates'>,
  relationCache?: { sourceGraph: SemanticGraph; owners: AutoAggregationResult['ownerById']; relations: DisplayAggregationRelation<SemanticEdge>[]; edges: SemanticEdge[] }) {
  const counts = new Map<number, string>();
  const formatCount = (count: number) => { let text = counts.get(count); if (text === undefined) { text = count.toLocaleString(); counts.set(count, text); } return text; };
  const positions: SemanticPosition[] = allPositions.filter(point => result.individualIds.has(point.node.id));
  const byId = new Map(graph.nodes.map(node => [node.id, node]));
  const shortLabels = shortAggregationLabels(result.aggregates);
  for (const group of result.aggregates) {
    const members = group.memberIds.map(id => byId.get(id)!);
    const confidence = members.every(node => node.confidence === 'source') ? 'source' : members.every(node => node.confidence === 'observed') ? 'observed' : members.some(node => node.confidence === 'unresolved') ? 'unresolved' : 'inferred';
    const node: SemanticNode = { id: group.id, kind: 'subsystem', label: `${formatCount(group.memberIds.length)}対象 · ${group.label}`, group: '表示上のまとまり', confidence, evidence: [],
      attributes: { displayAggregate: true, shortLabel: shortLabels.get(group.id)!, fullLabel: group.label, targetCount: group.memberIds.length, matchingCount: group.matchingCount, aggregationMode: group.mode, groupId: group.groupId } };
    positions.push({ node, x: group.x, y: group.y, z: group.z });
  }
  const reuse = relationCache?.sourceGraph === graph && relationCache.owners === result.ownerById ? relationCache : undefined;
  const relations = reuse?.relations ?? projectAggregationRelations(graph.edges, result.ownerById);
  const edges: SemanticEdge[] = reuse?.edges ?? relations.map(relation => {
    const first = relation.originals[0]!;
    if (!relation.aggregated) return first;
    const evidence: SemanticEdge['evidence'] = [];
    for (const edge of relation.originals) for (const item of edge.evidence) evidence.push(item);
    return { id: relation.id, source: relation.source, target: relation.target, kind: first.kind, confidence: first.confidence, views: first.views,
      label: `${formatCount(relation.originals.length)}関係 · ${first.label}`, details: first.details,
      evidence, provenance: { edges: relation.originals } };
  });
  return { positions, graph: { ...graph, nodes: positions.map(point => point.node), edges }, relations };
}

/** Keep a few recent representations during split/merge gestures. The cache is
 * scoped to the immutable canonical graph, never shared across projects. */
export function createSemanticFlowProjector(graph: SemanticGraph, positions: readonly SemanticPosition[]) {
  const recent: { owners: AutoAggregationResult['ownerById']; aggregates: AutoAggregationResult['aggregates']; value: ReturnType<typeof projectAggregatedSemanticFlow> }[] = [];
  return (result: Pick<AutoAggregationResult, 'individualIds' | 'ownerById' | 'aggregates'>) => {
    const cached = recent.find(item => item.owners === result.ownerById && item.aggregates === result.aggregates);
    if (cached) return cached.value;
    const sameOwners = recent.find(item => item.owners === result.ownerById);
    const value = projectAggregatedSemanticFlow(graph, positions, result, sameOwners ? { sourceGraph: graph, owners: sameOwners.owners, relations: sameOwners.value.relations, edges: sameOwners.value.graph.edges } : undefined);
    if (recent.length >= 4) recent.shift();
    recent.push({ owners: result.ownerById, aggregates: result.aggregates, value });
    return value;
  };
}
