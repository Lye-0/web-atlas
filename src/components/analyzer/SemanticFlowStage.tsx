import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { AnalyzerViewSession } from '../../analyzer/session';
import type { SemanticEdge, SemanticGraph } from '../../analyzer/semantic/types';
import { explorerRelations, type SemanticExplorerModel } from '../../analyzer/semantic/semanticExplorer';
import { useSpatialFlowMotion, type SpatialParticleMode } from './useSpatialFlowMotion';
import { SpatialParticleControl } from './SpatialParticleControl';
import { AutoAggregationToggle } from './AutoAggregationPanel';
import { SemanticFlow2D, type FlowCameraCommand, type SemanticFlowRenderProps } from './SemanticFlow2D';
import { SemanticFlowLegend } from './SemanticFlowLegend';
import { semanticFlowDirectionLanguage } from './semanticFlowLanguage';
import { SemanticExplorerNavigation, type SemanticExplorerNavigationActions } from './SemanticExplorerNavigation';
import type { SemanticFlowHoverHandler, SemanticFlowHoverTarget } from '../../analyzer/semantic/flowRelationInteraction';
import type { FlowLabelObstacle } from './semanticFlowLabels';

const SemanticFlow3D = lazy(() => import('./SemanticFlow3D').then(module => ({ default: module.SemanticFlow3D })));

