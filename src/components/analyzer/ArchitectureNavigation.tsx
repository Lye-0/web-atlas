import { useLayoutEffect, useRef } from 'react';
import { explorerBreadcrumbs, type SemanticExplorerModel } from '../../analyzer/semantic/semanticExplorer';
import type { SemanticEdge, SemanticGraph } from '../../analyzer/semantic/types';
import { architectureRelationCounts, architectureRelationLabel } from '../../analyzer/semantic/architectureRelations';
import type { SemanticExplorerNavigationActions } from './SemanticExplorerNavigation';
import './architecture-navigation.css';

export function ArchitectureNavigation({ explorer, navigation, graph, selectedId, selectedEdgeId, onSelectEdge, relationHint, mode }: { explorer: SemanticExplorerModel; navigation: SemanticExplorerNavigationActions; graph: SemanticGraph; selectedId?: string; selectedEdgeId?: string; onSelectEdge?: (id: string) => void; relationHint?: SemanticEdge; mode: '2d' | '3d' }) {
  const scopeId = navigation.location.scopeId, selected = graph.nodes.find(n => n.id === selectedId);
  const hasChildren = selected && navigation.canOpenScope?.(selected.id);
  const projection = graph.architectureView, relation = graph.edges.find(edge => edge.id === selectedEdgeId) ?? relationHint;
  const items = explorerBreadcrumbs(explorer, { ...navigation.location, centerId: undefined });
  const middle = items.slice(1, -1), current = items.at(-1), currentElement = useRef<HTMLSpanElement>(null), previousScope = useRef(scopeId);
  useLayoutEffect(() => { if (previousScope.current !== scopeId) currentElement.current?.focus({ preventScroll: true }); previousScope.current = scopeId; }, [scopeId]);
  const label = (item: typeof items[number]) => item.id === 'project' ? `プロジェクト（${navigation.projectLabel || '名称未確認'}）` : item.label;
  const currentLabel = current ? label(current) : 'プロジェクト';
  const explanation = scopeId === 'project' ? 'プロジェクト全体の構成を表示'
    : mode === '3d' && navigation.surroundings !== false ? `${current?.label ?? '現在地'}の内部構成＋外側の概要を表示`
      : projection?.contextIds.length ? `${current?.label ?? '現在地'}の内部構成＋直接の相手を表示` : `${current?.label ?? '現在地'}の内部構成を表示`;
  return <div className="semantic-explorer-navigation architecture-navigation">
    <div className="architecture-navigation-row"><div className="semantic-explorer-history" role="group" aria-label="階層の移動">
      <button type="button" onClick={navigation.onBack} disabled={!navigation.canBack}>戻る</button><button type="button" onClick={navigation.onParent} disabled={scopeId === 'project'}>親へ</button><button type="button" onClick={navigation.onProject} disabled={scopeId === 'project'}>プロジェクトへ</button>
    </div><nav className={`architecture-location${items.length > 4 ? ' is-deep' : ''}`} aria-label="構成図の現在地"><span className="architecture-location-caption">現在地：</span><ol>
      {items.length > 1 && <li><button type="button" onClick={() => navigation.onOpenScope(items[0]!.id)}>{label(items[0]!)}</button></li>}
      {middle.map(item => <li className="architecture-ancestor-expanded" key={item.id}><span className="architecture-breadcrumb-separator" aria-hidden="true">›</span><button type="button" onClick={() => navigation.onOpenScope(item.id)}>{label(item)}</button></li>)}
      {middle.length > 0 && <li className="architecture-ancestor-collapsed"><span className="architecture-breadcrumb-separator" aria-hidden="true">›</span><details><summary aria-label="中間の祖先を選ぶ">…</summary><ul>{middle.map(item => <li key={item.id}><button type="button" onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); navigation.onOpenScope(item.id); }}>{label(item)}</button></li>)}</ul></details></li>}
      <li>{items.length > 1 && <span className="architecture-breadcrumb-separator" aria-hidden="true">›</span>}<span ref={currentElement} className="architecture-current-location" aria-current="page" tabIndex={-1}>{currentLabel}</span></li>
    </ol></nav></div>
    <p className="architecture-scope-description">{explanation}</p>
    <div className="semantic-explorer-caption"><span>{projection?.scopeId ? `内部 ${projection.detailEntityCount} / 外側 ${projection.contextEntityCount}構成要素` : `${projection?.detailEntityCount ?? graph.nodes.length}構成要素`}{projection?.requestCount ? ` · 未特定要求 ${projection.requestCount}対象` : ''} · 表示線 {graph.edges.length}本{projection?.internalRecordCount ? ` · 内部で要約 ${projection.internalRecordCount}関係` : ''}</span><small>{relation ? <span role="status">{architectureRelationLabel(relation)} · ソース上の {architectureRelationCounts([relation]).sites}箇所</span> : '線はソース・設定上の関係'}</small></div>
    {projection?.requestGroups.length ? <small className="architecture-count-note">未特定の要求を含む対象数です。表示集合は実体数に加算しません。</small> : null}
    {projection?.boundaryRelations.length ? <details className="architecture-boundary-relations"><summary>構成全体の接続 · {projection.boundaryRelations.length}件（内部の対応箇所は未特定）</summary><div>{projection.boundaryRelations.map(edge => <button key={edge.id} onClick={() => onSelectEdge?.(edge.id)}>{explorer.nodes.get(edge.source)?.label} → {explorer.nodes.get(edge.target)?.label} · {architectureRelationLabel(edge)}{edge.details?.environment ? ` · ${edge.details.environment}` : ''}</button>)}</div></details> : null}
    {selected && !selected.attributes.architectureRequestGroup && <div className="semantic-explorer-selection"><span>選択中：{selected.label}{selected.attributes.architectureContext ? '（現在の範囲の外側）' : ''}</span><div className="semantic-explorer-selection-actions">{hasChildren && <button type="button" onClick={() => navigation.onOpenScope(selected.id)}>{selected.attributes.architectureContext ? 'この構成を開く' : '内部を開く'}</button>}<button type="button" onClick={() => navigation.onJumpMode(mode === '2d' ? '3d' : '2d', selected.id)}>{mode === '2d' ? '3D上で位置を見る' : '2Dで詳しく見る'}</button></div></div>}
  </div>;
}
