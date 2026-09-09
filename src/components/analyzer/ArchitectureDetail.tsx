import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AnalyzerProjectStore } from '../../analyzer';
import { stacks } from '../../data/stacks';
import { stackPath } from '../../utils/routes';
import { ArchitectureExpertLinks } from './ArchitectureExpertLinks';
import { projectSemanticView } from '../../analyzer/semantic/project';
import { semanticNavigationContext } from '../../analyzer/semantic/navigation';
import type { SemanticAnalysis } from '../../analyzer/semantic/types';
import type { SemanticEdge, SemanticGraph, SemanticNode, SemanticViewId } from '../../analyzer/semantic/types';
import { confidenceLabels } from '../../analyzer/semantic/types';
import { uniqueArchitectureEvidence } from '../../analyzer/semantic/architectureEvidence';
import { semanticFlowHoverBindings } from './semanticFlowHoverBindings';
import type { SemanticFlowHoverHandler } from '../../analyzer/semantic/flowRelationInteraction';
import { semanticRelationLabel } from './semanticFlowLanguage';

const architectureKindLabels = { application: 'アプリ・実行単位', component: '内部コンポーネント', 'shared-code': '共有コード', resource: 'リソース', 'external-service': '外部サービス', 'external-program': '外部プログラム', unresolved: '未解決の接続先' };
function SemanticLinks({ analysis, node, onJump }: { analysis: SemanticAnalysis; node: SemanticNode; onJump: (id: string, view: SemanticViewId) => void }) {
  const links = useMemo(() => (['runtime-flow', 'function-call-flow', 'data-flow', 'data-model'] as const).map(view => ({ view, count: semanticNavigationContext(projectSemanticView(analysis, view), node).members?.length ?? 0 })), [analysis, node]);
  return <>{links.map(({ view, count }) => <p key={view}><button disabled={!count} title={count ? `${count}件の所属対象を範囲にして開く` : 'このViewに対応する下位の解析対象がありません'} onClick={() => onJump(node.id, view)}>{({ 'runtime-flow': 'Runtime Flow', 'function-call-flow': 'Function Call Flow', 'data-flow': 'Data Flow', 'data-model': 'Data Model' })[view]}</button> · {count}対象</p>)}</>;
}
export function ArchitectureDetail({ node, edge, graph, visible, sources, store, analysis, onOpen, onSelect, onSelectEdge, onJump, onClose, onHoverTarget }: {
  node?: SemanticNode; edge?: SemanticEdge; graph: SemanticGraph; visible: SemanticGraph; sources: Record<string, string>;
  store: AnalyzerProjectStore; analysis: SemanticAnalysis;
  onOpen: (id: string) => void; onSelect: (id: string) => void; onSelectEdge: (id: string) => void; onClose: () => void;
  onJump: (id: string, view: SemanticViewId) => void; onHoverTarget?: SemanticFlowHoverHandler;
}) {
  const [evidenceLimit, setEvidenceLimit] = useState(5), [relationLimit, setRelationLimit] = useState(20), [expertOpen, setExpertOpen] = useState(false), [identifiersOpen, setIdentifiersOpen] = useState(false);
  const arch = node?.architecture, children = graph.nodes.filter(n => n.architecture?.parentId === node?.id);
  const byId = useMemo(() => new Map(graph.nodes.map(n => [n.id, n])), [graph.nodes]);
  const relations = visible.edges.filter(e => e.source === node?.id || e.target === node?.id);
  const evidence = useMemo(() => uniqueArchitectureEvidence(edge?.evidence ?? [...node?.evidence ?? [], ...node?.architecture?.roles.flatMap(role => role.evidence) ?? [], ...node?.architecture?.configurationVariants?.flatMap(variant => variant.evidence) ?? []]), [edge, node]);
  const sites = new Set(evidence.map(item => JSON.stringify([item.path, item.start, item.end]))).size;
  const originalIds = new Set(relations.flatMap(e => (e.provenance?.edges ?? [e]).map(r => r.id)));
  const title = node?.label ?? (edge ? `${byId.get(edge.source)?.label ?? edge.source} → ${byId.get(edge.target)?.label ?? edge.target}` : '構成の詳細');
  return <aside className="analyzer-detail-panel is-module-detail semantic-detail semantic-flow-detail" aria-label="構成の詳細">
    <div className="analyzer-detail-heading"><h3>{title}</h3><button type="button" aria-label="詳細を閉じる" onClick={onClose}>×</button></div>
    {node && arch && <>
      <p>{architectureKindLabels[arch.kind]} · 実体: {confidenceLabels[node.confidence]}</p>
      {node.attributes.architectureContext && <p>この範囲の外部 · 関係の文脈として表示</p>}
      <dl className="analyzer-metadata-list"><div><dt>所属</dt><dd>{arch.parentId ? byId.get(arch.parentId)?.label : arch.ownerPath || (['application', 'component', 'shared-code'].includes(arch.kind) ? 'プロジェクト' : '外部・設定上の対象')}</dd></div></dl>
      <details className="analyzer-detail-accordion" open><summary>役割と根拠</summary><div className="analyzer-detail-accordion-body">{arch.roles.length ? arch.roles.map((role, index) => <p key={index}><strong>{role.label}</strong> · {confidenceLabels[role.confidence]}<br />{role.reason}</p>) : <p>{node.evidence[0]?.description ?? '具体的な役割は未判定です'}</p>}</div></details>
      <details className="analyzer-detail-accordion" open><summary>実行・配信の設定</summary><div className="analyzer-detail-accordion-body"><p>{arch.context.join(' / ') || '実行先未判定'}</p><p>環境: {arch.environments.filter(e => !e.startsWith('except:')).join(', ') || '共通・未指定'}</p>{arch.entryPaths.map(path => <p key={path}>入口の宣言: <code>{path}</code></p>)}{arch.configurationVariants?.map(variant => <p key={variant.environment}>{variant.environment || '既定設定'}: 名前の宣言 {variant.name || '未指定'}<br />入口 {variant.entryPath || '未指定（静的配信など）'}{variant.inherited.length > 0 && <small>上位の宣言を参照: {variant.inherited.join(', ')}。環境別の配備名は未観測</small>}</p>)}<small>ソース・設定から確認した構成です。現在の稼働は観測していません。</small></div></details>
      <details className="analyzer-detail-accordion" open><summary>{['application', 'component', 'shared-code'].includes(arch.kind) ? '含まれる対象' : '関連する元対象'}</summary><div className="analyzer-detail-accordion-body"><p>全構成の合計（補助コードを含む）: {children.length}内部構成要素 · {arch.files.length}固有ファイル · {arch.memberIds.length}下位解析対象</p>{children.length > 0 && <button onClick={() => onOpen(node.id)}>内部を開く</button>}<details><summary>ファイル一覧</summary>{arch.files.map(path => <p key={path}><code>{path}</code></p>)}</details></div></details>
      {(['outgoing', 'incoming'] as const).map(direction => {
        const items = relations.filter(e => direction === 'outgoing' ? e.source === node.id : e.target === node.id);
        return <details key={direction} className="analyzer-detail-accordion" open><summary data-direction={direction === 'outgoing' ? 'imports' : 'imported-by'}>{direction === 'outgoing' ? '出る関係' : '入る関係'} · 表示範囲 {items.length}本</summary><div className="analyzer-detail-accordion-body">{items.slice(0, relationLimit).map(e => <p key={e.id}>
          <button onClick={() => onSelect(direction === 'outgoing' ? e.target : e.source)} {...semanticFlowHoverBindings<HTMLButtonElement>(onHoverTarget, { kind: 'node', id: direction === 'outgoing' ? e.target : e.source }, `architecture-detail-node:${e.id}`)}>{byId.get(direction === 'outgoing' ? e.target : e.source)?.label}</button><br />
          <button onClick={() => onSelectEdge(e.id)} {...semanticFlowHoverBindings<HTMLButtonElement>(onHoverTarget, { kind: 'edge', id: e.id }, `architecture-detail-edge:${e.id}`)}>{semanticRelationLabel(e)} · {confidenceLabels[e.confidence]} · 元関係 {(e.provenance?.edges ?? [e]).length}件{e.details?.environment ? ` · ${e.details.environment}` : ''}</button></p>)}{items.length > relationLimit && <button onClick={() => setRelationLimit(relationLimit + 30)}>関係をさらに表示</button>}</div></details>;
      })}
      <p>表示範囲の固有元関係: {originalIds.size}件。環境・補助コードなどのフィルターを適用した範囲です。</p>
      <details className="analyzer-detail-accordion"><summary>採用技術 · {arch.technologyNames.length}</summary><div className="analyzer-detail-accordion-body">{arch.technologyNames.map(name => { const exact = stacks.find(stack => stack.id === name); const entries = exact ? [exact] : stacks.filter(stack => stack.packageNames?.includes(name)); return <p key={name}>{name}{entries.map(entry => <span key={entry.id}> · <Link to={stackPath(entry.id)}>{entry.name}</Link></span>)}</p>; })}</div></details>
      <details className="analyzer-detail-accordion" onToggle={event => setExpertOpen(event.currentTarget.open)}><summary>専門Viewで調べる</summary>{expertOpen && <div className="analyzer-detail-accordion-body"><SemanticLinks analysis={analysis} node={node} onJump={onJump} /><ArchitectureExpertLinks node={node} store={store} /></div>}</details>
    </>}
    {edge && <><p>{semanticRelationLabel(edge)} · {confidenceLabels[edge.confidence]}</p><p>{edge.details?.environment ? `環境: ${edge.details.environment}` : '共通・環境未指定'}</p><p>矢印は上記の元から先への関係です。集約線の連続は、一連の実行経路を保証しません。</p><details className="analyzer-detail-accordion" open><summary>元の関係 · {(edge.provenance?.edges ?? [edge]).length}件</summary><div className="analyzer-detail-accordion-body">{(edge.provenance?.edges ?? [edge]).slice(0, relationLimit).map(original => <p key={original.id}>{original.label} · {original.kind} · {confidenceLabels[original.confidence]}<details><summary>元の対象ID</summary><code>{original.source} → {original.target}</code></details></p>)}{(edge.provenance?.edges.length ?? 0) > relationLimit && <button onClick={() => setRelationLimit(relationLimit + 30)}>元関係をさらに表示</button>}</div></details></>}
    <details className="analyzer-detail-accordion" open><summary>Evidence · {evidence.length}件 / {sites}固有箇所</summary><div className="analyzer-detail-accordion-body">{evidence.slice(0, evidenceLimit).map((item, index) => <details key={index}><summary>{item.path}:{item.line} · {item.description}</summary><pre>{sources[item.path]?.split('\n').slice(Math.max(0, item.line - 2), Math.min(item.endLine + 2, item.line + 15)).map((line, i) => `${Math.max(1, item.line - 1) + i}  ${line}`).join('\n') ?? '読み込まれたソースがありません'}</pre></details>)}{evidence.length > evidenceLimit && <button onClick={() => setEvidenceLimit(evidenceLimit + 15)}>根拠をさらに表示</button>}</div></details>
    <details className="analyzer-detail-accordion" onToggle={event => setIdentifiersOpen(event.currentTarget.open)}><summary>解析上の識別情報</summary>{identifiersOpen && <pre>{JSON.stringify(node ? { id: node.id, attributes: node.attributes } : { id: edge?.id, kind: edge?.kind }, null, 2)}</pre>}</details>
  </aside>;
}
