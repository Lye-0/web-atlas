import { useState } from 'react';
import { uniqueSemanticEvidence } from '../../analyzer/semantic/presentation';
import { confidenceLabels, kindLabels, semanticViewIds, type SemanticEdge, type SemanticEvidence, type SemanticNode, type SemanticViewId } from '../../analyzer/semantic/types';
import { analyzerViewLabels } from '../../analyzer/types';

function EvidenceItem({ evidence, source, initiallyOpen }: { evidence: SemanticEvidence; source?: string; initiallyOpen: boolean }) {
  const [open, setOpen] = useState(initiallyOpen), [full, setFull] = useState(false);
  const lines = source?.split('\n') ?? [], start = Math.max(1, evidence.line - 2), end = Math.min(lines.length, Math.max(evidence.line, evidence.endLine) + 2);
  const visibleEnd = full ? end : Math.min(end, start + 23);
  return <details open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{evidence.path}:{evidence.line}{evidence.endLine > evidence.line ? `–${evidence.endLine}` : ''}<span>{evidence.description}</span></summary>
    {open && <>{source !== undefined ? <pre>{lines.slice(start - 1, visibleEnd).map((line, index) => <span key={index} className={index + start >= evidence.line && index + start <= evidence.endLine ? 'is-highlighted' : ''}>{String(index + start).padStart(4)}  {line}{'\n'}</span>)}</pre> : <p>このプロジェクトにソースがありません。</p>}
      {visibleEnd < end && <button type="button" onClick={() => setFull(true)}>根拠の全範囲を表示（{end - visibleEnd}行）</button>}</>}
  </details>;
}

export function SemanticFlowEvidence({ items, sources }: { items: SemanticEvidence[]; sources: Record<string, string> }) {
  const unique = uniqueSemanticEvidence(items), [limit, setLimit] = useState(6);
  return <div className="semantic-evidence">{unique.slice(0, limit).map(item => <EvidenceItem key={`${item.path}:${item.start}:${item.end}:${item.description}`} evidence={item} source={sources[item.path]} initiallyOpen={unique.length === 1} />)}
    {unique.length > limit && <button type="button" onClick={() => setLimit(limit + 20)}>根拠をさらに表示（残り{unique.length - limit}件）</button>}</div>;
}

