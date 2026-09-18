import { architectureRequestTitle } from './architectureRequestPresentation';
import { useLayoutEffect, useRef } from 'react';
import { explorerBreadcrumbs, type SemanticExplorerModel } from '../../analyzer/semantic/semanticExplorer';
import type { SemanticEdge, SemanticGraph } from '../../analyzer/semantic/types';
import { architectureRelationCounts, architectureRelationLabel } from '../../analyzer/semantic/architectureRelations';
import type { SemanticExplorerNavigationActions } from './SemanticExplorerNavigation';
import { AnalyzerBreadcrumb } from './AnalyzerBreadcrumb';
import { architectureUsageContext } from '../../analyzer/semantic/architectureContext';

export function ArchitectureNavigation({ explorer, navigation, graph, selectedId, selectedEdgeId, onSelectEdge, relationHint, temporaryRelation=false, mode }: { explorer: SemanticExplorerModel; navigation: SemanticExplorerNavigationActions; graph: SemanticGraph; selectedId?: string; selectedEdgeId?: string; onSelectEdge?: (id: string) => void; relationHint?: SemanticEdge; temporaryRelation?:boolean; mode: '2d' | '3d' }) {
  const scopeId = navigation.location.scopeId, selected = graph.nodes.find(n => n.id === selectedId) ?? (selectedId ? explorer.nodes.get(selectedId) : undefined);
  const selectedGroup = graph.architectureView?.requestGroups.find(group => group.id === selectedId);
  const outside = Boolean(selected && scopeId !== 'project' && !graph.architectureView?.detailIds.includes(selected.id));
  const hasChildren = selected && navigation.canOpenScope?.(selected.id);
  const projection = graph.architectureView, relation = relationHint ?? graph.edges.find(edge => edge.id === selectedEdgeId);
  const endpoint = (id:string) => { const node=graph.nodes.find(n=>n.id===id)??explorer.nodes.get(id);return node?`${node.label}${architectureUsageContext(node)?`（${architectureUsageContext(node)}）`:''}`:'表示集合（内訳は関係の詳細）'; };
  const items = explorerBreadcrumbs(explorer, { ...navigation.location, centerId: undefined });
  const current = items.at(-1), currentElement = useRef<HTMLSpanElement>(null), previousScope = useRef(scopeId);
  useLayoutEffect(() => { if (previousScope.current !== scopeId) currentElement.current?.focus({ preventScroll: true }); previousScope.current = scopeId; }, [scopeId]);
  const label = (item: typeof items[number]) => item.id === 'project' ? `プロジェクト（${navigation.projectLabel || '名称未確認'}）` : item.label;
  const explanation = scopeId === 'project' ? navigation.contentLabel?`プロジェクト内の「${navigation.contentLabel}」を表示`:'プロジェクト全体の構成を表示'
    : mode === '3d' && navigation.surroundings !== false ? `${current?.label ?? '現在地'}の内部構成＋外側の概要を表示`
      : projection?.contextIds.length ? `${current?.label ?? '現在地'}の内部構成＋直接の相手を表示` : `${current?.label ?? '現在地'}の内部構成を表示`;
  return <div className="semantic-explorer-navigation architecture-navigation">
    <div className="architecture-navigation-row"><div className="semantic-explorer-history" role="group" aria-label="階層の移動">
      <button type="button" onClick={navigation.onBack} disabled={!navigation.canBack}>戻る</button><button type="button" onClick={navigation.onParent} disabled={scopeId === 'project'}>親へ</button><button type="button" onClick={navigation.onProject} disabled={scopeId === 'project'}>プロジェクトへ</button>
    </div><AnalyzerBreadcrumb items={items.map(item => ({ id: item.id, label: label(item) }))} label="構成図の現在地" currentRef={currentElement} onOpen={navigation.onOpenScope} /></div>
    {!navigation.contentLabel&&<p className="architecture-scope-description">{explanation}</p>}
    {!navigation.contentLabel&&<div className="semantic-explorer-caption"><span>{navigation.contentLabel ? '現在の階層・条件：' : ''}{projection?.scopeId ? `内部 ${projection.detailEntityCount} / 外側 ${projection.contextEntityCount}構成要素` : `${projection?.detailEntityCount ?? graph.nodes.length}構成要素`}{projection?.requestCount ? ` · 未特定要求 ${projection.requestCount}対象` : ''} · 表示線 {graph.edges.length}本{projection?.internalRecordCount ? ` · 内部で要約 ${projection.internalRecordCount}関係` : ''}</span><small>{relation ? <span role="status">{architectureRelationLabel(relation)} · ソース上の {architectureRelationCounts([relation]).sites}箇所</span> : '線はソース・設定上の関係'}</small></div>}
    {relation && <div className="architecture-relation-readout" role="status">{graph.nodes.some(n=>n.attributes.simpleOverview)&&<small>{temporaryRelation?`一時確認中の関係（ホバー／フォーカス）${selected?` · 選択中：${selected.label}`:''}`:'選択中の関係'}</small>}<span>{endpoint(relation.source)}</span><strong> → {architectureRelationLabel(relation)} → </strong><span>{endpoint(relation.target)}</span>{relation.details?.structural&&<small>構造上の対応。通信・実行順ではありません。</small>}</div>}
    {!navigation.contentLabel&&projection?.requestGroups.length ? <small className="architecture-count-note">未特定の要求を含む対象数です。表示集合は実体数に加算しません。</small> : null}
    {projection?.boundaryRelations.length ? <details className="architecture-boundary-relations"><summary>構成全体の接続 · {projection.boundaryRelations.length}件（内部の対応箇所は未特定）</summary><div>{projection.boundaryRelations.map(edge => <button key={edge.id} onClick={() => onSelectEdge?.(edge.id)}>{explorer.nodes.get(edge.source)?.label} → {explorer.nodes.get(edge.target)?.label} · {architectureRelationLabel(edge)}{edge.details?.environment ? ` · ${edge.details.environment}` : ''}</button>)}</div></details> : null}
    {!navigation.contentLabel&&graph.nodes.some(node => node.attributes.unifiedFlow) && <p className="architecture-context-note">表示内訳：操作 {graph.nodes.filter(node => node.architecture?.kind === 'tool-operation').length} · 成果物 {graph.nodes.filter(node => node.architecture?.kind === 'artifact').length} · 実行構成 {graph.nodes.filter(node => node.architecture?.kind === 'execution-config').length}。上の対象数に含まれます。線は意味上の対応で、実行順・稼働の観測ではありません。</p>}
    {selectedGroup && <div className="semantic-explorer-selection"><span>選択中：{selectedGroup.label} · 表示上の集合</span></div>}
    {selected && !selectedGroup && <div className="semantic-explorer-selection"><span>選択中：{architectureRequestTitle(selected)}{outside ? '（現在の範囲の外側）' : ''}</span><div className="semantic-explorer-selection-actions">{hasChildren && <button type="button" onClick={() => navigation.onOpenScope(selected.id)}>{outside ? 'この構成を開く' : '内部を開く'}</button>}<button type="button" onClick={() => navigation.onJumpMode(mode === '2d' ? '3d' : '2d', selected.id)}>{mode === '2d' ? '3D上で位置を見る' : '2Dで詳しく見る'}</button></div></div>}
  </div>;
}
