import { useState, type ReactNode } from 'react';
import { uniqueSemanticEvidence } from '../../analyzer/semantic/presentation';
import { confidenceLabels, kindLabels, semanticViewIds, type SemanticEdge, type SemanticEvidence, type SemanticNode, type SemanticViewId } from '../../analyzer/semantic/types';
import { analyzerViewLabels } from '../../analyzer/types';

interface Props {
  node?: SemanticNode; edge?: SemanticEdge; nodes: ReadonlyMap<string, SemanticNode>; edges: SemanticEdge[]; sources: Record<string, string>;
  view: 'runtime-flow' | 'function-call-flow'; onSelect: (id: string) => void; onSelectEdge: (id: string) => void; onClose: () => void; onJump: (id: string, targetView: SemanticViewId) => void;
}

function Section({ title, count, initiallyOpen = false, direction, children }: {
  title: string; count?: number; initiallyOpen?: boolean; direction?: 'imports' | 'imported-by' | 'internal'; children: ReactNode;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  return <details className="analyzer-detail-accordion" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary data-direction={direction}><span>{title}</span>{count !== undefined && <small>{count.toLocaleString()}</small>}</summary>
    {open && <div className="analyzer-detail-accordion-body">{children}</div>}
  </details>;
}

function ExpandableList<T>({ items, render }: { items: readonly T[]; render: (item: T, index: number) => ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  return <>
    <ul className="analyzer-module-detail-list">{(expanded ? items : items.slice(0, 6)).map(render)}</ul>
    {!expanded && items.length > 6 && <button type="button" className="analyzer-detail-show-more" onClick={() => setExpanded(true)}>残り{items.length - 6}件を表示</button>}
  </>;
}

function Info({ entries }: { entries: [string, unknown][] }) {
  return <dl className="analyzer-metadata-list">{entries.filter(([, value]) => value !== undefined && value !== '').map(([key, value]) =>
    <div key={key}><dt>{key}</dt><dd>{Array.isArray(value) ? value.join(', ') : String(value)}</dd></div>)}</dl>;
}

function nodePath(node?: SemanticNode) {
  return node?.path ? `${node.path}${node.line ? `:${node.line}${node.endLine && node.endLine > node.line ? `–${node.endLine}` : ''}` : ''}` : undefined;
}

function NodeLink({ id, nodes, onSelect }: { id: string; nodes: Props['nodes']; onSelect: Props['onSelect'] }) {
  const node = nodes.get(id);
  return <button type="button" className="analyzer-module-connection-name" onClick={() => onSelect(id)}>
    <strong>{node?.label ?? id}</strong>{nodePath(node) && <small>{nodePath(node)}</small>}
  </button>;
}

function RelationLink({ edge, onSelectEdge }: { edge: SemanticEdge; onSelectEdge: Props['onSelectEdge'] }) {
  return <div className="semantic-flow-relation-link">
    <button type="button" onClick={() => onSelectEdge(edge.id)}>{edge.label} · {confidenceLabels[edge.confidence]}</button>
    <code>{edge.kind}</code>
  </div>;
}

function RelationGroup({ edges, onSelectEdge }: { edges: SemanticEdge[]; onSelectEdge: Props['onSelectEdge'] }) {
  const [open, setOpen] = useState(false);
  if (edges.length === 1) return <RelationLink edge={edges[0]!} onSelectEdge={onSelectEdge} />;
  return <details className="semantic-flow-relation-group" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>関係 {edges.length.toLocaleString()}件</summary>
    {open && <ExpandableList items={edges} render={edge => <li key={edge.id}><RelationLink edge={edge} onSelectEdge={onSelectEdge} /></li>} />}
  </details>;
}

function Connections({ edges, incoming = false, nodes, onSelect, onSelectEdge }: {
  edges: SemanticEdge[]; incoming?: boolean; nodes: Props['nodes']; onSelect: Props['onSelect']; onSelectEdge: Props['onSelectEdge'];
}) {
  const grouped = new Map<string, SemanticEdge[]>();
  for (const edge of edges) {
    const id = incoming ? edge.source : edge.target;
    const relations = grouped.get(id) ?? []; relations.push(edge); grouped.set(id, relations);
  }
  if (!grouped.size) return <p className="analyzer-muted-copy">該当する関係はありません。</p>;
  return <ExpandableList items={[...grouped]} render={([id, relations]) => <li key={id} className="semantic-flow-connection-row">
    <NodeLink id={id} nodes={nodes} onSelect={onSelect} />
    <RelationGroup edges={relations} onSelectEdge={onSelectEdge} />
  </li>} />;
}

function EvidenceItem({ evidence, source, initiallyOpen }: { evidence: SemanticEvidence; source?: string; initiallyOpen: boolean }) {
  const [open, setOpen] = useState(initiallyOpen), [full, setFull] = useState(false);
  const lines = source?.split('\n') ?? [], start = Math.max(1, evidence.line - 2), end = Math.min(lines.length, Math.max(evidence.line, evidence.endLine) + 2);
  const visibleEnd = full ? end : Math.min(end, start + 23);
  return <details open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{evidence.path}:{evidence.line}{evidence.endLine > evidence.line ? `–${evidence.endLine}` : ''}<span>{evidence.description}</span></summary>
    {open && <>{source !== undefined ? <pre>{lines.slice(start - 1, visibleEnd).map((line, index) => <span key={index} className={index + start >= evidence.line && index + start <= evidence.endLine ? 'is-highlighted' : ''}>{String(index + start).padStart(4)}  {line}</span>)}</pre> : <p className="analyzer-muted-copy">このプロジェクトにソースがありません。</p>}
      {visibleEnd < end && <button type="button" className="analyzer-detail-show-more" onClick={() => setFull(true)}>根拠の全範囲を表示（{end - visibleEnd}行）</button>}</>}
  </details>;
}

export function SemanticFlowEvidence({ items, sources, autoOpenSingle = true }: { items: SemanticEvidence[]; sources: Record<string, string>; autoOpenSingle?: boolean }) {
  const unique = uniqueSemanticEvidence(items), [limit, setLimit] = useState(6);
  return <div className="semantic-evidence">{unique.slice(0, limit).map(item => <EvidenceItem key={`${item.path}:${item.start}:${item.end}:${item.description}`} evidence={item} source={sources[item.path]} initiallyOpen={autoOpenSingle && unique.length === 1} />)}
    {unique.length > limit && <button type="button" className="analyzer-detail-show-more" onClick={() => setLimit(limit + 20)}>根拠をさらに表示（残り{unique.length - limit}件）</button>}</div>;
}

export function SemanticFlowDetail({ node, edge, nodes, edges, sources, view, onSelect, onSelectEdge, onClose, onJump }: Props) {
  if (!node && !edge) return null;
  const outgoing = node ? edges.filter(item => item.source === node.id && item.target !== node.id) : [];
  const incoming = node ? edges.filter(item => item.target === node.id && item.source !== node.id) : [];
  const internal = node ? edges.filter(item => item.source === node.id && item.target === node.id) : [];
  const evidence = edge?.evidence ?? node?.evidence ?? [];
  const unresolvedSpreads = node?.attributes.unresolvedSpreads;
  return <aside className="analyzer-detail-panel is-module-detail semantic-detail semantic-flow-detail" aria-label="選択した要素の詳細">
    <header className="analyzer-module-detail-header">
      <div className="analyzer-detail-heading-top"><span className="analyzer-node-type">{node ? kindLabels[node.kind] : 'RELATION'}</span>
        <button type="button" className="analyzer-detail-close" aria-label="詳細を閉じる" onClick={onClose}>閉じる</button></div>
      <h3>{node?.label ?? edge?.label}</h3>
      {nodePath(node) && <p className="analyzer-module-detail-path">{nodePath(node)}</p>}
      <div className="analyzer-module-detail-meta"><span className="semantic-confidence">{confidenceLabels[(node ?? edge)!.confidence]}</span></div>
    </header>
    {node && <>
      <Section title={view === 'function-call-flow' ? '出る関係・呼び出し先' : '出る関係・関係先'} count={outgoing.length} direction="imports" initiallyOpen={outgoing.length > 0}>
        <Connections edges={outgoing} nodes={nodes} onSelect={onSelect} onSelectEdge={onSelectEdge} />
      </Section>
      <Section title={view === 'function-call-flow' ? '入る関係・呼び出し元' : '入る関係・関係元'} count={incoming.length} direction="imported-by" initiallyOpen={incoming.length > 0 && (outgoing.length === 0 || incoming.length <= 4)}>
        <Connections edges={incoming} incoming nodes={nodes} onSelect={onSelect} onSelectEdge={onSelectEdge} />
      </Section>
      {internal.length > 0 && <Section title="自己参照" count={internal.length} direction="internal" initiallyOpen>
        <Connections edges={internal} nodes={nodes} onSelect={onSelect} onSelectEdge={onSelectEdge} />
      </Section>}
      {(node.fields || Array.isArray(unresolvedSpreads)) && <Section title="Fields" count={node.fields?.length} initiallyOpen>
        {node.fields && <table className="semantic-fields" aria-label="Fields"><thead><tr><th scope="col">Field</th><th scope="col">Type</th></tr></thead><tbody>{node.fields.map(field => <tr key={field.name}>
          <td>{field.name}{field.optional ? '?' : ''}{field.key && <small>{field.key === 'primary' ? 'PK' : 'FK'}</small>}</td><td>{field.type}</td>
        </tr>)}</tbody></table>}
        {Array.isArray(unresolvedSpreads) && <p className="analyzer-muted-copy">未展開のフィールド: {unresolvedSpreads.join(', ')}。共有定義のソースを確認してください。</p>}
      </Section>}
      <Section title="基本情報">
        <Info entries={[['Path', nodePath(node)], ['Language', node.language], ['Group', node.group]]} />
        {node.signature && <pre className="semantic-signature">{node.signature}</pre>}
      </Section>
    </>}
    {edge && <>
      <section className="analyzer-module-edge-endpoints" aria-label="関係の両端">
        <small>関係元 / Source</small><NodeLink id={edge.source} nodes={nodes} onSelect={onSelect} />
        <span aria-hidden="true">↓</span><small>関係先 / Target</small><NodeLink id={edge.target} nodes={nodes} onSelect={onSelect} />
      </section>
      <Section title="関係情報" initiallyOpen><Info entries={[
        ['Kind', edge.kind], ['Confidence', confidenceLabels[edge.confidence]],
      ]} /></Section>
      {edge.provenance && <Section title="元の関係" count={edge.provenance.edges.length} initiallyOpen={edge.provenance.edges.length <= 4}>
        <ExpandableList items={edge.provenance.edges} render={(item, index) => <li key={`${item.id}:${index}`} className="semantic-flow-original-relation">
          <div className="semantic-flow-original-endpoints"><NodeLink id={item.source} nodes={nodes} onSelect={onSelect} /><span aria-hidden="true">↓</span><NodeLink id={item.target} nodes={nodes} onSelect={onSelect} /></div>
          <p>{item.label} · <code>{item.kind}</code> · {confidenceLabels[item.confidence]}</p>
          <SemanticFlowEvidence items={item.evidence} sources={sources} autoOpenSingle={false} />
        </li>} />
      </Section>}
    </>}
    <Section title="Evidence" count={uniqueSemanticEvidence(evidence).length} initiallyOpen={Boolean(edge)}>
      {evidence.length ? <SemanticFlowEvidence items={evidence} sources={sources} /> : <p className="analyzer-muted-copy">{(node ?? edge)?.confidence === 'observed' ? '読み込んだ実行記録の属性を確認してください。ソース対応は記録の範囲に限ります。' : 'この対象に直接対応するソース範囲はありません。関連する関係の根拠を確認してください。'}</p>}
    </Section>
    {node && <>
      <Section title="Metadata"><Info entries={Object.entries(node.attributes).filter(([key]) => !['owner', 'members', 'files', 'initializer'].includes(key))} /></Section>
      <Section title="関連するView" count={semanticViewIds.length - 1}><div className="semantic-crosslinks" role="group" aria-label="関連するView">{semanticViewIds.filter(id => id !== view).map(id => <button key={id} type="button" onClick={() => onJump(node.id, id)}>{analyzerViewLabels[id]} ↗</button>)}</div></Section>
    </>}
  </aside>;
}
