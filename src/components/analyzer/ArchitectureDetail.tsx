import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { AnalyzerProjectStore } from '../../analyzer';
import { stacks } from '../../data/stacks';
import { stackPath } from '../../utils/routes';
import { ArchitectureExpertLinks } from './ArchitectureExpertLinks';
import { projectSemanticView } from '../../analyzer/semantic/project';
import { semanticNavigationContext } from '../../analyzer/semantic/navigation';
import { confidenceLabels, type SemanticAnalysis, type SemanticEdge, type SemanticGraph, type SemanticNode, type SemanticViewId } from '../../analyzer/semantic/types';
import { uniqueArchitectureEvidence } from '../../analyzer/semantic/architectureEvidence';
import { architectureEnvironmentLabel, architectureKindLabels } from '../../analyzer/semantic/architectureMetadata';
import { architectureRelationCounts, architectureRelationLabel, architectureRelationOriginals } from '../../analyzer/semantic/architectureRelations';
import { architecturePartners, architectureRelationSummary, architectureRequestSources } from './architectureSummary';
import { semanticNodeDisplays } from './semanticFlowDisplay';
import { ArchitectureEvidenceHeading, ArchitectureEvidenceList as EvidenceList } from './ArchitectureEvidence';
import { architectureEvidencePaths } from './architectureEvidencePaths';
import { semanticFlowHoverBindings } from './semanticFlowHoverBindings';
import type { SemanticFlowHoverHandler } from '../../analyzer/semantic/flowRelationInteraction';
import './architecture-detail.css';

function Disclosure({ title, children }: { title: ReactNode; children: () => ReactNode }) {
  const [open, setOpen] = useState(false);
  return <details className="analyzer-detail-accordion" onToggle={event => setOpen(event.currentTarget.open)}><summary>{title}</summary>{open && <div className="analyzer-detail-accordion-body">{children()}</div>}</details>;
}
function NodeEvidence({ node, sources }: { node: SemanticNode; sources: Record<string, string> }) {
  const evidence = useMemo(() => uniqueArchitectureEvidence([...node.evidence, ...node.architecture?.roles.flatMap(role => role.evidence) ?? [], ...node.architecture?.configurationVariants?.flatMap(variant => variant.evidence) ?? []]), [node]);
  const sites = new Set(evidence.map(item => JSON.stringify([item.path, item.start, item.end]))).size;
  return <><p>{evidence.length} Evidence · {sites}ソース箇所</p><EvidenceList evidence={evidence} sources={sources} /></>;
}
function SemanticLinks({ analysis, node, onJump }: { analysis: SemanticAnalysis; node: SemanticNode; onJump: (id: string, view: SemanticViewId) => void }) {
  const links = useMemo(() => (['runtime-flow', 'function-call-flow', 'data-flow', 'data-model'] as const).map(view => ({ view, count: semanticNavigationContext(projectSemanticView(analysis, view), node).members?.length ?? 0 })), [analysis, node]);
  return <>{links.map(({ view, count }) => <p key={view}><button disabled={!count} title={count ? `${count}件の所属対象を範囲にして開く` : 'このViewに対応する下位の解析対象がありません'} onClick={() => onJump(node.id, view)}>{({ 'runtime-flow': 'Runtime Flow', 'function-call-flow': 'Function Call Flow', 'data-flow': 'Data Flow', 'data-model': 'Data Model' })[view]}</button> · {count}対象</p>)}</>;
}
function TechnologyLinks({ name }: { name: string }) {
  const exact = stacks.find(stack => stack.id === name), entries = exact ? [exact] : stacks.filter(stack => stack.packageNames?.includes(name));
  return <>{name}{entries.map(entry => <span key={entry.id}> · <Link to={stackPath(entry.id)}>{entry.name}</Link></span>)}</>;
}

