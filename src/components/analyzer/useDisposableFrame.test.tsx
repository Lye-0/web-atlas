import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { useFrame } from '@react-three/fiber';
import { useDisposableFrame } from './useDisposableFrame';
vi.mock('@react-three/fiber', () => ({ useFrame: vi.fn() }));
type FrameCallback = Parameters<typeof useFrame>[0];
function Subscriber({ callback }: { callback: FrameCallback }) { useDisposableFrame(callback); return null; }
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
it('updates a stable proxy and severs the retained subscription on unmount', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'), root = createRoot(host), first = vi.fn(), second = vi.fn();
  await act(async () => root.render(<Subscriber callback={first} />));
  const retained = vi.mocked(useFrame).mock.calls[0]![0];
  retained({} as Parameters<FrameCallback>[0], .016); expect(first).toHaveBeenCalledTimes(1);
  await act(async () => root.render(<Subscriber callback={second} />));
  expect(vi.mocked(useFrame).mock.calls.at(-1)![0]).toBe(retained);
  retained({} as Parameters<FrameCallback>[0], .016); expect(second).toHaveBeenCalledTimes(1);
  await act(async () => root.unmount());
  retained({} as Parameters<FrameCallback>[0], .016);
  expect(first).toHaveBeenCalledTimes(1); expect(second).toHaveBeenCalledTimes(1);
});
