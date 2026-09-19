import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { getStack } from '../../data';
import { stackPath } from '../../utils/routes';
import { uniqueSemanticEvidence } from '../../analyzer/semantic/presentation';
import { kindLabels, semanticViewIds, type SemanticEdge, type SemanticEvidence, type SemanticNode, type SemanticRelationSource, type SemanticViewId, type SemanticExplorerViewId } from '../../analyzer/semantic/types';
import { analyzerViewLabels } from '../../analyzer/types';
import type { SemanticFlowHoverHandler, SemanticFlowHoverTarget } from '../../analyzer/semantic/flowRelationInteraction';
import { semanticNodeDisplays, type SemanticNodeDisplay } from './semanticFlowDisplay';
import { useSemanticFlowHoverBindings } from './semanticFlowHoverBindings';
import { isUnresolvedCallNode, semanticFlowDirectionLanguage, semanticNodeConfidence, semanticNodeExplanation, semanticRelationConfidence, semanticRelationExplanation, semanticRelationLabel } from './semanticFlowLanguage';
import './semantic-flow-language.css';
import './semantic-flow-relation-interaction.css';
import { SemanticModelStructure } from './SemanticModelStructure';
import { SemanticExpression } from './SemanticExpression';

interface Props {
  node?: SemanticNode; edge?: SemanticEdge; nodes: ReadonlyMap<string, SemanticNode>; edges: SemanticEdge[]; sources: Record<string, string>;
  view: SemanticExplorerViewId; onSelect: (id: string) => void; onSelectEdge: (id: string) => void; onClose: () => void; onJump: (id: string, targetView: SemanticViewId, fieldId?: string) => void;
  fieldId?: string; onField?: (id?: string) => void;
  openChoiceIds?: readonly string[]; onOpenChoiceIds?: (ids: string[]) => void;
  hoverTarget?: SemanticFlowHoverTarget; onHoverTarget?: SemanticFlowHoverHandler;
}
type DetailInteraction = Pick<Props, 'hoverTarget' | 'onHoverTarget'> & { displays: ReadonlyMap<string, SemanticNodeDisplay> };

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

const evidenceLocation = (evidence: SemanticEvidence) => `${evidence.path}:${evidence.line}${evidence.endLine > evidence.line ? `–${evidence.endLine}` : ''}`;
const callSiteLocations = (evidence: SemanticEvidence[]) => [...new Map(evidence.map(item => [`${item.path}:${item.start}:${item.end}`, evidenceLocation(item)])).values()];

function RelationSourceInfo({ edge }: { edge: SemanticRelationSource }) {
  const [open, setOpen] = useState(false);
  return <details className="semantic-flow-source-info" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>解析上の識別情報</summary>
    {open && <Info entries={[
      ['関係ID', edge.id], ['Source ID', edge.source], ['Target ID', edge.target], ['Kind', edge.kind], ['Confidence', edge.confidence], ['元の表示名', edge.label],
    ]} />}
  </details>;
}

function NodeLink({ id, nodes, onSelect, interaction }: { id: string; nodes: Props['nodes']; onSelect: Props['onSelect']; interaction: DetailInteraction }) {
  const node = nodes.get(id), display = interaction.displays.get(id);
  const bindings = useSemanticFlowHoverBindings<HTMLButtonElement>(interaction.onHoverTarget, { kind: 'node', id }, `detail-node:${id}`);
  return <button type="button" className="analyzer-module-connection-name" onClick={() => onSelect(id)} {...bindings}
    data-flow-detail-node-id={id} data-flow-emphasized={interaction.hoverTarget?.kind === 'node' && interaction.hoverTarget.id === id || undefined} title={display?.tooltip}>
    <strong>{node?.data ? display?.title ?? node.label : node?.label ?? id}</strong>{display?.dataRole && <small>{display.dataRole}</small>}{(display?.disambiguation || nodePath(node)) && <small>{isUnresolvedCallNode(node) ? '呼び出し箇所の一例: ' : ''}{display?.disambiguation ?? nodePath(node)}</small>}
  </button>;
}