function RelationEvidence({ edges, sources }: { edges: SemanticEdge[]; sources: Record<string, string> }) {
  const [limit, setLimit] = useState(20);
  const originals = architectureRelationOriginals(edges), counts = architectureRelationSummary(edges);
  return <Disclosure title="元の関係・Evidenceを開く">{() => {
    const paths = architectureEvidencePaths(originals.flatMap(original => original.evidence));
    return <>
    <p>{counts.records}元関係 · {counts.evidence} Evidence · {counts.sites}ソース箇所</p>
    <details className="architecture-count-definitions"><summary>件数の数え方</summary><p>元関係は異なる関係IDの数、ソース箇所は同じファイル・開始位置・終了位置を一つとした数、Evidenceはその箇所と説明文を一つとした根拠項目数です。同じ箇所から複数の関係や説明が得られるため、数は一致するとは限りません。通信・実行回数ではありません。</p><p>集約線の連続は、一連の実行経路を保証しません。</p></details>
    {originals.slice(0, limit).map(original => <Disclosure key={original.id} title={original.evidence[0] ? <ArchitectureEvidenceHeading item={original.evidence[0]} path={paths.get(original.evidence[0].path)} description={`${architectureRelationLabel(original)} · ${confidenceLabels[original.confidence]} · ${original.evidence[0].description}`} /> : `${architectureRelationLabel(original)} · ${confidenceLabels[original.confidence]} · 箇所未記録`}>
      {() => <><p>元の表記: {original.label}</p><p>種類: {original.kind} · {original.details?.environment || '環境共通・未指定'}</p><code>{original.source} → {original.target}</code><p><code>{original.id}</code></p><EvidenceList evidence={uniqueArchitectureEvidence(original.evidence)} sources={sources} /></>}
    </Disclosure>)}{originals.length > limit && <button onClick={() => setLimit(limit + 30)}>元関係をさらに表示</button>}
  </>; }}</Disclosure>;
}

