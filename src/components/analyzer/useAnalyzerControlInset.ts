import { useLayoutEffect } from 'react';

/** Keep help below wrapped controls without feeding measurements into graph layout. */
export function useAnalyzerControlInset(stage: HTMLElement | null, onInset?: (inset: number) => void) {
  useLayoutEffect(() => {
    const controls = stage?.querySelector<HTMLElement>('.analyzer-stage-controls');
    const legend = stage?.querySelector<HTMLElement>('.semantic-flow-direction-legend:not(.is-inline)');
    if (!stage || !controls) return;
    const measure = () => { const inset = controls.offsetTop + controls.offsetHeight + 8; stage.style.setProperty('--analyzer-controls-bottom', `${inset}px`); onInset?.(inset); if (legend) stage.style.setProperty('--analyzer-legend-height', `${legend.offsetHeight}px`); };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(controls);
    if (legend) observer.observe(legend);
    return () => observer.disconnect();
  }, [stage, onInset]);
}
