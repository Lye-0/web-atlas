import { useLayoutEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
type FrameCallback = Parameters<typeof useFrame>[0];

// Keep this factory outside the hook/render scope. R3F retains its last frame
// subscription in module state, even after unsubscribing. The retained function
// must close over only this releasable cell, not a render's other captured values.
function frameProxy(cell: { current: FrameCallback | undefined }): FrameCallback {
  return (...args) => cell.current?.(...args);
}

export function useDisposableFrame(callback: FrameCallback, priority = 0) {
  const cell = useRef<FrameCallback | undefined>(undefined);
  const [proxy] = useState(() => frameProxy(cell));
  useLayoutEffect(() => { cell.current = callback; return () => { cell.current = undefined; }; }, [callback]);
  useFrame(proxy, priority);
}