export function ArchitectureDetail({ node, edge, graph, visible, sources, store, analysis, canOpen, onOpen, onReveal, onSelect, onSelectEdge, onJump, onClose, onHoverTarget }: {
  node?: SemanticNode; edge?: SemanticEdge; graph: SemanticGraph; visible: SemanticGraph; sources: Record<string, string>;
  store: AnalyzerProjectStore; analysis: SemanticAnalysis;
  canOpen?: (id: string) => boolean;
  onOpen: (id: string) => void; onReveal: (id: string) => void; onSelect: (id: string) => void; onSelectEdge: (id: string) => void; onClose: () => void;
  onJump: (id: string, view: SemanticViewId) => void; onHoverTarget?: SemanticFlowHoverHandler;
}) {
  const [relationLimit, setRelationLimit] = useState(20);
  const arch = node?.architecture, children = graph.nodes.filter(n => n.architecture?.parentId === node?.id);
  const byId = useMemo(() => new Map([...graph.nodes, ...visible.nodes].map(n => [n.id, n])), [graph.nodes, visible.nodes]);
  const internal = useMemo(() => visible.architectureView?.internalRelations.filter(e => e.source === node?.id) ?? [], [visible.architectureView?.internalRelations, node?.id]);
  const boundary = useMemo(() => visible.architectureView?.boundaryRelations.filter(e => e.source === node?.id || e.target === node?.id) ?? [], [visible.architectureView?.boundaryRelations, node?.id]);
  const relations = useMemo(() => [...visible.edges.filter(e => e.source === node?.id || e.target === node?.id), ...boundary], [visible.edges, node?.id, boundary]);
  const partners = useMemo(() => architecturePartners(relations, node?.id ?? ''), [relations, node?.id]);
  const partnerDisplays = useMemo(() => semanticNodeDisplays(partners.flatMap(partner => { const other = byId.get(partner.otherId); return other ? [other] : []; }), byId), [partners, byId]);
  const title = node?.label ?? (edge ? architectureRelationLabel(edge) : '構成の詳細');
  const otherButton = (otherId: string, key: string) => { const other = byId.get(otherId); return <button onClick={() => onSelect(otherId)} {...semanticFlowHoverBindings<HTMLButtonElement>(onHoverTarget, { kind: 'node', id: otherId }, `architecture-detail-node:${key}`)}>{other?.label ?? '元の対象'}{other?.architecture?.identity ? ` · ${architectureEnvironmentLabel(other.architecture.environments)}` : ''}</button>; };
  const relationButton = (edge: SemanticEdge) => { const summary = architectureRelationSummary([edge]); return <button onClick={() => onSelectEdge(edge.id)} {...semanticFlowHoverBindings<HTMLButtonElement>(onHoverTarget, { kind: 'edge', id: edge.id }, `architecture-detail-edge:${edge.id}`)}>{architectureRelationLabel(edge)} · {summary.status} · {summary.sites}箇所{edge.details?.environment ? ` · ${edge.details.environment}` : ''}</button>; };
  const partnerDetails = (partner: ReturnType<typeof architecturePartners>[number]) => <>
    <p>{otherButton(partner.otherId, `partner-${partner.otherId}`)} を選択{!visible.nodes.some(item => item.id === partner.otherId) ? ' · 現在の階層では点を表示していない境界の相手' : ''}</p>
    {partner.relations.map(group => { const first = group.edges[0]!, summary = architectureRelationSummary(group.edges); return <div className="architecture-relation-group" key={JSON.stringify([group.direction, first.kind, first.details?.environment])} data-direction={group.direction}>
      <p className="architecture-relation-direction">{group.direction === 'incoming' ? '相手から選択中の構成へ' : group.direction === 'self' ? 'この粒度の自己関係' : '選択中の構成から相手へ'}</p>
      <strong>{architectureRelationLabel(first)}</strong><p className="architecture-relation-status">{summary.status} · {summary.sites}箇所{first.details?.environment ? ` · ${first.details.environment}` : ''}</p>
      {group.edges.some(item => boundary.includes(item)) && <p>構成全体の接続 · 内部の対応箇所は未確認</p>}
      <RelationEvidence edges={group.edges} sources={sources} />
      {group.edges.map(item => <button key={item.id} onClick={() => onSelectEdge(item.id)} {...semanticFlowHoverBindings<HTMLButtonElement>(onHoverTarget, { kind: 'edge', id: item.id }, `architecture-partner-edge:${item.id}`)}>図で関係を選択{group.edges.length > 1 ? ` · ${architectureRelationSummary([item]).status}` : ''}</button>)}
    </div>; })}
  </>;
  const partnerEntry = (partner: ReturnType<typeof architecturePartners>[number]) => { const other = byId.get(partner.otherId), disambiguation = other?.architecture?.identity || other?.attributes.architectureRequestGroup ? partnerDisplays.get(partner.otherId)?.disambiguation : undefined; return <div className="architecture-partner" data-partner-id={partner.otherId} key={partner.otherId}><Disclosure title={<span><strong>{other?.label ?? '元の対象'}</strong>{disambiguation && <small>{disambiguation}</small>}<small>{partner.description}／{partner.direction}</small></span>}>{() => partnerDetails(partner)}</Disclosure></div>; };
  const requestOrigin = node && (arch?.request || node.attributes.architectureRequestGroup) ? architectureRequestSources(Array.isArray(node.attributes.requestIds) ? node.attributes.requestIds.map(id => byId.get(id)) : [node], byId) : undefined;
  return <aside className="analyzer-detail-panel is-module-detail semantic-detail semantic-flow-detail architecture-detail" aria-label="構成の詳細">
    <div className="analyzer-detail-heading"><h3>{title}</h3><button type="button" aria-label="詳細を閉じる" onClick={onClose}>×</button></div>
    {node && arch && <>
      <p className="architecture-detail-kind"><strong>選択中</strong> · {architectureKindLabels[arch.kind]}</p>
      {node.attributes.architectureContext && <p className="architecture-context-note">表示範囲外 · 周辺の構成として表示</p>}
      <dl className="analyzer-metadata-list architecture-summary">
        <div><dt>役割</dt><dd>{arch.request ? `${({ http: 'HTTP要求のコードを確認。接続先は未特定', process: '起動要求のコードを確認。起動先は未特定', auth: '認証SDKの使用・設定コードを確認。プロジェクトは未特定' })[arch.request.kind]}` : arch.codeUsage?.reason ?? (arch.roles.length ? `${arch.roles.slice(0, 2).map(role => role.label).join(' / ')}${arch.roles.length > 2 ? ` ほか${arch.roles.length - 2}役割` : ''}（推定）` : '具体的な役割は未判定')}</dd></div>
        {requestOrigin ? <div><dt>要求元</dt><dd>{requestOrigin.label.replace(/^要求元：/, '')}<small className="architecture-count-note">要求を書いた側です。接続先の所属は未特定です。</small>{requestOrigin.sources.length > 1 && <Disclosure title="要求元の内訳">{() => <>{requestOrigin.sources.map(source => <p key={source.id}>{otherButton(source.id, `request-${source.id}`)}</p>)}{requestOrigin.unknown && <p>要求元未確認の要求も含みます。</p>}</>}</Disclosure>}</dd></div>
          : <div><dt>所属</dt><dd>{arch.parentId ? byId.get(arch.parentId)?.label : arch.ownerPath || (['application', 'component', 'shared-code', 'code-package'].includes(arch.kind) ? 'プロジェクト' : '外部・設定上の対象')}</dd></div>}
        <div><dt>環境・設定</dt><dd>{arch.context.join(' / ') || '実行先未判定'} · {architectureEnvironmentLabel(arch.environments)}</dd></div>
      </dl>
      <div className="architecture-summary-partners"><strong>主な相手</strong>{partners.slice(0, 3).map(partnerEntry)}{partners.length > 3 && <small>ほか{partners.length - 3}相手。つながる相手で確認できます。</small>}{!partners.length && <p>現在の表示条件で、つながる相手はありません。</p>}</div>
      {(canOpen ? canOpen(node.id) : children.length > 0) && <button className="architecture-open-action" onClick={() => onOpen(node.id)}>{node.attributes.architectureContext ? 'この構成を開く' : '内部を開く'}</button>}
      <Disclosure title="専門Viewで調べる">{() => <><SemanticLinks analysis={analysis} node={node} onJump={onJump} /><ArchitectureExpertLinks node={node} store={store} /></>}</Disclosure>
      <Disclosure title={`内部の構成 · 全${children.length}要素 / 表示条件内の関係 ${architectureRelationCounts(internal).records}件`}>{() => <>
        <p>全構成の内訳（補助コードを含む）: {children.length}内部構成要素 · {arch.files.length}固有ファイル · {arch.memberIds.length}下位解析対象</p>
        {children.map(child => <p key={child.id}>{child.label}{child.architecture?.auxiliary ? ' · 補助コード' : ''} · <button onClick={() => onReveal(child.id)}>この要素へ移動</button></p>)}
        {internal.length > 0 && <><p>現在の表示条件で同じ構成要素に収まる関係です。下位の再帰も含み、構成全体の自己通信を意味しません。</p>{internal.map(e => <p key={e.id}>{relationButton(e)}</p>)}</>}
        <Disclosure title="構成ファイル一覧">{() => arch.files.map(path => <p key={path}><code>{path}</code></p>)}</Disclosure>
      </>}</Disclosure>
      <Disclosure title={`つながる相手 · ${partners.length}相手`}>{() => <>
        <p>現在の環境・補助コードなどの表示条件を適用。内部関係は別欄です。構成全体の境界接続は内部の対応箇所を確認できていません。</p>
        {partners.slice(0, relationLimit).map(partnerEntry)}{partners.length > relationLimit && <button onClick={() => setRelationLimit(relationLimit + 30)}>相手をさらに表示</button>}
      </>}</Disclosure>
      <Disclosure title={`技術の宣言・参照 · ${arch.technologies?.length ?? arch.technologyNames.length}件`}>{() => <>
        <p>パッケージの依存区分だけでは、この実行主体で動く技術と確定しません。</p>
        {(['source', 'support', 'configuration', 'declared'] as const).map(usage => { const items = arch.technologies?.filter(item => item.usage === usage) ?? []; return items.length ? <section key={usage}><h4>{({ source: 'この構成でソース参照を確認', support: '型・ビルド・テストの支援', configuration: '構成設定から確認', declared: '宣言あり・この構成での使用は未確認' })[usage]}</h4>{items.map(item => <Disclosure key={item.name} title={<TechnologyLinks name={item.name} />}>{() => <><p>{item.reason}</p>{item.declarations.map((declaration, index) => <p key={index}>{declaration.section} · <code>{declaration.path}</code></p>)}<EvidenceList evidence={uniqueArchitectureEvidence([...item.evidence, ...item.declarations.flatMap(d => d.evidence)])} sources={sources} /></>}</Disclosure>)}</section> : null; })}
      </>}</Disclosure>
      <Disclosure title="分類・同一性の判定理由">{() => <>
        <p>構成の確認状態: {confidenceLabels[node.confidence]}。役割・接続先の特定とは別に扱います。</p>
        {arch.roles.map((role, index) => <p key={index}><strong>{role.label}</strong> · {confidenceLabels[role.confidence]}<br />{role.reason}</p>)}
        {arch.codeUsage && <><p>{arch.codeUsage.reason}</p><p>確認した利用元: {arch.codeUsage.consumerIds.length}構成要素（全構成）。現在の表示範囲には出ていない利用元も含みます。</p>{arch.codeUsage.consumerIds.map(id => <p key={id}>{otherButton(id, `consumer-${id}`)}</p>)}<EvidenceList evidence={[...arch.codeUsage.declarationEvidence, ...arch.codeUsage.sourceEvidence]} sources={sources} /></>}
        {arch.identity && <><p>同一性: {arch.identity.status === 'confirmed' ? '識別情報から対応を確認' : '未確認'}</p><p>{arch.identity.reason}</p>{arch.identity.identifier && <p>識別子: <code>{arch.identity.identifier}</code></p>}{arch.identity.scope && <p>設定範囲: <code>{arch.identity.scope}</code></p>}</>}
        <small>ソースと設定から確認した構成です。現在の稼働は観測していません。</small>
      </>}</Disclosure>
      <Disclosure title="実行・配信・接続">{() => <>
        <section data-architecture-settings="entries"><h4>確認した入口の宣言：{arch.entryPaths.length}件</h4>{arch.entryPaths.map(path => <p key={path}><code>{path}</code></p>)}{!arch.entryPaths.length && <p>この解析範囲では入口宣言を確認していません。</p>}</section>
        {arch.configurationVariants !== undefined && <section data-architecture-settings="variants"><h4>実行・配信の設定宣言：{arch.configurationVariants.length}件</h4>{arch.configurationVariants.map(variant => <div key={variant.environment}><p>{variant.environment || '既定設定'}: 名前の宣言 {variant.name || '未指定'}<br />入口 {variant.entryPath || '未指定（静的配信など）'}{variant.inherited.length > 0 && <small>上位の宣言を参照: {variant.inherited.join(', ')}。配備名は未観測</small>}</p><EvidenceList evidence={variant.evidence} sources={sources} /></div>)}</section>}
        {arch.identity?.configurations !== undefined && <section data-architecture-settings="connections"><h4>接続先の設定：{arch.identity.configurations.length}件</h4>{arch.identity.configurations.map(setting => <Disclosure key={setting.id} title={`${setting.environment || '既定設定'} · ${setting.binding || setting.name || '対象設定'}`}>
          {() => <><p>設定ファイル: <code>{setting.path}</code></p><p>名前: {setting.name || '未指定'} · 識別子: <code>{setting.identifier || '未指定'}</code></p><EvidenceList evidence={setting.evidence} sources={sources} /></>}</Disclosure>)}</section>}
        {arch.configurationVariants === undefined && arch.identity?.configurations === undefined && <p data-architecture-settings="unknown">配信・接続の設定情報は、この構成の解析結果には記録されていません。設定が存在しないと確認した0件とは区別します。</p>}
      </>}</Disclosure>
      {arch.request && <Disclosure title="確認した要求式・箇所">{() => <><p>要求や設定のコードを確認しています。同じ相手への実行回数ではありません。</p><pre>{arch.request!.expression}</pre><code>{arch.request!.sourceId}</code></>}</Disclosure>}
    </>}
    {edge && <>
      <p className="architecture-detail-kind"><strong>選択中の関係</strong></p>
      <p>{otherButton(edge.source, 'source')} から {otherButton(edge.target, 'target')} へ</p>
      <p>{architectureRelationSummary([edge]).status} · {architectureRelationSummary([edge]).sites}箇所 · {edge.details?.environment || '環境共通・未指定'}</p>
      {edge.details?.architectureRelation === 'internal' && <p>表示上は一つの構成要素に収まる内部関係です。アプリ全体の自己通信を示しません。</p>}
      {edge.details?.architectureRelation === 'self' && <p>現在の構成粒度で確認した自己関係です。</p>}
      <RelationEvidence edges={[edge]} sources={sources} />
    </>}
    {node && !edge && <Disclosure title="元の根拠・Evidence">{() => <NodeEvidence node={node} sources={sources} />}</Disclosure>}
    <Disclosure title="内部メタデータ">{() => <pre>{JSON.stringify(node ? { id: node.id, attributes: node.attributes } : { id: edge?.id, kind: edge?.kind }, null, 2)}</pre>}</Disclosure>
  </aside>;
}