function RelationLink({ edge, onSelectEdge, interaction, selectable = true }: { edge: SemanticRelationSource; onSelectEdge: Props['onSelectEdge']; interaction: DetailInteraction; selectable?: boolean }) {
  const callSites = edge.kind === 'calls' && edge.confidence === 'unresolved' ? callSiteLocations(edge.evidence) : [];
  const bindings = useSemanticFlowHoverBindings<HTMLElement>(interaction.onHoverTarget, { kind: 'edge', id: edge.id }, `detail-edge:${edge.id}`);
  const emphasized = interaction.hoverTarget?.kind === 'edge' && interaction.hoverTarget.id === edge.id || undefined;
  return <div className="semantic-flow-relation-link">
    {selectable ? <button type="button" onClick={() => onSelectEdge(edge.id)} {...bindings} data-flow-detail-edge-id={edge.id}
      data-flow-emphasized={emphasized}>{semanticRelationLabel(edge)} · {semanticRelationConfidence(edge)}</button>
      : <p {...bindings} tabIndex={0} data-flow-detail-edge-id={edge.id} data-flow-emphasized={emphasized}>{semanticRelationLabel(edge)} · {semanticRelationConfidence(edge)}</p>}
    {callSites.length > 0 && <small className="semantic-flow-call-site">呼び出し箇所: {callSites[0]}{callSites.length > 1 ? ` ほか${callSites.length - 1}箇所` : ''}</small>}
  </div>;
}

function RelationGroup({ edges, onSelectEdge, id, interaction }: { edges: SemanticEdge[]; onSelectEdge: Props['onSelectEdge']; id: string; interaction: DetailInteraction }) {
  const [open, setOpen] = useState(false);
  const bindings = useSemanticFlowHoverBindings<HTMLElement>(interaction.onHoverTarget, { kind: 'node', id }, `detail-group:${id}`);
  if (edges.length === 1) return <RelationLink edge={edges[0]!} onSelectEdge={onSelectEdge} interaction={interaction} />;
  return <details className="semantic-flow-relation-group" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary {...bindings} data-flow-detail-group-id={id}>関係 {edges.length.toLocaleString()}件</summary>
    {open && <ExpandableList items={edges} render={edge => <li key={edge.id}><RelationLink edge={edge} onSelectEdge={onSelectEdge} interaction={interaction} /></li>} />}
  </details>;
}

