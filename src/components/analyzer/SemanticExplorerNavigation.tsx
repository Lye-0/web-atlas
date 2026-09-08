import { useMemo } from 'react';
import { explorerBreadcrumbs, explorerChildren, explorerEdgeVisible, explorerRegionIdentity, type ExplorerLocation, type SemanticExplorerModel } from '../../analyzer/semantic/semanticExplorer';
import type { SemanticGraph } from '../../analyzer/semantic/types';
import { semanticRelationLabel } from './semanticFlowLanguage';
import { semanticNodeDisplay } from './semanticFlowDisplay';

export interface SemanticExplorerNavigationActions {
  location: ExplorerLocation; visitId: string; scrollTop: number; canBack: boolean;
  onBack: () => void; onParent: () => void; onProject: () => void; onOpenScope: (id: string) => void; onOpenNode: (id: string) => void;
  onCenter: (id: string) => void; onDefinition: (id: string) => void; onJumpMode: (mode: '2d' | '3d', id: string) => void;
  onDepth: (depth: number) => void; onScroll: (top: number) => void; onRevealSelection: () => void;
}

export function SemanticExplorerNavigation({ explorer, navigation, mode, graph, localGraph, selectedIds, selectedEdgeId }: {
  explorer: SemanticExplorerModel; navigation: SemanticExplorerNavigationActions; mode: '2d' | '3d'; graph: SemanticGraph; localGraph: SemanticGraph; selectedIds: ReadonlySet<string>; selectedEdgeId?: string;
}) {
  const location = navigation.location, selectedId = [...selectedIds][0], selected = selectedId ? explorer.nodes.get(selectedId) : undefined;
  const owner = selectedId ? explorer.owners.get(selectedId) : undefined;
  const center = location.centerId ? explorer.nodes.get(location.centerId) : undefined;
  const centerDisplay = center ? semanticNodeDisplay(center) : undefined;
  const selectedDisplay = selected ? semanticNodeDisplay(selected) : undefined;
  const scope = explorer.scopes.get(location.scopeId);
  const visibleIds = useMemo(() => new Set(graph.nodes.map(node => node.id)), [graph.nodes]);
  const children = mode === '2d' && !center ? explorerChildren(explorer, location, visibleIds) : [];
  const displayedIds = useMemo(() => center ? new Set(localGraph.nodes.map(node => node.id)) : new Set(scope?.memberIds ?? []), [center, localGraph.nodes, scope]);
  const outside = mode === '2d' && selected && !displayedIds.has(selected.id);
  const regionCount = useMemo(() => new Set(graph.nodes.map(node => explorerRegionIdentity(explorer, node.id).id)).size, [graph.nodes, explorer]);
  const selectedEdge = graph.edges.find(edge => edge.id === selectedEdgeId);
  const outsideEdge = mode === '2d' && selectedEdge && (!center || !localGraph.edges.some(edge => edge.id === selectedEdge.id));
  const visibleEdges = mode === '2d' && center && location.direction !== 'both' && selectedIds.size
    ? localGraph.edges.filter(edge => explorerEdgeVisible(edge, selectedIds, location.direction, selectedEdgeId)).length : localGraph.edges.length;
  return <div className="semantic-explorer-navigation">
    {mode === '2d' ? <>
      <div className="semantic-explorer-navigation-row"><div className="semantic-explorer-history" role="group" aria-label="階層の移動">
        <button type="button" onClick={navigation.onBack} disabled={!navigation.canBack}>戻る</button>
        <button type="button" onClick={navigation.onParent} disabled={!center && location.scopeId === 'project'}>親へ</button>
        <button type="button" onClick={navigation.onProject} disabled={!center && location.scopeId === 'project'}>プロジェクトへ</button>
      </div><nav className="semantic-explorer-breadcrumb" aria-label="2Dの現在地">{explorerBreadcrumbs(explorer, location).map((item, index) => <span key={item.id}>
        {index > 0 && <span aria-hidden="true">›</span>}<button type="button" onClick={() => navigation.onOpenScope(item.id)} aria-current={!center && item.id === location.scopeId ? 'page' : undefined}>{item.label}</button>
      </span>)}{center && <span><span aria-hidden="true">›</span><strong aria-current="page" title={centerDisplay?.tooltip}>{centerDisplay?.title}</strong></span>}</nav>
        {center && <span className="semantic-explorer-local-count" title="現在の局所図の関係総数。線の方向は選択対象を基準に適用し、対象と配置は維持します。">{localGraph.nodes.length.toLocaleString()}対象 / 関係総数 {localGraph.edges.length.toLocaleString()}{location.direction !== 'both' && selectedIds.size > 0 ? ` · 表示${visibleEdges.toLocaleString()}本` : ''}</span>}
      </div>
      {!center && <div className="semantic-explorer-caption"><span>{scope?.label ?? 'プロジェクト'}の直下 · {children.length.toLocaleString()}件</span><small>クリック・Enterで開く · スクロールで同じ階層を移動</small></div>}
    </> : <div className="semantic-explorer-caption"><strong>プロジェクト全体の3D</strong><span>{regionCount.toLocaleString()}所属 · {graph.nodes.length.toLocaleString()}対象 · {graph.edges.length.toLocaleString()}関係</span></div>}
    {explorer.view === 'runtime-flow' && (mode === '3d' || scope?.id === 'project') && explorer.runtimeMode !== 'grounded' && <p className="semantic-explorer-runtime-note">{mode === '3d' ? '実行環境未判定・所属別表示の対象は、記録されたディレクトリ・ファイル・所属でまとまります。' : '実行環境未判定・所属別表示の対象は、ディレクトリとファイルから探索できます。'}</p>}
    {(selected || mode === '2d' && (center || selectedEdge)) && <div className={`semantic-explorer-selection${mode === '2d' && center ? ' is-relation' : ''}`}>
      {selected ? <span className="semantic-explorer-selected-path" title={mode === '2d' ? selectedDisplay?.tooltip : `${selected.label} · ${owner?.filePath ?? (selected.kind === 'external' ? '定義先未特定' : selected.group)}${selected.line ? `:${selected.line}` : ''}`}>{outside ? '現在の場所の外で選択: ' : '選択: '}<strong>{mode === '2d' ? selectedDisplay?.title : selected.label}</strong>{owner?.filePath ? ` · ${owner.filePath}${selected.line ? `:${selected.line}` : ''}` : selected.kind === 'external' ? ' · 定義先未特定' : ` · ${selected.group}`}</span>
        : <span className="semantic-explorer-selected-path">{selectedEdge ? `${outsideEdge && center ? '現在の関係図の外で選択' : '関係を選択'}: ${semanticRelationLabel(selectedEdge)}` : `中心: ${centerDisplay?.title} · 対象をクリックして選択`}</span>}
      <div className="semantic-explorer-selection-actions">
        {outside && <button type="button" onClick={navigation.onRevealSelection}>選択した要素へ移動</button>}
        {outsideEdge && <button type="button" onClick={navigation.onRevealSelection}>この関係を表示</button>}
        {selected && <>{mode === '2d' && <button type="button" onClick={() => navigation.onCenter(selected.id)} disabled={selected.id === center?.id}>この要素を中心に見る</button>}
          {owner?.definitionAvailable && <button type="button" onClick={() => navigation.onDefinition(selected.id)}>定義へ移動</button>}
          <button type="button" onClick={() => navigation.onJumpMode(mode === '2d' ? '3d' : '2d', selected.id)}>{mode === '2d' ? '3D上で位置を見る' : '2Dで詳しく見る'}</button></>}
        {mode === '2d' && center && <label>深さ<select aria-label="中心からの関係の深さ" value={location.depth} onChange={event => navigation.onDepth(Number(event.target.value))}>{[1, 2, 3, 5].map(depth => <option key={depth} value={depth}>{depth === 1 ? '直接の関係' : `${depth}段階`}</option>)}</select></label>}
      </div>
    </div>}
  </div>;
}
