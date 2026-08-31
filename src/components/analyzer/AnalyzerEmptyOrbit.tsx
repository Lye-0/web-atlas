import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react';

const AnalyzerEmptyOrbitScene = lazy(() => import('./AnalyzerEmptyOrbitScene'));

function supportsWebGl(): boolean {
  if (typeof document === 'undefined') return false;

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('webgl2') || canvas.getContext('webgl');
  const loseContext = context?.getExtension('WEBGL_lose_context');
  loseContext?.loseContext();
  return Boolean(context);
}

function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ));

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = () => setReducedMotion(media.matches);

    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  return reducedMotion;
}

function AnalyzerOrbitFallback() {
  return (
    <div className="analyzer-orbit-fallback">
      <span />
      <span />
      <span />
    </div>
  );
}

class AnalyzerOrbitErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? <AnalyzerOrbitFallback /> : this.props.children;
  }
}

export function AnalyzerEmptyOrbit() {
  const [webGlAvailable] = useState(supportsWebGl);
  const reducedMotion = useReducedMotion();

  return (
    <div className="analyzer-empty-orbit" aria-hidden="true">
      <span className="analyzer-empty-orbit-glow" />
      {webGlAvailable ? (
        <AnalyzerOrbitErrorBoundary>
          <Suspense fallback={<AnalyzerOrbitFallback />}>
            <AnalyzerEmptyOrbitScene reducedMotion={reducedMotion} />
          </Suspense>
        </AnalyzerOrbitErrorBoundary>
      ) : (
        <AnalyzerOrbitFallback />
      )}
    </div>
  );
}
