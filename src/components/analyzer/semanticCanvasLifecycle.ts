import type { RootState } from '@react-three/fiber';

const ignoreCanvasPointerMiss = () => {};

function disposableXr(xr: RootState['xr']): RootState['xr'] {
  let current: RootState['xr'] | undefined = xr;
  return {
    connect: () => current?.connect(),
    disconnect: () => { const active = current; current = undefined; active?.disconnect(); },
  };
}

// Native hit testing owns blank-space selection. R3F retains its last root;
// Canvas's unused pointer wrapper and XR methods capture its parent render.
// Keep these factories outside the render scope and release XR after teardown.
export function initializeSemanticCanvas(state: RootState) {
  state.set({ onPointerMissed: ignoreCanvasPointerMiss, xr: disposableXr(state.xr) });
}
