import {architectureDefinitionPresentation} from './architectureDefinitionPresentation';
import { architectureEnvironmentContext, architectureUsageContext, architectureTargetSummary } from '../../analyzer/semantic/architectureContext';
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
import { architecturePartners, architecturePeerSummary, architectureRelationSummary, architectureRequestSources } from './architectureSummary';
import { semanticNodeDisplays } from './semanticFlowDisplay';
import { ArchitectureEvidenceHeading, ArchitectureEvidenceList as EvidenceList } from './ArchitectureEvidence';
import { architectureEvidencePaths } from './architectureEvidencePaths';
import { semanticFlowHoverBindings } from './semanticFlowHoverBindings';
import type { SemanticFlowHoverHandler } from '../../analyzer/semantic/flowRelationInteraction';
import './architecture-detail.css';
import { architectureProviderExplanation, architectureRequestPartition, architectureRequestTitle } from './architectureRequestPresentation';
import { publicUrlText } from '../../analyzer/urlPrivacy';

function DefinitionPath({path}:{path:string}) {
 const [status,setStatus]=useState('');
 return <div className="architecture-evidence-full-path"><code tabIndex={0}>{path}</code><button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(path);setStatus('コピーしました');}catch{setStatus('完全なパスを選択してコピーできます。');}}}>定義パスをコピー</button><span role="status">{status}</span></div>;
}
function Disclosure({ title, children }: { title: ReactNode; children: () => ReactNode }) {
  const [open, setOpen] = useState(false);
  return <details className="analyzer-detail-accordion" onToggle={event => setOpen(event.currentTarget.open)}><summary>{title}</summary>{open && <div className="analyzer-detail-accordion-body">{children()}</div>}</details>;
}
function NodeEvidence({ node, sources }: { node: SemanticNode; sources: Record<string, string> }) {
  const evidence = useMemo(() => uniqueArchitectureEvidence([...node.evidence, ...node.architecture?.roles.flatMap(role => role.evidence) ?? [], ...node.architecture?.configurationVariants?.flatMap(variant => variant.evidence) ?? []]), [node]);
  const sites = new Set(evidence.map(item => JSON.stringify([item.path, item.start, item.end]))).size;
  return <><p>{evidence.length} Evidence · {sites}ソース箇所</p><EvidenceList evidence={evidence} sources={sources} /></>;
}
function OperationCommand({command}:{command:string}) {
  const [message,setMessage]=useState('');
  return <div><code style={{overflowWrap:'anywhere',whiteSpace:'pre-wrap'}}>{command}</code><p><button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(command);setMessage('コピーしました');}catch{setMessage('コピーできませんでした。コマンドを選択してコピーしてください。');}}}>コマンドをコピー</button><span role="status">{message}</span></p></div>;
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
      {() => <><p>元の表記: {original.label}</p><p>種類: {original.kind} · {original.details?.environment || '対象環境の指定なし'}</p><code>{original.source} → {original.target}</code><p><code>{original.id}</code></p><EvidenceList evidence={uniqueArchitectureEvidence(original.evidence)} sources={sources} /></>}
    </Disclosure>)}{originals.length > limit && <button onClick={() => setLimit(limit + 30)}>元関係をさらに表示</button>}
  </>; }}</Disclosure>;
}

