import { useState } from 'react';
import type { SemanticGraph, SemanticNode } from '../../analyzer/semantic/types';
import { architectureRequestPartition, architectureRequestTitle } from './architectureRequestPresentation';
import { architectureRequestSources } from './architectureSummary';
import { architectureEnvironmentLabel } from '../../analyzer/semantic/architectureMetadata';

export function ArchitectureRequestInspection({ group, nodes, visible, onSelect, onClose, expanded, onExpanded }: {
  group: { id: string; memberIds: string[]; label: string }; nodes: ReadonlyMap<string, SemanticNode>;
  visible: SemanticGraph;
  onSelect: (id: string) => void; onClose: () => void; expanded: boolean; onExpanded: (expanded: boolean) => void;
}) {
  const [limit, setLimit] = useState(20);
  const origin = architectureRequestSources(group.memberIds.map(id => nodes.get(id)), nodes);
  const environments = [...new Set(group.memberIds.flatMap(id => nodes.get(id)?.architecture?.environments ?? []))];
  const partition = architectureRequestPartition(group.memberIds, visible);
  const scopeRole = visible.nodes.find(node => node.id === group.id)?.attributes.architectureScopeRole;
  return <aside className="analyzer-detail-panel is-module-detail semantic-detail semantic-flow-detail architecture-detail architecture-request-detail" aria-label="構成の詳細">
    <div className="analyzer-detail-heading"><h3>{group.label}</h3><button onClick={onClose} aria-label="詳細を閉じる">×</button></div>
    <p><strong>選択中 · 表示上の集合</strong></p>
    <p>現在地との関係：{scopeRole === 'inside' ? '内部' : scopeRole === 'direct' ? '外側の接続相手' : scopeRole === 'surrounding' ? '周辺' : visible.architectureView?.scopeId ? '個別要求の表示位置を参照' : 'プロジェクト全体'}</p>
    <p className="architecture-request-origin">{origin.label}</p>
    <p>設定対象：{architectureEnvironmentLabel(environments)}</p>
    {origin.sources.length > 1 && <details><summary>要求元の内訳 · {origin.sources.length}構成</summary><ul>{origin.sources.map(source => <li key={source.id}>{source.label} · {source.architecture?.ownerPath || source.architecture?.files[0] || source.id}</li>)}</ul>{origin.unknown && <p>要求元を確認できない要求も含みます。</p>}</details>}
    <p>要求を表示上でまとめた集合です。同じ接続先と確認したものではなく、内部階層はありません。</p>
    <p role="status">元の要求 {partition.originalIds.length}件 · 集合内 {partition.groupedIds.length}件 · 個別表示 {partition.individualIds.length}件</p>
    {!partition.groupedIds.length && <p>すべての要求を個別に表示中のため、図の集合は非表示です。</p>}
    <p>{expanded ? '明示展開中。「まとめる」で集合に戻せます。' : '内訳から選んだ要求だけ一時表示します。選択解除・別の選択で戻ります。詳細を閉じても選択は維持します。'}件数には画面外の要求も含みます。</p>
    <button onClick={() => onExpanded(!expanded)}>{expanded ? 'まとめる' : '要求を個別に表示'}</button>
    <ul>{group.memberIds.slice(0, limit).map(id => { const node = nodes.get(id); return node && <li key={id}><strong>{architectureRequestTitle(node)}</strong><small>{architectureRequestSources([node], nodes).label}</small><small>{node.evidence[0] ? `${node.evidence[0].path}:${node.evidence[0].line} · 範囲 ${node.evidence[0].start}–${node.evidence[0].end}` : 'ソース箇所未確認'}</small><button onClick={() => onSelect(id)}>図で表示して選択</button></li>; })}</ul>
    {limit < group.memberIds.length && <button onClick={() => setLimit(limit + 30)}>残り {group.memberIds.length - limit}対象 · さらに表示</button>}
  </aside>;
}
