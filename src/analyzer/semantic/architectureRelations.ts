import type { SemanticEdge, SemanticRelationSource } from './types';

const labels: Record<string, string> = {
  'declaration-dependency': '依存として宣言', 'code-reference': 'コードから参照', calls: '処理を呼び出す',
  callback: 'コールバックとして渡す', handles: '担当する処理', 'registers-event': 'イベント処理を登録',
  'http-request': 'HTTPリクエストを送る', message: 'メッセージを送る', 'data-operation': 'リソースへの操作を要求',
  'process-start': 'プログラムの起動を要求', 'deployment-config': '接続・配置の設定', 'service-use': 'サービス向けの使用・設定',
};
export function architectureRelationLabel(edge: SemanticRelationSource) {
  return labels[edge.kind] ?? '関係種別未判定';
}

export function architectureRelationClass(edge: SemanticEdge, source: string, target: string): 'connection' | 'internal' | 'self' {
  if (source !== target) return 'connection';
  const originals = edge.provenance?.edges ?? [edge];
  // Recursion of a lower-level function is internal information at app/component
  // grain. Equal display endpoints alone never establish a real self-relation.
  return edge.details?.architectureOrigin === 'source' || originals.some(original => original.source !== source || original.target !== target)
    ? 'internal' : 'self';
}

export function architectureRelationOriginals(edges: readonly SemanticRelationSource[]): SemanticRelationSource[] {
  const originals = new Map<string, SemanticRelationSource>(), visited = new Set<SemanticRelationSource>();
  const visit = (edge: SemanticRelationSource) => {
    if (visited.has(edge)) return;
    visited.add(edge);
    const nested = (edge as SemanticEdge).provenance?.edges;
    if (nested?.length) for (const original of nested) visit(original);
    else originals.set(edge.id, edge);
  };
  for (const edge of edges) visit(edge);
  return [...originals.values()];
}

export function architectureRelationCounts(edges: readonly SemanticEdge[]) {
  const originals = architectureRelationOriginals(edges), sites = new Set<string>();
  for (const original of originals) for (const item of original.evidence) sites.add(JSON.stringify([item.path, item.start, item.end]));
  return { records: originals.length, sites: sites.size };
}
