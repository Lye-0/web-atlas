import { act, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { OrthographicCamera } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { registerCanvasDisposal, useCanvasDisposals } from './canvasDisposals';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('disconnects real OrbitControls from the document before a detached Canvas root cleans up', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const add = vi.spyOn(document, 'addEventListener'), remove = vi.spyOn(document, 'removeEventListener');
  const lateCleanup: (() => void)[] = [];
  function Graph() {
    const canvas = useRef<HTMLCanvasElement>(null), disposals = useCanvasDisposals();
    useEffect(() => {
      const control = new OrbitControls(new OrthographicCamera(), canvas.current!);
      const dispose = registerCanvasDisposal(disposals, () => control.dispose());
      // Simulate R3F's root living longer than its canvas DOM element.
      return () => { lateCleanup.push(dispose); };
    }, [disposals]);
    return <canvas ref={canvas} />;
  }
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  try {
    for (let cycle = 0; cycle < 3; cycle++) {
      await act(async () => root.render(<Graph />));
      const handler = add.mock.calls.filter(([type]) => type === 'keydown').at(-1)![1];
      const removedBeforeUnmount = remove.mock.calls.filter(([type, listener]) => type === 'keydown' && listener === handler).length;
      const canvas = host.querySelector('canvas')!;
      await act(async () => root.render(null));
      expect(canvas.isConnected).toBe(false);
      expect(remove.mock.calls.filter(([type, listener]) => type === 'keydown' && listener === handler)).toHaveLength(removedBeforeUnmount + 1);
      lateCleanup.splice(0).forEach(cleanup => cleanup());
      expect(remove.mock.calls.filter(([type, listener]) => type === 'keydown' && listener === handler)).toHaveLength(removedBeforeUnmount + 1);
    }
  } finally { await act(async () => root.unmount()); host.remove(); }
});
