import { useId, useState } from 'react';
import { semanticMapBounds, type SemanticFlowRegion, type SemanticMapRect } from '../../analyzer/semantic/flowRegions';

export function SemanticFlowLocation({ label, selection, description }: { label: string; selection?: string; description?: string }) {
  return <div className="semantic-flow-location" aria-label="地図上の現在地"><small>{description ?? '表示している領域'}</small><strong title={label}>{label}</strong>
    {selection && <span title={selection}>選択の所属 · {selection}</span>}</div>;
}

export function SemanticFlowMap({ regions, viewport, selectedRegion, onNavigate, onFit }: {
  regions: readonly SemanticFlowRegion[]; viewport: SemanticMapRect; selectedRegion?: string;
  onNavigate: (x: number, y: number) => void; onFit: () => void;
}) {
  const [open, setOpen] = useState(() => typeof matchMedia === 'undefined' || !matchMedia('(max-width:700px)').matches);
  const clipId = useId(), bounds = semanticMapBounds(regions), width = 184, height = 104;
  const scale = Math.min((width - 12) / bounds.width, (height - 12) / bounds.height);
  const left = (width - bounds.width * scale) / 2, top = (height - bounds.height * scale) / 2;
  const x = (value: number) => left + (value - bounds.x) * scale, y = (value: number) => top + (value - bounds.y) * scale;
  return <div className="semantic-flow-minimap">
    <button type="button" aria-expanded={open} aria-controls={clipId} onClick={() => setOpen(!open)}>{open ? '全体図をたたむ' : '全体図を表示'}</button>
    {open && <div id={clipId}><svg viewBox={`0 0 ${width} ${height}`} role="application" tabIndex={0} aria-label="全体図。クリックで移動、矢印キーで表示範囲を移動、Homeで全体表示。"
      onPointerDown={event => {
        if (event.button !== 0) return;
        event.preventDefault(); event.currentTarget.focus({ preventScroll: true });
        const rect = event.currentTarget.getBoundingClientRect();
        onNavigate(bounds.x + ((event.clientX - rect.left) * width / rect.width - left) / scale, bounds.y + ((event.clientY - rect.top) * height / rect.height - top) / scale);
      }}
      onKeyDown={event => {
        if (event.key === 'Home' || event.key === 'Enter') { event.preventDefault(); onFit(); }
        else if (event.key.startsWith('Arrow')) {
          event.preventDefault();
          onNavigate(viewport.x + viewport.width / 2 + (event.key === 'ArrowLeft' ? -.25 : event.key === 'ArrowRight' ? .25 : 0) * viewport.width,
            viewport.y + viewport.height / 2 + (event.key === 'ArrowUp' ? -.25 : event.key === 'ArrowDown' ? .25 : 0) * viewport.height);
        }
      }}>
      <defs><clipPath id={`${clipId}-clip`}><rect width={width} height={height} /></clipPath></defs>
      <g pointerEvents="none" clipPath={`url(#${clipId}-clip)`}>{regions.map(region => <rect key={region.id} data-map-region={region.id} x={x(region.x)} y={y(region.y)} width={Math.max(1, region.width * scale)} height={Math.max(2, region.height * scale)} className={region.id === selectedRegion ? 'is-selected' : ''}><title>{region.label} · {region.count}対象</title></rect>)}
        <rect className="semantic-flow-minimap-viewport" x={x(viewport.x)} y={y(viewport.y)} width={viewport.width * scale} height={viewport.height * scale} />
        <circle className="semantic-flow-minimap-center" r={2.5} cx={Math.max(3, Math.min(width - 3, x(viewport.x + viewport.width / 2)))} cy={Math.max(3, Math.min(height - 3, y(viewport.y + viewport.height / 2)))} />
      </g>
    </svg><div className="semantic-flow-minimap-caption"><span>明るい枠が表示範囲</span><button type="button" onClick={onFit}>全体へ</button></div></div>}
  </div>;
}
