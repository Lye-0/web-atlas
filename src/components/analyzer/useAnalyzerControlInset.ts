import { useLayoutEffect } from 'react';

/** Keep help below wrapped controls without feeding measurements into graph layout. */
export function useAnalyzerControlInset(stage: HTMLElement | null) {
  useLayoutEffect(() => {
    const controls = stage?.querySelector<HTMLElement>('.analyzer-stage-controls');
    if (!stage || !controls) return;
    const measure = () => stage.style.setProperty('--analyzer-controls-bottom', `${controls.offsetTop + controls.offsetHeight + 8}px`);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(controls);
    return () => observer.disconnect();
  }, [stage]);
}