export function SemanticFlowDetail({ node, edge, nodes, edges, sources, view, onSelect, onSelectEdge, onClose, onJump }: {
  node?: SemanticNode; edge?: SemanticEdge; nodes: ReadonlyMap<string, SemanticNode>; edges: SemanticEdge[]; sources: Record<string, string>;
  view: 'runtime-flow' | 'function-call-flow'; onSelect: (id: string) => void; onSelectEdge: (id: string) => void; onClose: () => void; onJump: (id: string, targetView: SemanticViewId) => void;
}) {
  const [limit, setLimit] = useState(40);
  if (!node && !edge) return null;
  const relations = node ? edges.filter(item => item.source === node.id || item.target === node.id) : [];
  const evidence = edge?.evidence ?? node?.evidence ?? [];
  return <aside className="semantic-detail semantic-flow-detail" aria-label="選択した要素の詳細">
    <header><span>{node ? kindLabels[node.kind] : '関係の根拠'}</span><button type="button" aria-label="詳細を閉じる" onClick={onClose}>×</button></header>
    <h3>{node?.label ?? edge?.label}</h3><span className="semantic-confidence">{confidenceLabels[(node ?? edge)!.confidence]}</span>
    {node?.path && <p className="semantic-path">{node.path}{node.line ? `:${node.line}${node.endLine && node.endLine > node.line ? `–${node.endLine}` : ''}` : ''}</p>}
    {node?.signature && <pre className="semantic-signature">{node.signature}</pre>}
    {node?.fields && <table className="semantic-fields"><caption>Fields ({node.fields.length})</caption><thead><tr><th>Field</th><th>Type</th></tr></thead><tbody>{node.fields.map(field => <tr key={field.name}>
      <td>{field.name}{field.optional ? '?' : ''}{field.key && <small>{field.key === 'primary' ? 'PK' : 'FK'}</small>}</td><td>{field.type}</td>
    </tr>)}</tbody></table>}
    {Array.isArray(node?.attributes.unresolvedSpreads) && <p>未展開のフィールド: {node.attributes.unresolvedSpreads.join(', ')}。共有定義のソースを確認してください。</p>}
    {node && <>
      <p>{node.group}</p><div className="semantic-crosslinks" role="group" aria-label="関連するView">{semanticViewIds.filter(id => id !== view).map(id => <button key={id} type="button" onClick={() => onJump(node.id, id)}>{analyzerViewLabels[id]} ↗</button>)}</div>
      <details><summary>属性</summary><dl>{Object.entries(node.attributes).filter(([key]) => !['owner', 'members', 'files', 'initializer'].includes(key)).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{Array.isArray(value) ? value.join(', ') : String(value)}</dd></div>)}</dl></details>
      <h4>関係（{relations.length.toLocaleString()}件）</h4>
      <div className="semantic-connections">{relations.slice(0, limit).map(item => <div key={item.id} data-direction={item.source === node.id && item.target === node.id ? 'internal' : item.target === node.id ? 'incoming' : 'outgoing'}>
        <small>{item.source === node.id && item.target === node.id ? '自己参照' : item.target === node.id ? view === 'function-call-flow' ? '入る関係・呼び出し元' : '入る関係・関係元' : view === 'function-call-flow' ? '出る関係・呼び出し先' : '出る関係・関係先'}</small>
        <p><button type="button" onClick={() => onSelect(item.source)}>{nodes.get(item.source)?.label ?? item.source}</button> → <button type="button" onClick={() => onSelect(item.target)}>{nodes.get(item.target)?.label ?? item.target}</button></p>
        <button type="button" onClick={() => onSelectEdge(item.id)}>{item.label} · {confidenceLabels[item.confidence]}</button>
      </div>)}{relations.length > limit && <button type="button" onClick={() => setLimit(limit + 50)}>関係をさらに表示（残り{relations.length - limit}件）</button>}</div>
    </>}
    {edge && <>
      <p className="semantic-relation-endpoints"><button type="button" onClick={() => onSelect(edge.source)}>{nodes.get(edge.source)?.label ?? edge.source}</button><span> → {edge.label} → </span><button type="button" onClick={() => onSelect(edge.target)}>{nodes.get(edge.target)?.label ?? edge.target}</button></p>
      <p>関係の種類: <code>{edge.kind}</code></p>
      {edge.provenance && <details open><summary>元の関係（{edge.provenance.edges.length}件）</summary><ol className="semantic-original-relations">{edge.provenance.edges.map((item, index) => <li key={`${item.id}:${index}`}>
        <button type="button" onClick={() => onSelect(item.source)}>{nodes.get(item.source)?.label ?? item.source}</button> → <button type="button" onClick={() => onSelect(item.target)}>{nodes.get(item.target)?.label ?? item.target}</button>
        <p>{item.label} · <code>{item.kind}</code> · {confidenceLabels[item.confidence]}</p>
        <SemanticFlowEvidence items={item.evidence} sources={sources} />
      </li>)}</ol></details>}
    </>}
    <h4>ソースの根拠（{uniqueSemanticEvidence(evidence).length}件）</h4>
    {evidence.length ? <SemanticFlowEvidence key={node?.id ?? edge?.id} items={evidence} sources={sources} /> : <p>{(node ?? edge)?.confidence === 'observed' ? '読み込んだ実行記録の属性を確認してください。ソース対応は記録の範囲に限ります。' : 'この対象に直接対応するソース範囲はありません。関連する関係の根拠を確認してください。'}</p>}
  </aside>;
}