export function SemanticFlowStage({ graph, explorer, nodeDisplays, navigation, mode, direction, selectedIds, selectedEdgeId, matchIds, focus, cameras, onCamera, onMode, particleMode, onParticleMode, onSelect, onSelectEdge, onClear, isFullscreen, onFullscreen, onUnavailable, hoverTarget, onHoverTarget, showGroupBounds = true, onGroupBounds, autoAggregation = true, onAutoAggregation, aggregationState, onAggregationState, totalNodeCount, fineExpandedScopeIds, onFineExpandedScopeIds, architectureControls, architectureOverlay }: {
  architectureControls?: ReactNode; architectureOverlay?: ReactNode;
  nodeDisplays?: SemanticFlowRenderProps['nodeDisplays'];
  graph: SemanticGraph; explorer?: SemanticExplorerModel; navigation?: SemanticExplorerNavigationActions; mode: '2d' | '3d'; direction?: 'both' | 'incoming' | 'outgoing'; selectedIds: ReadonlySet<string>; selectedEdgeId?: string; matchIds: ReadonlySet<string>;
  focus?: { nonce: number; ids: string[]; mode?: '2d' | '3d' }; cameras: AnalyzerViewSession['flowCameras'];
  onCamera: (mode: '2d' | '3d', camera: NonNullable<AnalyzerViewSession['flowCameras']>['2d' | '3d']) => void;
  onMode: (mode: '2d' | '3d') => void; particleMode?: SpatialParticleMode; onParticleMode: (mode: SpatialParticleMode) => void;
  onSelect: (id: string) => void; onSelectEdge: (id: string) => void; onClear: () => void;
  isFullscreen: boolean; onFullscreen: () => void; onUnavailable: () => void;
  hoverTarget?: SemanticFlowHoverTarget; onHoverTarget?: SemanticFlowHoverHandler;
  showGroupBounds?: boolean; onGroupBounds?: (visible: boolean) => void;
  autoAggregation?: boolean; onAutoAggregation?: (enabled: boolean) => void;
  aggregationState?: AnalyzerViewSession['aggregation']; onAggregationState?: (state: NonNullable<AnalyzerViewSession['aggregation']>) => void;
  totalNodeCount?: number;
  fineExpandedScopeIds?: readonly string[]; onFineExpandedScopeIds?: (ids: string[]) => void;
}) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const controls = useRef<HTMLDivElement>(null), navigationElement = useRef<HTMLDivElement>(null);
  const [controlsHeight, setControlsHeight] = useState(40), [navigationHeight, setNavigationHeight] = useState(80);
  const [extraLabelObstacles, setExtraLabelObstacles] = useState<FlowLabelObstacle[]>([]);
  const [visibleRelation, setVisibleRelation] = useState<{ graph: SemanticGraph; edge: SemanticEdge }>();
  const onVisibleRelation = useCallback((edge: SemanticEdge | undefined) => setVisibleRelation(previous => edge ? previous?.graph === graph && previous.edge === edge ? previous : { graph, edge } : previous?.graph === graph ? undefined : previous), [graph]);
  const hasArchitectureOverlay = Boolean(architectureOverlay);
  useLayoutEffect(() => {
    const panel = element?.querySelector('.architecture-request-inspection');
    if (!element || !panel) { setExtraLabelObstacles(previous => previous.length ? [] : previous); return; }
    const measure = () => {
      const box = panel.getBoundingClientRect(), root = element.getBoundingClientRect();
      const next = { left: box.left - root.left, top: box.top - root.top, width: box.width, height: box.height };
      setExtraLabelObstacles(previous => previous[0]?.left === next.left && previous[0]?.top === next.top && previous[0]?.width === next.width && previous[0]?.height === next.height ? previous : [next]);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure); observer.observe(panel); observer.observe(element);
    return () => observer.disconnect();
  }, [element, hasArchitectureOverlay]);
  const hasNavigation = Boolean(navigation);
  useLayoutEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const controlHeight = controls.current?.getBoundingClientRect().height, locationHeight = navigationElement.current?.getBoundingClientRect().height;
      if (controlHeight && controlHeight > 0) setControlsHeight(controlHeight);
      if (locationHeight && locationHeight > 0) setNavigationHeight(locationHeight);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (controls.current) observer.observe(controls.current); if (navigationElement.current) observer.observe(navigationElement.current);
    return () => observer.disconnect();
  }, [hasNavigation, navigation?.visitId, mode]);
  const flow = useSpatialFlowMotion(element);
  const { mode: currentParticleMode, setMode: setParticleMode } = flow;
  const [help, setHelp] = useState(false);
  const commandContext = useMemo(() => ({ visitId: navigation?.visitId, mode }), [navigation?.visitId, mode]);
  const [commandState, setCommandState] = useState<{ context: object; command: FlowCameraCommand }>();
  const command = commandState?.context === commandContext ? commandState.command : undefined;
  const clearSelection = useCallback(() => { setCommandState(undefined); onClear(); }, [onClear]);
  const selectNode = useCallback((id: string) => { setCommandState(undefined); onSelect(id); }, [onSelect]);
  const selectEdge = useCallback((id: string) => { setCommandState(undefined); onSelectEdge(id); }, [onSelectEdge]);
  const nonce = useRef(0), previousFocus = useRef<number | undefined>(undefined);
  useEffect(() => { if (particleMode && currentParticleMode !== particleMode) setParticleMode(particleMode); }, [particleMode, currentParticleMode, setParticleMode]);
  const run = useCallback((kind: FlowCameraCommand['kind'], ids?: string[]) => setCommandState({ context: commandContext, command: { kind, ids, nonce: ++nonce.current } }), [commandContext]);
  useEffect(() => {
    if (focus && (!focus.mode || focus.mode === mode) && focus.nonce !== previousFocus.current) { previousFocus.current = focus.nonce; run('focus', focus.ids); }
  }, [focus, run, mode]);
  const motion = useMemo(() => ({ enabled: flow.enabled, reduced: flow.reduced, visible: flow.visible }), [flow.enabled, flow.reduced, flow.visible]);
  const localGraph = useMemo(() => graph.view !== 'architecture-map' && navigation?.location.centerId ? explorerRelations(graph, navigation.location.centerId, navigation.location.depth, 'both') : graph,
    [graph, navigation?.location.centerId, navigation?.location.depth]);
  const activePath = navigation?.activePath;
  const explicitPath = useMemo(() => activePath?.centerId && activePath.depth > 1
    ? explorerRelations(graph, activePath.centerId, activePath.depth, direction ?? activePath.direction) : undefined,
  [graph, activePath, direction]);
  const explicitPathNodeIds = useMemo(() => new Set([...(explicitPath?.nodes.map(node => node.id) ?? []), ...(graph.architectureView?.explicitNodeIds ?? [])]), [explicitPath, graph.architectureView?.explicitNodeIds]);
  const explicitPathEdgeIds = useMemo(() => new Set(explicitPath?.edges.map(edge => edge.id)), [explicitPath]);
  const overlayTop = controlsHeight + (navigation ? navigationHeight + 36 : 24);
  const properties = { graph, explorer, nodeDisplays, visitId: navigation?.visitId, direction, selectedIds, selectedEdgeId, matchIds, motion, command, onSelect: selectNode, onSelectEdge: selectEdge, onClear: clearSelection, overlayTop, hoverTarget, onHoverTarget, showGroupBounds, extraLabelObstacles, onVisibleRelation: graph.view === 'architecture-map' ? onVisibleRelation : undefined,
    autoAggregation, aggregationState, onAggregationState, explicitPathNodeIds, explicitPathEdgeIds, totalNodeCount, fineExpandedScopeIds, onFineExpandedScopeIds };
  const cameraApplicable = graph.view === 'architecture-map' || mode === '3d' || !navigation || Boolean(navigation.location.centerId);
  const cameraTitle = cameraApplicable ? undefined : 'この階層のブロックはスクロールで移動します';
  return <div ref={setElement} className="analyzer-graph-stage analyzer-spatial-graph-stage semantic-flow-stage" data-mode={mode} data-visit-id={navigation?.visitId}
    style={{ '--flow-controls-height': `${controlsHeight}px` } as CSSProperties}>
    <div ref={controls} className="analyzer-stage-controls" aria-label="グラフ操作">
      <div className="semantic-flow-mode" role="group" aria-label="表示モード"><button type="button" aria-pressed={mode === '2d'} onClick={() => onMode('2d')}>2D</button><button type="button" aria-pressed={mode === '3d'} onClick={() => onMode('3d')}>3D</button></div>
      <button type="button" disabled={!cameraApplicable} onClick={() => run('fit')} title={cameraTitle ?? '現在の関係図全体を収める'}>Fit</button>
      <button type="button" disabled={!cameraApplicable} onClick={() => run('reset')} title={cameraTitle ?? '現在の図のカメラを初期位置へ戻す'}>Reset</button>
      <button type="button" disabled={!cameraApplicable} aria-label="Zoom in" title={cameraTitle} onClick={() => run('zoom-in')}>+</button><button type="button" disabled={!cameraApplicable} aria-label="Zoom out" title={cameraTitle} onClick={() => run('zoom-out')}>−</button>
      <button type="button" disabled={!selectedIds.size && !selectedEdgeId} onClick={() => {
        if (mode === '2d' && navigation && (!navigation.location.centerId || [...selectedIds].some(id => !localGraph.nodes.some(node => node.id === id))
          || selectedEdgeId && !localGraph.edges.some(edge => edge.id === selectedEdgeId))) navigation.onRevealSelection();
        else run('focus', selectedEdgeId ? graph.edges.filter(edge => edge.id === selectedEdgeId).flatMap(edge => [edge.source, edge.target]) : [...selectedIds]);
      }}>選択へ移動</button>
      <SpatialParticleControl mode={flow.mode} onChange={next => { flow.setMode(next); onParticleMode(next); }} onOpen={() => setHelp(false)} />
      {mode === '3d' && <button type="button" className="semantic-flow-bounds-toggle" aria-label="分類の囲い" aria-pressed={showGroupBounds} onClick={() => onGroupBounds?.(!showGroupBounds)}>分類の囲い：{showGroupBounds ? 'ON' : 'OFF'}</button>}
      {mode === '3d' && <AutoAggregationToggle enabled={autoAggregation} onChange={enabled => onAutoAggregation?.(enabled)} />}
      {architectureControls}
      <button type="button" aria-label={isFullscreen ? '全画面を終了' : '全画面表示'} aria-pressed={isFullscreen} onClick={onFullscreen}>{isFullscreen ? '↙' : '⛶'}</button>
      <button type="button" className="analyzer-help-button" aria-label="グラフ操作ヘルプ" aria-expanded={help} onClick={() => setHelp(!help)}>?</button>
    </div>
    {explorer && navigation && <div ref={navigationElement} className="semantic-explorer-navigation-position" style={{ top: controlsHeight + 24 }}>
      <SemanticExplorerNavigation explorer={explorer} navigation={navigation} mode={mode} graph={graph} localGraph={localGraph} selectedIds={selectedIds} selectedEdgeId={selectedEdgeId} hoverTarget={hoverTarget} onSelectEdge={selectEdge} relationHint={visibleRelation?.graph === graph ? visibleRelation.edge : undefined} />
    </div>}
    {help && <div className="analyzer-stage-help" role="dialog" aria-label="グラフ操作ヘルプ"><strong>{graph.view === 'architecture-map' ? '構成図の操作' : mode === '2d' ? '2Dエクスプローラー' : '3D全体図'}</strong>
      <p>{graph.view === 'architecture-map' ? 'クリック・Enterで構成要素を選択し、内部を開くボタンで下位の構成へ移動します。パンくず・親へ・戻るで階層と訪問先を移動できます。2Dはドラッグで移動、3Dはドラッグで回転します。ホイールと＋ / −で拡大縮小できます。' : mode === '2d' ? 'ブロックをクリック・Enterで開き、パンくずや「親へ」で所属階層を移動します。「戻る」とブラウザの戻る・進むは訪問した場所を復元します。関係図の対象はクリックで選択し、「この要素を中心に見る」で中心を切り替えます。関係図はドラッグと矢印キーで移動、ホイールと＋ / −で拡大縮小できます。' : 'ドラッグで回転、右ドラッグで移動。点やラベルから対象を選択できます。ホイールと＋ / −で拡大縮小できます。'}</p>
      <p>検索入力はプロジェクト全体の候補を強調します。候補を選ぶと対象の場所へ移動します。2Dと3Dの切り替えは各モードの場所を復元し、明示的な相互ジャンプは選んだ対象へ移動します。</p>
      <p>{semanticFlowDirectionLanguage(graph.view).help}</p><button type="button" onClick={() => setHelp(false)}>ヘルプを閉じる</button></div>}
    {mode === '2d' ? <SemanticFlow2D key={navigation?.visitId ?? '2d'} {...properties} graph={localGraph} location={navigation?.location} visitId={navigation?.visitId}
      scrollTop={navigation?.scrollTop} onScroll={navigation?.onScroll} onOpenScope={navigation?.onOpenScope} onOpenNode={navigation?.onOpenNode}
      camera={cameras?.['2d']} onCamera={camera => onCamera('2d', camera)} />
      : graph.nodes.length ? <Suspense fallback={<p className="semantic-flow-loading" role="status">3D全体図を準備中…</p>}><SemanticFlow3D key={graph.view === 'architecture-map' ? 'architecture-3d' : navigation?.visitId ?? '3d'} {...properties}
        camera={cameras?.['3d']} onCamera={camera => onCamera('3d', camera)} onUnavailable={onUnavailable} onFocusRegion={ids => run('focus', ids)} /></Suspense>
        : <div className="semantic-empty-result"><h3>表示する対象がありません</h3><p>フィルターまたは表示データを変更してください。</p></div>}
    {cameraApplicable && <SemanticFlowLegend view={graph.view} />}
    {architectureOverlay}
  </div>;
}
