import { describe, expect, it, vi } from 'vitest';
import type { RootState } from '@react-three/fiber';
import { initializeSemanticCanvas, guardDetachedCanvasEvents } from './semanticCanvasLifecycle';

describe('semantic canvas lifecycle', () => {
  it('ignores a cleared DOM ref while retaining real event connection and disposal', () => {
    const connect=vi.fn(),disconnect=vi.fn();
    const manager=guardDetachedCanvasEvents({enabled:true,priority:1,connect,disconnect});
    manager.connect!(null as unknown as HTMLElement);
    expect(connect).not.toHaveBeenCalled();
    const element=document.createElement('canvas');manager.connect!(element);manager.disconnect!();
    expect(connect).toHaveBeenCalledWith(element);expect(disconnect).toHaveBeenCalledOnce();
  });
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
