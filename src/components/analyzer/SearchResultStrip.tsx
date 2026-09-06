import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import './analyzer-chrome.css';

export interface SearchResultItem { id: string; label: string; subtitle?: string; reason?: string }

const focusGutter = 4;
function stripGeometry(width: number, count: number) {
  const cardWidth = Math.max(1, Math.min(256, width - focusGutter * 2)), stride = cardWidth + 8;
  return { width, cardWidth, stride, totalWidth: count ? (count - 1) * stride + cardWidth + focusGutter * 2 : 0 };
}
function clampStripScroll(left: number, geometry: ReturnType<typeof stripGeometry>) {
  return Math.max(0, Math.min(Math.max(0, geometry.totalWidth - geometry.width), left));
}
function revealStripResult(index: number, left: number, geometry: ReturnType<typeof stripGeometry>) {
  const start = index * geometry.stride, end = start + geometry.cardWidth + focusGutter * 2;
  return clampStripScroll(start < left ? start : end > left + geometry.width ? end - geometry.width : left, geometry);
}

/** One fixed-height row. Keyboard focus scrolls this row, never the containing page. */
export function SearchResultStrip({ query, items, selectedId, onSelect, loading = false }: {
  query: string; items: SearchResultItem[]; selectedId?: string; onSelect: (id: string) => void; loading?: boolean;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(0);
  const [scroll, setScroll] = useState({ left: false, right: false });
  const [window, setWindow] = useState({ left: 0, width: 1024 });
  const pendingFocus = useRef<number | undefined>(undefined);
  const pendingScroll = useRef<number | undefined>(undefined);
  const countRef = useRef(items.length);
  const geometryRef = useRef(stripGeometry(1024, items.length));
  const geometry = stripGeometry(window.width, items.length);
  const { cardWidth, stride } = geometry;
  const start = Math.max(0, Math.floor(window.left / stride) - 2);
  const end = Math.min(items.length, Math.ceil((window.left + window.width) / stride) + 3);
  const visibleStart = Math.max(0, Math.floor(window.left / stride));
  const visibleEnd = Math.ceil((window.left + window.width) / stride);
  const tabStop = focused >= visibleStart && focused < visibleEnd ? focused : Math.min(items.length - 1, visibleStart);
  const updateScroll = useCallback(() => {
    const element = strip.current;
    if (element) {
      const previous = geometryRef.current, next = stripGeometry(element.clientWidth || previous.width, countRef.current);
      let left = pendingScroll.current ?? element.scrollLeft;
      if (next.width !== previous.width) {
        left = clampStripScroll(element.scrollLeft / previous.stride * next.stride, next);
        const active = document.activeElement;
        const index = active && element.contains(active) ? active.getAttribute('data-result-index') : null;
        if (index !== null) {
          left = revealStripResult(Number(index), left, next);
          pendingFocus.current = Number(index);
        }
        // Apply after the new track width is committed; the old DOM may clamp a larger scroll.
        pendingScroll.current = left;
      }
      geometryRef.current = next;
      setScroll(current => { const state = { left: left > 1, right: left + next.width < next.totalWidth - 1 }; return current.left === state.left && current.right === state.right ? current : state; });
      setWindow(current => current.left === left && current.width === next.width ? current : { left, width: next.width });
    }
  }, []);
  useLayoutEffect(() => {
    countRef.current = items.length; setFocused(0); pendingFocus.current = undefined; pendingScroll.current = undefined;
    if (strip.current) strip.current.scrollLeft = 0; updateScroll();
  }, [query, items.length, updateScroll]);
  useEffect(() => {
    if (!strip.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateScroll); observer.observe(strip.current);
    return () => observer.disconnect();
  }, [updateScroll]);
  const reveal = (index: number) => {
    const element = strip.current;
    if (!element) return;
    element.scrollLeft = revealStripResult(index, element.scrollLeft, geometry);
    updateScroll();
  };
  useLayoutEffect(() => {
    if (pendingScroll.current !== undefined && strip.current) {
      strip.current.scrollLeft = pendingScroll.current; pendingScroll.current = undefined; updateScroll();
    }
    if (pendingFocus.current === undefined) return;
    const button = strip.current?.querySelector<HTMLButtonElement>(`[data-result-index="${pendingFocus.current}"]`);
    if (button) { pendingFocus.current = undefined; button.focus({ preventScroll: true }); }
  }, [focused, start, end, window.width, stride, updateScroll]);
  const page = (direction: number) => {
    const element = strip.current; if (!element) return;
    element.scrollLeft = clampStripScroll(element.scrollLeft + direction * Math.max(stride, geometry.width * .8), geometry); updateScroll();
  };
  return <div className="analyzer-search-strip" data-search-state={loading ? 'loading' : !query.trim() ? 'idle' : items.length ? 'results' : 'empty'}>
    <div className="analyzer-search-summary" role="status" aria-live="polite">{loading ? '解析中' : query.trim() ? `${items.length.toLocaleString()}件一致` : '検索結果'}</div>
    <button type="button" className="analyzer-strip-scroll" aria-label="検索結果を左へスクロール" disabled={!scroll.left} onClick={() => page(-1)}>‹</button>
    <div ref={strip} className="analyzer-search-results analyzer-search-result-row" role="listbox" aria-label="Analyzer search results" aria-orientation="horizontal" onScroll={updateScroll}
      onKeyDown={event => {
        if (!items.length || event.nativeEvent.isComposing || event.keyCode === 229 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : Math.max(0, Math.min(items.length - 1, focused + (event.key === 'ArrowRight' ? 1 : -1)));
        pendingFocus.current = next; setFocused(next); reveal(next);
        const button = strip.current?.querySelector<HTMLButtonElement>(`[data-result-index="${next}"]`);
        if (button) { pendingFocus.current = undefined; button.focus({ preventScroll: true }); }
      }}>
      {!items.length ? <p className="analyzer-search-hint">{loading ? '候補を準備しています…' : query.trim() ? '一致する対象はありません。検索語やフィルターを変更してください。' : '名前・パスで検索。候補を選ぶと、対象と根拠へ移動します。'}</p>
        : <div className="analyzer-search-result-track" role="presentation" style={{ width: geometry.totalWidth }}>
          {items.slice(start, end).map((item, offset) => { const index = start + offset; return <button key={item.id} type="button" role="option" aria-selected={selectedId === item.id}
          aria-posinset={index + 1} aria-setsize={items.length} data-result-index={index} style={{ left: index * stride + focusGutter, width: cardWidth }}
          tabIndex={index === Math.min(tabStop, items.length - 1) ? 0 : -1} title={[item.label, item.subtitle, item.reason].filter(Boolean).join('\n')}
          onFocus={() => { setFocused(index); reveal(index); }}
          onKeyDown={event => { if ((event.key === 'Enter' || event.key === ' ') && (event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault(); }}
          onClick={() => onSelect(item.id)}>
          <strong>{item.label}</strong><small>{item.subtitle ?? '—'}</small><span>{item.reason || '名前で一致'}</span>
        </button>; })}</div>}
    </div>
    <button type="button" className="analyzer-strip-scroll" aria-label="検索結果を右へスクロール" disabled={!scroll.right} onClick={() => page(1)}>›</button>
  </div>;
}
