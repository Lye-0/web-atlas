import type { SemanticEdge, SemanticRelationSource } from './types';

const labels: Record<string, string> = {
  'simple-artifact-path':'ビルド成果物の受け渡し',
  'flow-input': '入力として使う', 'flow-starts': '起動する指定', 'flow-deploys': '公開する指定',
  'flow-generates': '生成する指定', 'flow-applies': 'DB変更を適用する指定', 'flow-serves': 'アプリのコードを配信',
  'flow-configures': '実行構成のコード', 'flow-invokes': 'scriptの呼出記述', 'flow-artifact': '同じ成果物パス',
  'flow-precedes': '条件付きの後続操作',
  'flow-definition': '論理定義と構成の対応',
  'declaration-dependency': '依存として宣言', 'code-reference': 'コードから参照', calls: '処理を呼び出す',
  callback: 'コールバックとして渡す', handles: '担当する処理', 'registers-event': 'イベント処理を登録',
  'http-request': 'HTTPリクエストを送る', message: 'メッセージを送る', 'data-operation': 'リソースへの操作を要求',
  'process-start': 'プログラムの起動を要求', 'deployment-config': '接続・配置の設定', 'service-use': 'サービス向けの使用・設定',
  contains: '内部の構成として含む',
  'build-output': '入力から成果物へのビルド宣言',
  'selects-workload': 'Serviceのselectorで対象を指定',
  'routes-to-service': 'IngressからServiceへ転送する設定',
  'declares-server': 'serverの構成を宣言',
  'declares-location': 'server内のlocationを宣言',
  'proxy-pass': 'proxyの転送先を指定',
  'upstream-server': 'upstreamの接続先を指定',
  'publishes-artifact': '公開するartifactを指定',
  'cdn-domain': 'CDNの配信ドメインを指定',
  'delivery-origin': '配信元のoriginを指定',
};
const relationLabels = new WeakMap<SemanticRelationSource, string>();
export function architectureRelationLabel(edge: SemanticRelationSource):string {
  if(edge.kind==='simple-artifact-path')return labels[edge.kind]!;
  const cached=relationLabels.get(edge);if(cached)return cached;
  if ((edge as SemanticEdge).provenance?.edges.length) {
    const kinds=[...new Set(architectureRelationOriginals([edge]).map(original=>original.kind))];
    if(kinds.length>1){relationLabels.set(edge,'複数種別の関係');return '複数種別の関係';}
    if(kinds.length===1&&!labels[edge.kind]){const label=labels[kinds[0]!]??'関係種別未判定';relationLabels.set(edge,label);return label;}
  }
  const label=edge.kind === 'flow-precedes' || edge.kind === 'flow-invokes'?edge.label:labels[edge.kind] ?? '関係種別未判定';
  relationLabels.set(edge,label);return label;
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
