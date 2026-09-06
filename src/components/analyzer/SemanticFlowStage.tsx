import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AnalyzerViewSession } from '../../analyzer/session';
import type { SemanticGraph } from '../../analyzer/semantic/types';
import { analyzerDirectionColors } from '../../analyzer/edgeDirection';
import { useSpatialFlowMotion, type SpatialParticleMode } from './useSpatialFlowMotion';
import { SpatialParticleControl } from './SpatialParticleControl';
import { SemanticFlow2D, type FlowCameraCommand } from './SemanticFlow2D';

const SemanticFlow3D = lazy(() => import('./SemanticFlow3D').then(module => ({ default: module.SemanticFlow3D })));

export function SemanticFlowStage({ graph, mode, selectedIds, selectedEdgeId, matchIds, focus, cameras, onCamera, onMode, particleMode, onParticleMode, onSelect, onSelectEdge, onClear, isFullscreen, onFullscreen, onUnavailable }: {
  graph: SemanticGraph; mode: '2d' | '3d'; selectedIds: ReadonlySet<string>; selectedEdgeId?: string; matchIds: ReadonlySet<string>;
  focus?: { nonce: number; ids: string[] }; cameras: AnalyzerViewSession['flowCameras'];
  onCamera: (mode: '2d' | '3d', camera: NonNullable<AnalyzerViewSession['flowCameras']>['2d' | '3d']) => void;
  onMode: (mode: '2d' | '3d') => void; particleMode?: SpatialParticleMode; onParticleMode: (mode: SpatialParticleMode) => void;
  onSelect: (id: string) => void; onSelectEdge: (id: string) => void; onClear: () => void;
  isFullscreen: boolean; onFullscreen: () => void; onUnavailable: () => void;
}) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const flow = useSpatialFlowMotion(element);
  const { mode: currentParticleMode, setMode: setParticleMode } = flow;
  const [help, setHelp] = useState(false), [command, setCommand] = useState<FlowCameraCommand>();
  const nonce = useRef(0), previousFocus = useRef(focus?.nonce);
  useEffect(() => { if (particleMode && currentParticleMode !== particleMode) setParticleMode(particleMode); }, [particleMode, currentParticleMode, setParticleMode]);
  const run = useCallback((kind: FlowCameraCommand['kind'], ids?: string[]) => setCommand({ kind, ids, nonce: ++nonce.current }), []);
  useEffect(() => { if (focus && focus.nonce !== previousFocus.current) { previousFocus.current = focus.nonce; run('focus', focus.ids); } }, [focus, run]);
  const motion = useMemo(() => ({ enabled: flow.enabled, reduced: flow.reduced, visible: flow.visible }), [flow.enabled, flow.reduced, flow.visible]);
  const properties = { graph, selectedIds, selectedEdgeId, matchIds, motion, command, onSelect, onSelectEdge, onClear };
  return <div ref={setElement} className="analyzer-graph-stage analyzer-spatial-graph-stage semantic-flow-stage" data-mode={mode}>
    <div className="analyzer-stage-controls" aria-label="グラフ操作">
      <div className="semantic-flow-mode" role="group" aria-label="表示モード"><button type="button" aria-pressed={mode === '2d'} onClick={() => onMode('2d')}>分類2D</button><button type="button" aria-pressed={mode === '3d'} onClick={() => onMode('3d')}>一覧3D</button></div>
      <button type="button" onClick={() => run('fit')} title="現在の表示対象全体を収める">Fit</button>
      <button type="button" onClick={() => run('reset')} title="現在のモードのカメラを初期位置へ戻す">Reset</button>
      <button type="button" aria-label="Zoom in" onClick={() => run('zoom-in')}>+</button><button type="button" aria-label="Zoom out" onClick={() => run('zoom-out')}>−</button>
      <button type="button" disabled={!selectedIds.size && !selectedEdgeId} onClick={() => run('focus', selectedEdgeId ? graph.edges.filter(edge => edge.id === selectedEdgeId).flatMap(edge => [edge.source, edge.target]) : [...selectedIds])}>選択へ移動</button>
      <SpatialParticleControl mode={flow.mode} onChange={next => { flow.setMode(next); onParticleMode(next); }} onOpen={() => setHelp(false)} />
      <button type="button" aria-label={isFullscreen ? '全画面を終了' : '全画面表示'} aria-pressed={isFullscreen} onClick={onFullscreen}>{isFullscreen ? '↙' : '⛶'}</button>
      <button type="button" className="analyzer-help-button" aria-label="グラフ操作ヘルプ" aria-expanded={help} onClick={() => setHelp(!help)}>?</button>
    </div>
    {help && <div className="analyzer-stage-help" role="dialog" aria-label="グラフ操作ヘルプ"><strong>{mode === '2d' ? '分類2D' : '一覧3D'}</strong>
      <p>{mode === '2d' ? 'ドラッグと矢印キーで移動。分類を選ぶと展開します。' : 'ドラッグで回転、右ドラッグで移動。点やラベルから対象を選択できます。'}ホイールと＋ / −で拡大縮小。検索は候補を強調し、候補を選ぶと対象へ移動します。Fitは全体を収め、Resetはカメラを初期位置へ戻します。</p>
      <p>空間上の配置はソースの実行順を保証しません。粒子は記録された関係のsource → targetを説明します。通常・控えめ・オフを切り替えても、矢印と線の方向は同じです。</p><button type="button" onClick={() => setHelp(false)}>ヘルプを閉じる</button></div>}
    {graph.nodes.length ? mode === '2d' ? <SemanticFlow2D key="2d" {...properties} camera={cameras?.['2d']} onCamera={camera => onCamera('2d', camera)} />
      : <Suspense fallback={<p className="semantic-flow-loading" role="status">一覧3Dを準備中…</p>}><SemanticFlow3D key="3d" {...properties} camera={cameras?.['3d']} onCamera={camera => onCamera('3d', camera)} onUnavailable={onUnavailable} /></Suspense>
      : <div className="semantic-empty-result"><h3>表示する対象がありません</h3><p>フィルターまたは表示データを変更してください。</p></div>}
    <div className="semantic-flow-legend"><span style={{ color: analyzerDirectionColors.outgoing }}>→ {graph.view === 'function-call-flow' ? '出る関係・呼び出し先' : '出る関係・関係先'}</span><span style={{ color: analyzerDirectionColors.incoming }}>→ {graph.view === 'function-call-flow' ? '入る関係・呼び出し元' : '入る関係・関係元'}</span><span>線と粒子は選択周辺 · 粒子は関係方向の説明</span></div>
  </div>;
}