export function ArchitectureDetail({ node, edge, graph, visible, sources, store, analysis, canOpen, onOpen, onReveal, onSelect, onSelectEdge, onJump, onClose, onHoverTarget, contentAllowedIds, contentMembership, onShowAll }: {
  node?: SemanticNode; edge?: SemanticEdge; graph: SemanticGraph; visible: SemanticGraph; sources: Record<string, string>;
  store: AnalyzerProjectStore; analysis: SemanticAnalysis;
  canOpen?: (id: string) => boolean;
  onOpen: (id: string) => void; onReveal: (id: string) => void; onSelect: (id: string) => void; onSelectEdge: (id: string) => void; onClose: () => void;
  onJump: (id: string, view: SemanticViewId) => void; onHoverTarget?: SemanticFlowHoverHandler;
  contentMembership?:{label:string;reason:string;source?:string};contentAllowedIds?:ReadonlySet<string>;onShowAll?:(id:string)=>void;
}) {
  const [relationLimit, setRelationLimit] = useState(20);
  const [knownLimit,setKnownLimit]=useState(3),[unknownLimit,setUnknownLimit]=useState(3);
  const outside = Boolean(node && visible.architectureView?.scopeId && !visible.architectureView.detailIds.includes(node.id));
  const arch = node?.architecture, children = graph.nodes.filter(n => n.architecture?.parentId === node?.id);
  const byId = useMemo(() => new Map([...graph.nodes, ...visible.nodes].map(n => [n.id, n])), [graph.nodes, visible.nodes]);
  const definition=useMemo(()=>node?architectureDefinitionPresentation(node,byId):undefined,[node,byId]);
  const operationTargets = useMemo(() => node?.architecture?.kind === 'tool-operation' ? architectureTargetSummary(node, analysis.architecture?.edges ?? [], byId) : [], [node, analysis.architecture?.edges, byId]);
  const internal = useMemo(() => visible.architectureView?.internalRelations.filter(e => e.source === node?.id) ?? [], [visible.architectureView?.internalRelations, node?.id]);
  const boundary = useMemo(() => visible.architectureView?.boundaryRelations.filter(e => e.source === node?.id || e.target === node?.id) ?? [], [visible.architectureView?.boundaryRelations, node?.id]);
  const relations = useMemo(() => [...visible.edges.filter(e => e.source === node?.id || e.target === node?.id), ...boundary,...(contentAllowedIds?graph.edges.filter(e=>(e.source===node?.id&&!contentAllowedIds.has(e.target)||e.target===node?.id&&!contentAllowedIds.has(e.source))):[])], [visible.edges, node?.id, boundary,contentAllowedIds,graph.edges]);
  const partners = useMemo(() => architecturePartners(relations, node?.id ?? ''), [relations, node?.id]);
  const peerSummary=useMemo(()=>architecturePeerSummary(partners,byId),[partners,byId]);
  const partnerDisplays = useMemo(() => semanticNodeDisplays(partners.flatMap(partner => { const other = byId.get(partner.otherId); return other ? [other] : []; }), byId), [partners, byId]);
  const title = node ? architectureRequestTitle(node) : (edge ? architectureRelationLabel(edge) : '構成の詳細');
  const requestGroup = visible.architectureView?.requestGroups.find(group => group.memberIds.includes(node?.id ?? ''));
  const requestPartition = requestGroup && architectureRequestPartition(requestGroup.memberIds, visible);
  const scopeRole = node?.attributes.architectureScopeRole;
  const otherButton = (otherId: string, key: string) => { const other = byId.get(otherId); return <button onClick={() => contentAllowedIds&&!contentAllowedIds.has(otherId)?onShowAll?.(otherId):onSelect(otherId)} {...semanticFlowHoverBindings<HTMLButtonElement>(onHoverTarget, { kind: 'node', id: otherId }, `architecture-detail-node:${key}`)}>{contentAllowedIds&&!contentAllowedIds.has(otherId)?'全体で表示：':''}{other?.label ?? '元の対象'}{other && architectureUsageContext(other) ? ` · ${architectureUsageContext(other)}` : ''}{other?.architecture?.identity ? ` · ${architectureEnvironmentLabel(other.architecture.environments)}` : ''}</button>; };
  const relationButton = (edge: SemanticEdge) => { const summary = architectureRelationSummary([edge]); return <button onClick={() => onSelectEdge(edge.id)} {...semanticFlowHoverBindings<HTMLButtonElement>(onHoverTarget, { kind: 'edge', id: edge.id }, `architecture-detail-edge:${edge.id}`)}>{architectureRelationLabel(edge)} · {summary.status} · {summary.sites}箇所{edge.details?.environment ? ` · ${edge.details.environment}` : ''}</button>; };
  const partnerDetails = (partner: ReturnType<typeof architecturePartners>[number]) => <>
    <p>{otherButton(partner.otherId, `partner-${partner.otherId}`)} を選択{!visible.nodes.some(item => item.id === partner.otherId) ? ' · 現在の階層では点を表示していない境界の相手' : ''}</p>
    {partner.relations.map(group => { const first = group.edges[0]!, summary = architectureRelationSummary(group.edges); return <div className="architecture-relation-group" key={JSON.stringify([group.direction, first.kind, first.details?.environment])} data-direction={group.direction}>
      <p className="architecture-relation-direction">{group.direction === 'incoming' ? '相手から選択中の構成へ' : group.direction === 'self' ? 'この粒度の自己関係' : '選択中の構成から相手へ'}</p>
      <strong>{architectureRelationLabel(first)}</strong><p className="architecture-relation-status">{summary.status} · {summary.sites}箇所{first.details?.environment ? ` · ${first.details.environment}` : ''}</p>
      {group.edges.some(item => boundary.includes(item)) && <p>構成全体の接続 · 内部の対応箇所は未確認</p>}
      <RelationEvidence edges={group.edges} sources={sources} />
      {!(contentAllowedIds&&!contentAllowedIds.has(partner.otherId))&&group.edges.map(item => <button key={item.id} onClick={() => onSelectEdge(item.id)} {...semanticFlowHoverBindings<HTMLButtonElement>(onHoverTarget, { kind: 'edge', id: item.id }, `architecture-partner-edge:${item.id}`)}>図で関係を選択{group.edges.length > 1 ? ` · ${architectureRelationSummary([item]).status}` : ''}</button>)}
    </div>; })}
  </>;
  const partnerEntry = (partner: ReturnType<typeof architecturePartners>[number]) => { const other = byId.get(partner.otherId), disambiguation = other?.architecture ? partnerDisplays.get(partner.otherId)?.disambiguation : undefined; return <div className="architecture-partner" data-partner-id={partner.otherId} key={partner.otherId}><Disclosure title={<span><strong>{other?.label ?? '元の対象'}</strong>{contentAllowedIds&&!contentAllowedIds.has(partner.otherId)&&<small>この表示範囲の外側</small>}{disambiguation && <small>{disambiguation}</small>}<small>{partner.description}／{partner.direction}</small></span>}>{() => partnerDetails(partner)}</Disclosure></div>; };
  const requestOrigin = node && (arch?.request || node.attributes.architectureRequestGroup) ? architectureRequestSources(Array.isArray(node.attributes.requestIds) ? node.attributes.requestIds.map(id => byId.get(id)) : [node], byId) : undefined;
  return <aside className="analyzer-detail-panel is-module-detail semantic-detail semantic-flow-detail architecture-detail" aria-label="構成の詳細">
    <div className="analyzer-detail-heading"><h3>{title}</h3><button type="button" aria-label="詳細を閉じる" onClick={onClose}>×</button></div>
    {node && arch && <>
      <p className="architecture-detail-kind"><strong>選択中</strong> · {architectureKindLabels[arch.kind]}</p>
      {node.attributes.providedContent && <p className="architecture-context-note">提供内容：{String(node.attributes.providedContent)}</p>}
      {arch.request && <section className="architecture-request-expression"><h4>記録された要求</h4><code>{publicUrlText(arch.request.expression ?? '式未記録')}</code><p>接続先未特定。式の実行・補完は行わず、記録されたコードを表示しています。</p>
        {node.attributes.requestCall && <p>確認した呼び出し：<code>{String(node.attributes.requestCall)}</code></p>}{node.attributes.resolutionReason && <p>{String(node.attributes.resolutionReason)}</p>}
        {node.evidence[0] && <p>{node.evidence[0].path}:{node.evidence[0].line} · 範囲 {node.evidence[0].start}–{node.evidence[0].end}</p>}
        {requestGroup && requestPartition && <><p>{visible.architectureView?.explicitNodeIds.includes(node.id) ? '明示展開による個別表示' : '選択中の一時表示。選択解除・別の選択で集合に戻ります。'}</p><p>元の要求 {requestPartition.originalIds.length}件 · 集合内 {requestPartition.groupedIds.length}件 · 個別表示 {requestPartition.individualIds.length}件</p><button onClick={() => onSelect(requestGroup.id)}>元の集合の内訳を見る</button></>}
      </section>}
      {architectureProviderExplanation(node) && <p className="architecture-context-note">{architectureProviderExplanation(node)}</p>}
      {outside && <p className="architecture-context-note">表示範囲外 · {visible.nodes.some(item => item.id === node.id) ? '周辺の構成として表示' : '現在の図には表示していません'}</p>}
      <dl className="analyzer-metadata-list architecture-summary">
        <div><dt>現在地との関係</dt><dd>{scopeRole === 'inside' ? '現在地の内部' : scopeRole === 'direct' ? '外側の接続相手' : scopeRole === 'surrounding' ? '周辺' : visible.architectureView?.scopeId ? '現在の図の外側' : 'プロジェクト全体'}</dd></div>
        <div><dt>種類</dt><dd>{arch.request ? '個別要求（接続先未特定）' : arch.kind === 'application' ? '論理アプリ・コード上の実行単位' : architectureKindLabels[arch.kind]}</dd></div>
        <div><dt>役割</dt><dd>{arch.request ? `${({ http: 'HTTP要求のコードを確認。接続先は未特定', process: '起動要求のコードを確認。起動先は未特定', auth: '認証SDKの使用・設定コードを確認。プロジェクトは未特定' })[arch.request.kind]}` : (arch.roles.length ? `${arch.roles.slice(0, 2).map(role => role.label).join(' / ')}${arch.roles.length > 2 ? ` ほか${arch.roles.length - 2}役割` : ''}（${arch.roles.every(role => role.confidence === 'source') ? 'ソース・設定で確認' : '推定を含む'}）` : arch.codeUsage ? 'コードを提供する構成。プロジェクト固有の担当は未判定' : '具体的な役割は未判定')}</dd></div>
        {requestOrigin ? <div><dt>要求元</dt><dd>{requestOrigin.label.replace(/^要求元：/, '')}<small className="architecture-count-note">要求を書いた側です。接続先の所属は未特定です。</small>{requestOrigin.sources.length > 1 && <Disclosure title="要求元の内訳">{() => <>{requestOrigin.sources.map(source => <p key={source.id}>{otherButton(source.id, `request-${source.id}`)}</p>)}{requestOrigin.unknown && <p>要求元未確認の要求も含みます。</p>}</>}</Disclosure>}</dd></div>
          : <div><dt>{!arch.parentId&&definition?.inherited?'定義元の構成':'所属'}</dt><dd>{!arch.parentId&&definition?.inherited ? definition.owner?.label??'名称未確認' : arch.parentId ? byId.get(arch.parentId)?.label : (arch.ownerPath !== undefined ? (arch.ownerPath.split('/').slice(-2).join('/') || 'プロジェクト直下') : '') || (['application', 'component', 'shared-code', 'code-package'].includes(arch.kind) ? 'プロジェクト' : '外部・設定上の対象')}</dd></div>}
        <div><dt>環境との対応</dt><dd>{architectureEnvironmentContext(node).label}</dd></div>
        {definition?.role && <div><dt>{definition.inherited?'定義元の構成の位置づけ':'この構成の位置づけ'}</dt><dd>{definition.inherited&&<strong>{definition.owner?.label??'所属する定義（名称未確認）'} · </strong>}{definition.role}</dd></div>}
        {definition?.path && <div><dt>定義元</dt><dd>{definition.shortPath}<small>{definition.location}</small></dd></div>}
      </dl>
      {contentMembership&&<section className="architecture-context-note" aria-label="表示内容への含まれ方"><strong>{contentMembership.label}</strong><p>{contentMembership.reason}</p>{contentMembership.source&&<small>{contentMembership.source}</small>}</section>}
      {node.attributes.unifiedFlow && <section className="architecture-context-note" aria-label="操作と対応の確認状態">
        <strong>{arch.kind === 'tool-operation' ? '操作の記述・実行未観測' : '設定上の対応・稼働未観測'}</strong>
        {arch.kind !== 'tool-operation' && node.attributes.configurationPath && <p>設定：<code>{String(node.attributes.configurationPath)}</code></p>}
        {node.attributes.entryDeclaration && <p>入口：<code>{String(node.attributes.entryDeclaration)}</code></p>}
        {node.attributes.assetDirectory && <p>アセットの指定：<code>{String(node.attributes.assetDirectory)}</code></p>}
        {node.attributes.command && <OperationCommand key={node.id} command={String(node.attributes.command)} />}
        <p>対象環境：{architectureEnvironmentContext(node).label}</p>{node.attributes.environmentSource && <small>{String(node.attributes.environmentSource)}</small>}
        <p>{arch.kind === 'tool-operation' ? '操作の実行場所' : '構成上の実行場所'}：{String(node.attributes.executionPlace ?? '未確認').replace('unconfirmed','未確認')}</p>
        {node.attributes.purpose === 'apply' && <p>対象リソースの指定：{node.attributes.targetPlace === 'local' ? 'local' : node.attributes.targetPlace === 'cloud' ? 'remote' : '指定未特定'}</p>}
        {arch.kind === 'tool-operation' && <div><strong>操作対象</strong>{operationTargets.map(target => <p key={target.id}>{otherButton(target.id, 'operation-target')}</p>)}{!operationTargets.length && <p>対応先未特定</p>}<p>{architectureUsageContext(node)}</p><p>作業ディレクトリ：<code>{String(node.attributes.workingDirectory ?? arch.ownerPath ?? '未特定')}</code></p>{node.attributes.configurationPath && <p>設定：<code>{String(node.attributes.configurationPath)}</code></p>}</div>}
        {typeof node.attributes.logicalOwnerId === 'string' && <p>{node.attributes.logicalAssociation==='owner'?'定義を所有する構成':'対応する論理定義'}：{otherButton(node.attributes.logicalOwnerId, 'logical-owner')}</p>}
        {node.attributes.resolution && <p>{String(node.attributes.resolution)}</p>}
        {node.attributes.configurationStatus && <p>設定の状態：{String(node.attributes.configurationStatus)}</p>}
        {node.attributes.inputRoot && <p>入力root：<code>{String(node.attributes.inputRoot)}</code></p>}
        {node.attributes.outputPath && <p>確認できた出力：<code>{String(node.attributes.outputPath)}</code></p>}
        {node.attributes.targetResolution && <p>論理アプリとの対応：{String(node.attributes.targetResolution)}</p>}
        {node.attributes.artifactState && <p>{String(node.attributes.artifactState)}</p>}
      </section>}
      <section className="architecture-summary-partners" aria-label="構成上の相手"><strong>構成上の相手 · {peerSummary.known.length}相手</strong>{peerSummary.known.slice(0,knownLimit).map(partnerEntry)}{peerSummary.known.length>knownLimit&&<button onClick={()=>setKnownLimit(n=>n+20)}>残りの構成上の相手を見る（{peerSummary.known.length-knownLimit}）</button>}{!peerSummary.known.length&&<p>現在の表示条件で、構成上の相手はありません。</p>}</section>
      {peerSummary.unresolved.length>0&&<section className="architecture-summary-partners" aria-label="接続先が未特定の要求"><strong>接続先が未特定の要求</strong><p>未特定対象 {peerSummary.targets}件 · 表示集合 {peerSummary.groups}件 · ソース {peerSummary.sites}箇所</p><small>表示集合は、同一サービスとして確認したものではありません。</small>{peerSummary.unresolved.slice(0,unknownLimit).map(partnerEntry)}{peerSummary.unresolved.length>unknownLimit&&<button onClick={()=>setUnknownLimit(n=>n+20)}>未特定要求の残りの内訳を見る（{peerSummary.unresolved.length-unknownLimit}項目）</button>}</section>}
      {(canOpen ? canOpen(node.id) : children.length > 0) && <button className="architecture-open-action" onClick={() => onOpen(node.id)}>{outside ? 'この構成を開く' : '内部を開く'}</button>}
      <Disclosure title="専門Viewで調べる">{() => <><SemanticLinks analysis={analysis} node={node} onJump={onJump} /><ArchitectureExpertLinks node={node} store={store} /></>}</Disclosure>
      <Disclosure title={`内部の構成 · 全${children.length}要素 / 表示条件内の関係 ${architectureRelationCounts(internal).records}件`}>{() => <>
        <p>全構成の内訳（補助コードを含む）: {children.length}内部構成要素 · {arch.files.length}固有ファイル · {arch.memberIds.length}下位解析対象</p>
        {children.map(child => <p key={child.id}>{child.label}{child.architecture?.auxiliary ? ' · 補助コード' : ''} · {contentAllowedIds&&!contentAllowedIds.has(child.id)?<><small>この表示範囲の外側</small><button onClick={()=>onShowAll?.(child.id)}>全体で表示</button></>:<button onClick={() => onReveal(child.id)}>この要素へ移動</button>}</p>)}
        {internal.length > 0 && <><p>現在の表示条件で同じ構成要素に収まる関係です。下位の再帰も含み、構成全体の自己通信を意味しません。</p>{internal.map(e => <p key={e.id}>{relationButton(e)}</p>)}</>}
        <Disclosure title="構成ファイル一覧">{() => arch.files.map(path => <p key={path}><code>{path}</code></p>)}</Disclosure>
      </>}</Disclosure>
      <Disclosure title={`つながる相手 · 構成 ${peerSummary.known.length}相手 / 未特定 ${peerSummary.targets}対象`}>{() => <>
        <p>現在の環境・補助コードなどの表示条件を適用。内部関係は別欄です。構成全体の境界接続は内部の対応箇所を確認できていません。</p>
        {partners.slice(0, relationLimit).map(partnerEntry)}{partners.length > relationLimit && <button onClick={() => setRelationLimit(relationLimit + 30)}>相手をさらに表示</button>}
      </>}</Disclosure>
      <Disclosure title={`技術の宣言・参照 · ${arch.technologies?.length ?? arch.technologyNames.length}件`}>{() => <>
        <p>パッケージの依存区分だけでは、この実行主体で動く技術と確定しません。</p>
        {(['source', 'support', 'configuration', 'declared'] as const).map(usage => { const items = arch.technologies?.filter(item => item.usage === usage) ?? []; return items.length ? <section key={usage}><h4>{({ source: 'この構成でソース参照を確認', support: '開発・型・ビルド・テストの支援', configuration: '構成設定から確認', declared: '宣言あり・この構成での使用は未確認' })[usage]}</h4>{items.map(item => <Disclosure key={item.name} title={<TechnologyLinks name={item.name} />}>{() => <><p>{item.reason}</p>{item.declarations.map((declaration, index) => <p key={index}>{declaration.section} · <code>{declaration.path}</code></p>)}<EvidenceList evidence={uniqueArchitectureEvidence([...item.evidence, ...item.declarations.flatMap(d => d.evidence)])} sources={sources} /></>}</Disclosure>)}</section> : null; })}
      </>}</Disclosure>
      <Disclosure title="分類・同一性の判定理由">{() => <>
        {definition?.path&&<><h4>完全な定義パス</h4><DefinitionPath path={definition.path}/><p>{String(node.attributes.definitionLocation)}</p></>}
        {definition?.role&&<><h4>{definition.inherited?`定義元の構成の位置づけ：${definition.owner?.label??'名称未確認'}`:'この構成の位置づけ'}</h4><p>{definition.role}</p><p>{String(node.attributes.compositionReason??'判定理由未記録')}</p><p>根拠：<code>{String(node.attributes.compositionEvidencePath??'未記録')}</code></p></>}
        {Array.isArray(node.attributes.definitionWorkspace)&&node.attributes.definitionWorkspace.length>0&&<><h4>workspace所属の根拠</h4>{node.attributes.definitionWorkspace.map(path=><p key={path}><code>{path}</code></p>)}<p>workspaceへの所属確認と、主要／補助の用途判定は別です。</p></>}
        {arch.ownerPath!==undefined&&<p>完全な所属パス：<code>{arch.ownerPath||'プロジェクト直下'}</code></p>}
        {architectureEnvironmentContext(node).meaning==='definition'&&<p>コード上の定義です。全環境での共通利用・稼働を確認した意味ではありません。</p>}
        <p>構成の確認状態: {confidenceLabels[node.confidence]}。役割・接続先の特定とは別に扱います。</p>
        {arch.roles.map((role, index) => <p key={index}><strong>{role.label}</strong> · {confidenceLabels[role.confidence]}<br />{role.reason}</p>)}
        {arch.codeUsage && <><p>{arch.codeUsage.reason}</p><p>確認した利用元: {arch.codeUsage.consumerIds.length}構成要素（全構成）。現在の表示範囲には出ていない利用元も含みます。</p>{arch.codeUsage.consumerIds.map(id => <p key={id}>{otherButton(id, `consumer-${id}`)}</p>)}<EvidenceList evidence={[...arch.codeUsage.declarationEvidence, ...arch.codeUsage.sourceEvidence]} sources={sources} /></>}
        {arch.identity && <><p>同一性: {arch.identity.status === 'confirmed' ? '識別情報から対応を確認' : '未確認'}</p><p>{arch.identity.reason}</p>{arch.identity.identifier && <p>識別子: <code>{arch.identity.identifier}</code></p>}{arch.identity.scope && <p>設定範囲: <code>{arch.identity.scope}</code></p>}</>}
        <small>ソースと設定から確認した構成です。現在の稼働は観測していません。</small>
      </>}</Disclosure>
      <Disclosure title="実行・配信・接続">{() => <>
        <section data-architecture-settings="entries"><h4>確認した入口の宣言：{arch.entryPaths.length}件</h4>{arch.entryPaths.map(path => <p key={path}><code>{path}</code></p>)}{!arch.entryPaths.length && <p>この解析範囲では入口宣言を確認していません。</p>}</section>
        {arch.configurationVariants !== undefined && <section data-architecture-settings="variants"><h4>実行・配信の設定宣言：{arch.configurationVariants.length}件</h4>{arch.configurationVariants.map(variant => <div key={variant.environment}><p>{variant.environment || '既定設定'}: 名前の宣言 {variant.name || '未指定'}<br />入口 {variant.entryPath || '宣言なし（提供内容は設定から別途確認）'}{variant.inherited.length > 0 && <small>上位の宣言を参照: {variant.inherited.join(', ')}。配備名は未観測</small>}</p><EvidenceList evidence={variant.evidence} sources={sources} /></div>)}</section>}
        {arch.identity?.configurations !== undefined && <section data-architecture-settings="connections"><h4>接続先の設定：{arch.identity.configurations.length}件</h4>{arch.identity.configurations.map(setting => <Disclosure key={setting.id} title={`${setting.environment || '既定設定'} · ${setting.binding || setting.name || '対象設定'}`}>
          {() => <><p>設定ファイル: <code>{setting.path}</code></p><p>名前: {setting.name || '未指定'} · 識別子: <code>{setting.identifier || '未指定'}</code></p><EvidenceList evidence={setting.evidence} sources={sources} /></>}</Disclosure>)}</section>}
        {arch.configurationVariants === undefined && arch.identity?.configurations === undefined && <p data-architecture-settings="unknown">配信・接続の設定情報は、この構成の解析結果には記録されていません。設定が存在しないと確認した0件とは区別します。</p>}
      </>}</Disclosure>
      {arch.request && <Disclosure title="確認した要求式・箇所">{() => <><p>要求や設定のコードを確認しています。同じ相手への実行回数ではありません。</p><pre>{arch.request!.expression}</pre><code>{arch.request!.sourceId}</code></>}</Disclosure>}
    </>}
    {edge && <>
      <p className="architecture-detail-kind"><strong>選択中の関係</strong></p>
      <p>{otherButton(edge.source, 'source')} から {otherButton(edge.target, 'target')} へ</p>
      <p>{architectureRelationSummary([edge]).status} · {architectureRelationSummary([edge]).sites}箇所 · {edge.details?.environment || '対象環境の指定なし'}</p>
      {edge.details?.architectureRelation === 'internal' && <p>表示上は一つの構成要素に収まる内部関係です。アプリ全体の自己通信を示しません。</p>}
      {edge.details?.architectureRelation === 'self' && <p>現在の構成粒度で確認した自己関係です。</p>}
      <RelationEvidence edges={[edge]} sources={sources} />
    </>}
    {node && !edge && <Disclosure title="元の根拠・Evidence">{() => <NodeEvidence node={node} sources={sources} />}</Disclosure>}
    <Disclosure title="内部メタデータ">{() => <pre>{JSON.stringify(node ? { id: node.id, attributes: node.attributes } : { id: edge?.id, kind: edge?.kind }, null, 2)}</pre>}</Disclosure>
  </aside>;
}
