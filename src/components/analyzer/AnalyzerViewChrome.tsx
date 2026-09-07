import type { ReactNode } from 'react';
import { analyzerViewLabels, type AnalyzerProjectStore, type AnalyzerViewId, type DirectoryHandleLike } from '../../analyzer';
import { AnalyzerProjectPicker } from './AnalyzerProjectPicker';

export function AnalyzerProjectHeader({ onScanned }: { onScanned: (store: AnalyzerProjectStore, handle?: DirectoryHandleLike) => void }) {
  return <section className="page-intro analyzer-intro"><div>
    <p className="eyebrow">04 / LOCAL ANALYSIS</p><h1>Analyzer</h1>
    <p className="intro-copy">プロジェクトの構造と処理のつながりを、ソースの根拠とともにたどります。</p>
  </div><AnalyzerProjectPicker onScanned={onScanned} /></section>;
}

export function AnalyzerViewHeading({ view, children }: { view: AnalyzerViewId; children?: ReactNode }) {
  return <div className="analyzer-shell-heading"><div><p className="section-kicker">Evidence Graph</p>
    <h2 id="analyzer-view-title">{analyzerViewLabels[view]}</h2></div>
    <div className="analyzer-scan-meta">{children}</div></div>;
}

export function AnalyzerSearchControl({ value, onChange, label = 'Analyzer Nodeを検索', placeholder = 'Node / package / path' }: {
  value: string; onChange: (value: string) => void; label?: string; placeholder?: string;
}) {
  return <label className="analyzer-search-control"><span>検索</span><input type="search" value={value}
    onChange={event => onChange(event.target.value)} placeholder={placeholder} aria-label={label}
    onKeyDown={event => { if (event.key === 'Escape' && !event.nativeEvent.isComposing) { event.stopPropagation(); onChange(''); } }} /></label>;
}
