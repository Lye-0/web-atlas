import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';

/** Native fullscreen when available, with a viewport-sized mode for embedded browsers. */
export function useWorkspaceFullscreen(enabled: boolean) {
  const root = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<'none' | 'native' | 'viewport'>('none');
  const returnFocus = useRef<HTMLElement | null>(null);
  const exit = useCallback(async () => {
    if (root.current && document.fullscreenElement === root.current && document.exitFullscreen) {
      try { await document.exitFullscreen(); } catch { /* Still restore the in-page mode. */ }
    }
    setMode('none');
  }, []);
  const toggle = useCallback(async () => {
    if (mode !== 'none') { await exit(); return; }
    const element = root.current;
    if (!element || !enabled) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (element.requestFullscreen && document.fullscreenEnabled !== false) {
      try { await element.requestFullscreen(); setMode('native'); return; } catch { /* Use the same workspace in the viewport. */ }
    }
    setMode('viewport');
  }, [enabled, exit, mode]);

  useEffect(() => {
    const change = () => setMode(current => document.fullscreenElement === root.current ? 'native' : current === 'native' ? 'none' : current);
    document.addEventListener('fullscreenchange', change);
    return () => document.removeEventListener('fullscreenchange', change);
  }, []);
  useEffect(() => { if (!enabled) void exit(); }, [enabled, exit]);
  useEffect(() => {
    if (mode === 'none') return;
    const overflow = document.body.style.overflow;
    const element = root.current;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      returnFocus.current?.focus({ preventScroll: true });
      if (document.fullscreenElement === element) void document.exitFullscreen().catch(() => undefined);
    };
  }, [mode]);

  const onKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    if (mode === 'none') return;
    if (event.key === 'Escape' && (event.target as HTMLElement).closest('[role="menu"]')) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); void exit(); }
    if (event.key === 'Tab') {
      const items = [...event.currentTarget.querySelectorAll<HTMLElement>('button, [href], input, select, summary, [tabindex]:not([tabindex="-1"])')]
        .filter(item => !item.hasAttribute('disabled') && item.getClientRects().length > 0);
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  };
  return { root, isFullscreen: mode !== 'none', toggle, onKeyDownCapture };
}
