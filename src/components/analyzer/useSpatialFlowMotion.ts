import { useEffect, useState } from 'react';

export type SpatialParticleMode = 'normal' | 'reduced' | 'off';

export function useSpatialFlowMotion(stage: HTMLElement | null) {
  const [mode, setMode] = useState<SpatialParticleMode>(() =>
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'reduced' : 'normal');
  const [pageVisible, setPageVisible] = useState(() => !document.hidden);
  const [inViewport, setInViewport] = useState(true);

  useEffect(() => {
    const onVisibility = () => setPageVisible(!document.hidden);
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const onMotionPreference = () => setMode(current => current === 'off' ? current : media?.matches ? 'reduced' : 'normal');
    document.addEventListener('visibilitychange', onVisibility);
    media?.addEventListener('change', onMotionPreference);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      media?.removeEventListener('change', onMotionPreference);
    };
  }, []);

  useEffect(() => {
    if (!stage || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setInViewport(entry?.isIntersecting ?? false));
    observer.observe(stage);
    return () => observer.disconnect();
  }, [stage]);

  return { mode, setMode, enabled: mode !== 'off', reduced: mode === 'reduced', visible: pageVisible && inViewport };
}
