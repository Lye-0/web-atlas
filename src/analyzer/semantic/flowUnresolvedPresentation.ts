import { layoutSemanticCloud, layoutSemanticCloudGroup } from './flowCloud';
import type { SemanticPosition } from './presentation';
import type { SemanticExplorerModel } from './semanticExplorer';
import type { SemanticGraph, SemanticNode } from './types';

export interface UnresolvedFlowPresentation {
  /** The source graph is never rewritten: relation endpoints and Evidence stay canonical. */
  graph: SemanticGraph;
  members: SemanticNode[];
  memberIds: ReadonlySet<string>;
  aggregate?: SemanticPosition;
  regular: SemanticPosition[];
  individual: SemanticPosition[];
  relationCount: number;
  callSiteCount: number;
}

export function buildUnresolvedFlowPresentation(graph: SemanticGraph, explorer?: SemanticExplorerModel): UnresolvedFlowPresentation {
  const members = graph.nodes.filter(node => node.kind === 'external' && node.confidence === 'unresolved').sort((a, b) => a.id.localeCompare(b.id));
  const memberIds = new Set(members.map(node => node.id));
  const regular = layoutSemanticCloud({ ...graph, nodes: graph.nodes.filter(node => !memberIds.has(node.id)) }, explorer);
  const relations = graph.edges.filter(edge => memberIds.has(edge.source) || memberIds.has(edge.target));
  const callSites = new Set(relations.filter(edge => edge.kind === 'calls').flatMap(edge => edge.evidence.map(item => JSON.stringify([item.path, item.start, item.end]))));
  if (!members.length) return { graph, members, memberIds, regular, individual: [], relationCount: 0, callSiteCount: 0 };
  const ids = new Set(graph.nodes.map(node => node.id));
  let aggregateId = 'flow-display:unresolved-calls';
  while (ids.has(aggregateId)) aggregateId += ':display';
  const x = regular.reduce((maximum, point) => Math.max(maximum, point.x), 0) + 140;
  const aggregate: SemanticPosition = { x, y: 0, z: 0, node: {
    id: aggregateId, kind: 'subsystem', label: '定義先が未特定の呼び出し', group: '表示上の集約', confidence: 'unresolved', evidence: [],
    attributes: { displayAggregate: true, targetCount: members.length },
  } };
  const local = layoutSemanticCloudGroup(members, aggregateId);
  const radius = local.reduce((maximum, point) => Math.max(maximum, Math.abs(point.x)), 0);
  // All member locations are fixed before selection. Expanding or following a
  // call never rearranges the normal project map or changes the camera.
  const individual = local.map(point => ({ ...point, x: point.x + x + radius + 52 }));
  return { graph, members, memberIds, aggregate, regular, individual, relationCount: relations.length, callSiteCount: callSites.size };
}

export function visibleUnresolvedFlowPositions(model: UnresolvedFlowPresentation, selectedIds: ReadonlySet<string>, selectedEdgeId?: string, expanded = false): SemanticPosition[] {
  if (!model.aggregate) return model.regular;
  const reveal = new Set(selectedIds);
  for (const edge of model.graph.edges) if (edge.id === selectedEdgeId || selectedIds.has(edge.source) || selectedIds.has(edge.target)) {
    reveal.add(edge.source); reveal.add(edge.target);
  }
  return [...model.regular, model.aggregate, ...model.individual.filter(point => expanded || reveal.has(point.node.id))];
}
