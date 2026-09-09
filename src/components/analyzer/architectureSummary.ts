import { uniqueArchitectureEvidence } from '../../analyzer/semantic/architectureEvidence';
import { architectureRelationLabel, architectureRelationOriginals } from '../../analyzer/semantic/architectureRelations';
import { confidenceLabels, type SemanticEdge, type SemanticNode } from '../../analyzer/semantic/types';

/** Display summaries only. Identity always comes from the recorded owner/endpoint ID. */
export function architectureRequestSources(requests: readonly (SemanticNode | undefined)[], nodes: ReadonlyMap<string, SemanticNode>) {
  const owners = new Map<string, SemanticNode>();
  let unknown = false;
  for (const request of requests) {
    const ids = request?.architecture?.request ? [request.architecture.request.ownerId]
      : typeof request?.attributes.architectureRequestOwner === 'string' ? [request.attributes.architectureRequestOwner] : [];
    if (!ids.length) unknown = true;
    for (const id of ids) { const owner = nodes.get(id); if (owner) owners.set(id, owner); else unknown = true; }
  }
  const sources = [...owners.values()].sort((a, b) => a.id.localeCompare(b.id));
  const label = sources.length > 1 ? '複数の要求元' : sources.length === 1 ? `${sources[0]!.label}${unknown ? '・ほか要求元未確認' : ''}` : '要求元未確認';
  return { sources, unknown: unknown || !requests.length, label: `要求元：${label}` };
}

export function architectureRelationSummary(edges: readonly SemanticEdge[]) {
  const originals = architectureRelationOriginals(edges), evidence = uniqueArchitectureEvidence(originals.flatMap(edge => edge.evidence));
  const states = [...new Set(originals.map(edge => edge.confidence))].sort();
  return { records: originals.length, evidence: evidence.length,
    sites: new Set(evidence.map(item => JSON.stringify([item.path, item.start, item.end]))).size,
    status: states.length > 1 ? `${states.map(state => confidenceLabels[state]).join('・')}が混在` : confidenceLabels[states[0]!] ?? '確認状態未指定',
  };
}

export type ArchitectureDirection = 'incoming' | 'outgoing' | 'self';
export function architecturePartners(edges: readonly SemanticEdge[], nodeId: string) {
  const partners = new Map<string, { otherId: string; relations: Map<string, { direction: ArchitectureDirection; edges: SemanticEdge[] }> }>();
  for (const edge of edges) {
    if (edge.source !== nodeId && edge.target !== nodeId) continue;
    const direction: ArchitectureDirection = edge.source === edge.target ? 'self' : edge.source === nodeId ? 'outgoing' : 'incoming';
    const otherId = direction === 'incoming' ? edge.source : edge.target;
    const partner = partners.get(otherId) ?? { otherId, relations: new Map<string, { direction: ArchitectureDirection; edges: SemanticEdge[] }>() };
    const key = JSON.stringify([direction, edge.kind, edge.details?.environment ?? '']);
    const relation = partner.relations.get(key) ?? { direction, edges: [] };
    if (!relation.edges.some(item => item.id === edge.id)) relation.edges.push(edge);
    partner.relations.set(key, relation); partners.set(otherId, partner);
  }
  return [...partners.values()].sort((a, b) => a.otherId.localeCompare(b.otherId)).map(partner => {
    const relations = [...partner.relations].sort(([a], [b]) => a.localeCompare(b)).map(([, value]) => ({ ...value, edges: [...value.edges].sort((a, b) => a.id.localeCompare(b.id)) }));
    const kinds = [...new Set(relations.map(relation => architectureRelationLabel(relation.edges[0]!)))].sort();
    const directions = new Set(relations.map(relation => relation.direction));
    return { otherId: partner.otherId, relations,
      description: `${kinds.slice(0, 2).join('・')}${kinds.length > 2 ? 'など' : ''}`,
      direction: directions.has('self') ? 'この粒度の自己関係' : directions.size > 1 ? '相手から・相手への関係あり' : directions.has('incoming') ? '相手からの関係' : '相手への関係',
    };
  });
}
