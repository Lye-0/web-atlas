import { useState } from 'react';
import type { SemanticNode } from '../../analyzer/semantic/types';

export function ArchitectureRequestInspection({ group, nodes, onSelect, onClose, expanded, onExpanded }: {
  group: { id: string; memberIds: string[]; label: string }; nodes: ReadonlyMap<string, SemanticNode>;
  onSelect: (id: string) => void; onClose: () => void; expanded: boolean; onExpanded: (expanded: boolean) => void;
}) {
  const [limit, setLimit] = useState(20);
  return <aside className="architecture-request-inspection" aria-label="未特定要求の内訳">
    <div><strong>内訳表示中 · {group.label}</strong><button onClick={onClose} aria-label="内訳を閉じる">×</button></div>
    <p>{group.memberIds.length}対象を表示上でまとめています。同じ接続先と確認したものではありません。</p>
    <button onClick={() => onExpanded(!expanded)}>{expanded ? '要求をまとめて表示' : '要求を個別に表示'}</button>
    <ul>{group.memberIds.slice(0, limit).map(id => { const node = nodes.get(id); return node && <li key={id}><button onClick={() => onSelect(id)}><strong>{node.architecture?.request?.expression ?? node.label}</strong><small>{node.evidence[0]?.path}:{node.evidence[0]?.line} · 個別の要求を選択</small></button></li>; })}</ul>
    {limit < group.memberIds.length && <button onClick={() => setLimit(limit + 30)}>残り {group.memberIds.length - limit}対象 · さらに表示</button>}
  </aside>;
}