function Connections({ edges, incoming = false, nodes, onSelect, onSelectEdge, interaction }: {
  edges: SemanticEdge[]; incoming?: boolean; nodes: Props['nodes']; onSelect: Props['onSelect']; onSelectEdge: Props['onSelectEdge']; interaction: DetailInteraction;
}) {
  const grouped = new Map<string, SemanticEdge[]>();
  for (const edge of edges) {
    const id = incoming ? edge.source : edge.target;
    const relations = grouped.get(id) ?? []; relations.push(edge); grouped.set(id, relations);
  }
  if (!grouped.size) return <p className="analyzer-muted-copy">該当する関係はありません。</p>;
  return <ExpandableList items={[...grouped]} render={([id, relations]) => <li key={id} className="semantic-flow-connection-row">
    <NodeLink id={id} nodes={nodes} onSelect={onSelect} interaction={interaction} />
    <RelationGroup id={id} edges={relations} onSelectEdge={onSelectEdge} interaction={interaction} />
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

export function SemanticFlowDetail({ node, edge, nodes, edges, sources, view, onSelect, onSelectEdge, onClose, onJump, hoverTarget, onHoverTarget, fieldId, onField, openChoiceIds, onOpenChoiceIds }: Props) {
  const displays = useMemo(() => {
    const related = new Set([...(node ? [node.id] : []), ...edges.filter(item => item.source === node?.id || item.target === node?.id).flatMap(item => [item.source, item.target]),
      ...(edge ? [edge.source, edge.target, ...edge.provenance?.edges.flatMap(item => [item.source, item.target]) ?? []] : [])]);
    return semanticNodeDisplays([...related].flatMap(id => { const item = nodes.get(id); return item ? [item] : []; }), nodes);
  }, [node, edge, nodes, edges]);
  const interaction: DetailInteraction = { hoverTarget, onHoverTarget, displays };
  if (!node && !edge) return null;
  const outgoing = node ? edges.filter(item => item.source === node.id && item.target !== node.id) : [];
  const incoming = node ? edges.filter(item => item.target === node.id && item.source !== node.id) : [];
  const internal = node ? edges.filter(item => item.source === node.id && item.target === node.id) : [];
  const evidence = edge?.evidence ?? (isUnresolvedCallNode(node)
    ? uniqueSemanticEvidence([...(node?.evidence ?? []), ...[...incoming, ...internal].filter(item => item.kind === 'calls').flatMap(item => item.evidence)])
    : node?.evidence ?? []);
  const callSiteCount = callSiteLocations(evidence).length;
  const language = semanticFlowDirectionLanguage(view);
  const explanation = node ? semanticNodeExplanation(node) : semanticRelationExplanation(edge!, nodes.get(edge!.target));
  const unresolvedSpreads = node?.attributes.unresolvedSpreads;
  return <aside className="analyzer-detail-panel is-module-detail semantic-detail semantic-flow-detail" aria-label="選択した要素の詳細">
    <header className="analyzer-module-detail-header">
      <div className="analyzer-detail-heading-top"><span className="analyzer-node-type">{node ? isUnresolvedCallNode(node) ? '呼び出し先' : kindLabels[node.kind] : '関係'}</span>
        <button type="button" className="analyzer-detail-close" aria-label="詳細を閉じる" onClick={onClose}>閉じる</button></div>
      <h3>{node ? view === 'data-flow' ? displays.get(node.id)?.title ?? node.label : node.label : semanticRelationLabel(edge!)}</h3>
      {node&&typeof node.attributes.dictionaryStackId==='string'&&getStack(node.attributes.dictionaryStackId)&&<p><Link to={stackPath(node.attributes.dictionaryStackId)}>{getStack(node.attributes.dictionaryStackId)!.name} の辞書</Link></p>}
      {node?.data && <p>{displays.get(node.id)?.dataRole} · {String(node.attributes.ownerName ?? node.group)}</p>}
      {nodePath(node) && <p className="analyzer-module-detail-path">{isUnresolvedCallNode(node) ? '呼び出し箇所の一例: ' : ''}{nodePath(node)}</p>}
      {node && displays.get(node.id)?.disambiguation && <p className="semantic-flow-detail-identity">{displays.get(node.id)!.disambiguation}</p>}
      <div className="analyzer-module-detail-meta"><span className="semantic-confidence">{node ? semanticNodeConfidence(node) : semanticRelationConfidence(edge!)}</span></div>
    </header>
    {view === 'data-flow' && node?.confidence === 'observed' && <div className="semantic-flow-resolution-note" role="note"><p>{node.attributes.valueRecorded === false ? '観測された入力・出力の名前です。実値は記録されていません。' : '読み込んだ観測イベントです。静的に可能な経路と区別して表示しています。'}</p>{typeof node.attributes.sourceBinding === 'string' && <p>{node.attributes.sourceBinding}</p>}</div>}
    {node?.model && view === 'data-model' && <SemanticModelStructure node={node} fieldId={fieldId} onField={id => onField?.(id)} openChoiceIds={openChoiceIds} onOpenChoiceIds={onOpenChoiceIds} onSelect={onSelect} onJump={onJump} evidence={items => <SemanticFlowEvidence items={items} sources={sources} />} />}
    {node?.data && view === 'data-flow' && <Section title="値・操作の内容" initiallyOpen><Info entries={[
      ['種類', ({ declaration: '変数の宣言・初期値', assignment: '再代入', use: '値の利用箇所', 'property-read': '項目の読み取り', 'property-write': '項目への設定', argument: '実引数', parameter: '仮引数', return: '戻り値・return箇所', termination: '値を指定せずに終了', 'call-result': 'この呼び出しの結果', operation: '操作・加工', literal: 'リテラル・関数の値', unknown: '由来未解決の値' })[node.data.role]],
      ['所属', node.attributes.ownerName], ['項目の経路', node.data.propertyPath?.join('.')], ['引数位置', node.data.argumentIndex !== undefined ? `第${node.data.argumentIndex + 1}引数` : undefined],
      ['経路', node.data.conditional ? '条件付きの可能な経路（実行を観測していません）' : undefined], ['追跡状態', node.data.resolution === 'unresolved' ? '未解決' : node.data.resolution === 'partial' ? '部分的に展開' : undefined],
    ]} /><SemanticExpression text={node.data.expression} />{node.data.reasons?.map((reason, index) => <p key={index}>{reason}</p>)}
      {node.attributes.contextualSummary && Array.isArray(node.attributes.sourceMembers) && <details><summary>集約した定義の対象 {node.attributes.sourceMembers.length}件</summary><ExpandableList items={node.attributes.sourceMembers} render={id => <li key={id}><NodeLink id={id} nodes={nodes} onSelect={onSelect} interaction={interaction} /></li>} /></details>}
    </Section>}
    {explanation && <div className="semantic-flow-resolution-note" role="note" aria-label="確認できている範囲"><p>{explanation}</p>
      {isUnresolvedCallNode(node) && callSiteCount > 0 && <small>{callSiteCount}箇所の呼び出しを確認。{callSiteCount > 1 ? '各箇所の定義先は個別に未特定です。' : ''}呼び出し元ごとの関係から根拠を開けます。</small>}
    </div>}
    {node && <>
      {node.attributes.configurationOccurrence && <Section title="構成と接続先" initiallyOpen>
        <p>ソースに宣言された設定です。稼働状態や通信結果は観測していません。</p>
        <Info entries={[
          ['環境',node.attributes.environment],['接続先',node.attributes.endpoint],['Origin',node.attributes.origin],['CDNドメイン',node.attributes.cdnDomains??node.attributes.cdnDomain],
          ['Namespace',node.attributes.namespace],['Selector',node.attributes.selector],['Podラベル',node.attributes.podLabels],['ポート',node.attributes.ports??node.attributes.servicePorts],
          ['Location',node.attributes.location],['Artifact',node.attributes.artifactName],['出力先',node.attributes.outputPath??node.attributes.publicDirectory],['Hosting target',node.attributes.hostingTarget],
          ['VirtualHost',node.attributes.virtualHost],['DocumentRoot',node.attributes.documentRoot],['ServerName',node.attributes.serverName],
          ['配信設定',node.attributes.deliverySettings],['Ingressルール',node.attributes.rules],
        ]}/>
      </Section>}
      <Section title={language.outgoing} count={outgoing.length} direction="imports" initiallyOpen={outgoing.length > 0}>
        <Connections edges={outgoing} nodes={nodes} onSelect={onSelect} onSelectEdge={onSelectEdge} interaction={interaction} />
      </Section>
      <Section title={language.incoming} count={incoming.length} direction="imported-by" initiallyOpen={incoming.length > 0 && (outgoing.length === 0 || incoming.length <= 4)}>
        <Connections edges={incoming} incoming nodes={nodes} onSelect={onSelect} onSelectEdge={onSelectEdge} interaction={interaction} />
      </Section>
      {internal.length > 0 && <Section title="自己参照" count={internal.length} direction="internal" initiallyOpen>
        <Connections edges={internal} nodes={nodes} onSelect={onSelect} onSelectEdge={onSelectEdge} interaction={interaction} />
      </Section>}
      {!(view === 'data-model' && node.model) && (node.fields || Array.isArray(unresolvedSpreads)) && <Section title="Fields" count={node.fields?.length} initiallyOpen>
        {node.fields && <table className="semantic-fields" aria-label="Fields"><thead><tr><th scope="col">Field</th><th scope="col">Type</th></tr></thead><tbody>{node.fields.map(field => <tr key={field.name}>
          <td>{field.name}{field.optional ? '?' : ''}{field.key && <small>{field.key === 'primary' ? 'PK' : 'FK'}</small>}</td><td>{field.type}</td>
        </tr>)}</tbody></table>}
        {Array.isArray(unresolvedSpreads) && <p className="analyzer-muted-copy">未展開のフィールド: {unresolvedSpreads.join(', ')}。共有定義のソースを確認してください。</p>}
      </Section>}
      <Section title="基本情報">
        <Info entries={[['Path', nodePath(node)], ['ソース範囲', node.evidence.length ? [...new Set(node.evidence.map(item => `${item.path}: ${item.start}–${item.end}`))].join(' / ') : undefined], ['Language', node.language], ['Group', node.group], ['Node ID', node.id], ['Kind', node.kind], ['Confidence', node.confidence]]} />
        {node.signature && <pre className="semantic-signature">{node.signature}</pre>}
      </Section>
    </>}
    {edge && <>
      <section className="analyzer-module-edge-endpoints" aria-label="関係の両端">
        <small>関係元 / Source</small><NodeLink id={edge.source} nodes={nodes} onSelect={onSelect} interaction={interaction} />
        <span aria-hidden="true">↓</span><small>関係先 / Target</small><NodeLink id={edge.target} nodes={nodes} onSelect={onSelect} interaction={interaction} />
      </section>
      <Section title="関係情報" initiallyOpen><Info entries={[
        ['関係', semanticRelationLabel(edge)], ['確認状況', semanticRelationConfidence(edge)],
        ['理由', edge.details?.reason], ['項目', edge.details?.propertyPath?.join('.')], ['呼び出し箇所', edge.details?.callSiteId ? nodePath(nodes.get(edge.details.callSiteId)) : undefined],
      ]} /><RelationSourceInfo edge={edge} /></Section>
      {edge.details?.sourceEdgeIds && <Section title="集約元の関係" count={edge.details.sourceEdgeIds.length}><ExpandableList items={edge.details.sourceEdgeIds.flatMap(id => { const original = edges.find(item => item.id === id); return original ? [original] : []; })} render={item => <li key={item.id}><RelationLink edge={item} onSelectEdge={onSelectEdge} interaction={interaction} /></li>} /></Section>}
      {edge.provenance && <Section title="元の関係" count={edge.provenance.edges.length} initiallyOpen={edge.provenance.edges.length <= 4}>
        <ExpandableList items={edge.provenance.edges} render={(item, index) => <li key={`${item.id}:${index}`} className="semantic-flow-original-relation">
          <div className="semantic-flow-original-endpoints"><NodeLink id={item.source} nodes={nodes} onSelect={onSelect} interaction={interaction} /><span aria-hidden="true">↓</span><NodeLink id={item.target} nodes={nodes} onSelect={onSelect} interaction={interaction} /></div>
          <RelationLink edge={item} onSelectEdge={onSelectEdge} interaction={interaction} selectable={false} />
          <RelationSourceInfo edge={item} />
          <SemanticFlowEvidence items={item.evidence} sources={sources} autoOpenSingle={false} />
        </li>} />
      </Section>}
    </>}
    <Section title="Evidence" count={uniqueSemanticEvidence(evidence).length} initiallyOpen={Boolean(edge)}>
      {evidence.length ? <SemanticFlowEvidence items={evidence} sources={sources} /> : <p className="analyzer-muted-copy">{(node ?? edge)?.confidence === 'observed' ? '読み込んだ実行記録の属性を確認してください。ソース対応は記録の範囲に限ります。' : 'この対象に直接対応するソース範囲はありません。関連する関係の根拠を確認してください。'}</p>}
    </Section>
    {node && <>
      <Section title="Metadata"><Info entries={Object.entries(node.attributes).filter(([key]) => !['owner', 'members', 'files', 'initializer'].includes(key))} /></Section>
      {(view === 'data-flow' || view === 'data-model') && node.links?.length ? <Section title={view === 'data-flow' ? '対応するデータ構造' : 'データフロー・利用箇所'} count={node.links.length} initiallyOpen><ExpandableList items={node.links.filter(link => nodes.has(link.targetId))} render={(link, index) => <li key={`${link.targetId}:${index}`}><button type="button" onClick={() => onJump(link.targetId, link.view, link.fieldId)}>{link.reason} ↗</button></li>} /></Section> : null}
      <Section title="関連するView" count={semanticViewIds.filter(id => id !== view && (!(view === 'data-flow' || view === 'data-model') || id !== 'data-flow' && id !== 'data-model')).length}><div className="semantic-crosslinks" role="group" aria-label="関連するView">{semanticViewIds.filter(id => id !== view && (!(view === 'data-flow' || view === 'data-model') || id !== 'data-flow' && id !== 'data-model')).map(id => <button key={id} type="button" onClick={() => onJump(node.id, id)}>{analyzerViewLabels[id]} ↗</button>)}</div></Section>
    </>}
  </aside>;
}
