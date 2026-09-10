import { useLayoutEffect, useState } from 'react';

/** R3F tears down its separate React root after the DOM canvas is removed.
 * OrbitControls resolves getRootNode() when disconnecting, so its document
 * listener must be removed while the canvas still belongs to that document. */
export function useCanvasDisposals() {
  const [disposals] = useState(() => new Set<() => void>());
  useLayoutEffect(() => () => {
    for (const dispose of [...disposals]) dispose();
  }, [disposals]);
  return disposals;
}

export function registerCanvasDisposal(disposals: Set<() => void>, cleanup: () => void) {
  const dispose = () => {
    if (!disposals.delete(dispose)) return;
    cleanup();
  };
  disposals.add(dispose);
  return dispose;
}
