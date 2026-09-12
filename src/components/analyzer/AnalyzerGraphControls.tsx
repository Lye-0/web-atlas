import { useState, type ReactNode, type Ref } from 'react';
import { SpatialParticleControl } from './SpatialParticleControl';
import { AutoAggregationToggle } from './AutoAggregationPanel';
import type { SpatialParticleMode } from './useSpatialFlowMotion';
import './analyzer-graph-controls.css';

/** One control order, markup and visual treatment for every Analyzer renderer. */
export function AnalyzerGraphControls({ elementRef, mode, onMode, cameraApplicable = true, cameraTitle, onFit, onReset, onZoomIn, onZoomOut, zoomLabel, zoomLabelRef, canFocus, onFocus,
  particleMode, onParticleMode, showGroupBounds, onGroupBounds, autoAggregation, onAutoAggregation, isFullscreen, onFullscreen, help, onHelp, children, compact = false }: {
  elementRef?: Ref<HTMLDivElement>; mode?: '2d' | '3d'; onMode?: (mode: '2d' | '3d') => void;
  cameraApplicable?: boolean; cameraTitle?: string; onFit: () => void; onReset: () => void; onZoomIn: () => void; onZoomOut: () => void;
  zoomLabel?: string; zoomLabelRef?: Ref<HTMLSpanElement>; canFocus: boolean; onFocus: () => void;
  particleMode: SpatialParticleMode; onParticleMode: (mode: SpatialParticleMode) => void;
  showGroupBounds?: boolean; onGroupBounds?: (value: boolean) => void; autoAggregation?: boolean; onAutoAggregation?: (value: boolean) => void;
  isFullscreen?: boolean; onFullscreen?: () => void; help: boolean; onHelp: (value: boolean) => void; children?: ReactNode; compact?: boolean;
}) {
  const [expanded,setExpanded]=useState(false);
  return <div ref={elementRef} className="analyzer-stage-controls analyzer-graph-controls" aria-label="グラフ操作">
    {onMode && <div className="semantic-flow-mode" role="group" aria-label="表示モード"><button type="button" aria-pressed={mode === '2d'} onClick={() => onMode('2d')}>2D</button><button type="button" aria-pressed={mode === '3d'} onClick={() => onMode('3d')}>3D</button></div>}
    {compact&&<button type="button" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>その他の操作</button>}
    <div className="analyzer-controls-secondary" hidden={compact&&!expanded}>
    <button type="button" disabled={!cameraApplicable} onClick={onFit} title={cameraTitle ?? '現在の関係図全体を収める'}>Fit</button>
    <button type="button" disabled={!cameraApplicable} onClick={onReset} title={cameraTitle ?? '現在の図のカメラを初期位置へ戻す'}>Reset</button>
    <button type="button" disabled={!cameraApplicable} aria-label="Zoom in" title={cameraTitle} onClick={onZoomIn}>+</button>
    <button type="button" disabled={!cameraApplicable} aria-label="Zoom out" title={cameraTitle} onClick={onZoomOut}>−</button>
    {zoomLabel && <span aria-label="ズーム倍率" ref={zoomLabelRef}>{zoomLabel}</span>}
    <SpatialParticleControl mode={particleMode} onChange={onParticleMode} onOpen={() => onHelp(false)} />
    {onGroupBounds && <button type="button" className="semantic-flow-bounds-toggle" aria-label="分類の囲い" aria-pressed={showGroupBounds} onClick={() => onGroupBounds(!showGroupBounds)}>分類の囲い：{showGroupBounds ? 'ON' : 'OFF'}</button>}
    {onAutoAggregation && <AutoAggregationToggle enabled={autoAggregation ?? true} onChange={onAutoAggregation} />}
    {children}
    </div>
    <button type="button" disabled={!canFocus} onClick={onFocus}>選択へ移動</button>
    {onFullscreen && <button type="button" aria-label={isFullscreen ? '全画面を終了' : '全画面表示'} title={isFullscreen ? '全画面を終了' : '全画面表示'} aria-pressed={isFullscreen} onClick={onFullscreen}>
      <svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
        <path d={isFullscreen
          ? 'M3 3l6 6M4 9h5V4M21 3l-6 6M15 4v5h5M3 21l6-6M4 15h5v5M21 21l-6-6M15 20v-5h5'
          : 'M9 9L3 3M3 8V3h5M15 9l6-6M16 3h5v5M9 15l-6 6M3 16v5h5M15 15l6 6M16 21h5v-5'} />
      </svg>
    </button>}
    <button type="button" className="analyzer-help-button" aria-label="グラフ操作ヘルプ" aria-expanded={help} onClick={() => onHelp(!help)}>?</button>
  </div>;
}
