import { describe, expect, it, vi } from 'vitest';
import type { RootState } from '@react-three/fiber';
import { initializeSemanticCanvas } from './semanticCanvasLifecycle';

describe('semantic canvas lifecycle', () => {
  it('preserves XR teardown once and makes retained callbacks inert after disconnect', () => {
    const xr = { connect: vi.fn(), disconnect: vi.fn() };
    const state = { xr, set: vi.fn() } as unknown as RootState;
    initializeSemanticCanvas(state);
    const patch = vi.mocked(state.set).mock.calls[0][0] as Partial<RootState>;
    patch.xr!.connect();
    expect(xr.connect).toHaveBeenCalledOnce();
    patch.xr!.disconnect();
    patch.xr!.disconnect();
    patch.xr!.connect();
    expect(xr.disconnect).toHaveBeenCalledOnce();
    expect(xr.connect).toHaveBeenCalledOnce();
    expect(() => patch.onPointerMissed!(new MouseEvent('click'))).not.toThrow();
  });
});
