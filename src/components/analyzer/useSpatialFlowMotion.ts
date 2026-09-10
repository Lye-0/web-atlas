import { useContext, useEffect, useState } from 'react';

import { analyzerSessionContext } from '../../analyzer/sessionContext';

export type SpatialParticleMode = 'normal' | 'reduced' | 'off';

export function useSpatialFlowMotion(stage: HTMLElement | null, controlled?: { mode?: SpatialParticleMode; onChange: (mode: SpatialParticleMode) => void }) {
  const session = useContext(analyzerSessionContext);
  const [localMode, setLocalMode] = useState<SpatialParticleMode>(() =>
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'reduced' : 'normal');
  const mode = session?.state.particleMode ?? controlled?.mode ?? localMode;
  const setMode = session?.setParticleMode ?? controlled?.onChange ?? setLocalMode;
  const [pageVisible, setPageVisible] = useState(() => !document.hidden);
  const [reduceMotion, setReduceMotion] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const [inViewport, setInViewport] = useState(true);

  useEffect(() => {
    const onVisibility = () => setPageVisible(!document.hidden);
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const onMotionPreference = () => {
      setReduceMotion(media?.matches ?? false);
      setLocalMode(current => current === 'off' ? current : media?.matches ? 'reduced' : 'normal');
    };
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

  return { mode, setMode, enabled: mode !== 'off', reduced: mode === 'reduced' || reduceMotion, visible: pageVisible && inViewport };
}
