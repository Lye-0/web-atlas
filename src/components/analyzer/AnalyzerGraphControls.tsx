import type { ReactNode, Ref } from 'react';
import { SpatialParticleControl } from './SpatialParticleControl';
import { AutoAggregationToggle } from './AutoAggregationPanel';
import type { SpatialParticleMode } from './useSpatialFlowMotion';
import './analyzer-graph-controls.css';

/** One control order, markup and visual treatment for every Analyzer renderer. */
export function AnalyzerGraphControls({ elementRef, mode, onMode, cameraApplicable = true, cameraTitle, onFit, onReset, onZoomIn, onZoomOut, zoomLabel, zoomLabelRef, canFocus, onFocus,
  particleMode, onParticleMode, showGroupBounds, onGroupBounds, autoAggregation, onAutoAggregation, isFullscreen, onFullscreen, help, onHelp, children }: {
  elementRef?: Ref<HTMLDivElement>; mode?: '2d' | '3d'; onMode?: (mode: '2d' | '3d') => void;
  cameraApplicable?: boolean; cameraTitle?: string; onFit: () => void; onReset: () => void; onZoomIn: () => void; onZoomOut: () => void;
  zoomLabel?: string; zoomLabelRef?: Ref<HTMLSpanElement>; canFocus: boolean; onFocus: () => void;
  particleMode: SpatialParticleMode; onParticleMode: (mode: SpatialParticleMode) => void;
  showGroupBounds?: boolean; onGroupBounds?: (value: boolean) => void; autoAggregation?: boolean; onAutoAggregation?: (value: boolean) => void;
  isFullscreen?: boolean; onFullscreen?: () => void; help: boolean; onHelp: (value: boolean) => void; children?: ReactNode;
}) {
  return <div ref={elementRef} className="analyzer-stage-controls analyzer-graph-controls" aria-label="グラフ操作">
    {onMode && <div className="semantic-flow-mode" role="group" aria-label="表示モード"><button type="button" aria-pressed={mode === '2d'} onClick={() => onMode('2d')}>2D</button><button type="button" aria-pressed={mode === '3d'} onClick={() => onMode('3d')}>3D</button></div>}
    <button type="button" disabled={!cameraApplicable} onClick={onFit} title={cameraTitle ?? '現在の関係図全体を収める'}>Fit</button>
    <button type="button" disabled={!cameraApplicable} onClick={onReset} title={cameraTitle ?? '現在の図のカメラを初期位置へ戻す'}>Reset</button>
    <button type="button" disabled={!cameraApplicable} aria-label="Zoom in" title={cameraTitle} onClick={onZoomIn}>+</button>
    <button type="button" disabled={!cameraApplicable} aria-label="Zoom out" title={cameraTitle} onClick={onZoomOut}>−</button>
    {zoomLabel && <span ref={zoomLabelRef}>{zoomLabel}</span>}
    <button type="button" disabled={!canFocus} onClick={onFocus}>選択へ移動</button>
    <SpatialParticleControl mode={particleMode} onChange={onParticleMode} onOpen={() => onHelp(false)} />
    {onGroupBounds && <button type="button" className="semantic-flow-bounds-toggle" aria-label="分類の囲い" aria-pressed={showGroupBounds} onClick={() => onGroupBounds(!showGroupBounds)}>分類の囲い：{showGroupBounds ? 'ON' : 'OFF'}</button>}
    {onAutoAggregation && <AutoAggregationToggle enabled={autoAggregation ?? true} onChange={onAutoAggregation} />}
    {children}
    {onFullscreen && <button type="button" aria-label={isFullscreen ? '全画面を終了' : '全画面表示'} aria-pressed={isFullscreen} onClick={onFullscreen}>{isFullscreen ? '↙' : '⛶'}</button>}
    <button type="button" className="analyzer-help-button" aria-label="グラフ操作ヘルプ" aria-expanded={help} onClick={() => onHelp(!help)}>?</button>
  </div>;
}
