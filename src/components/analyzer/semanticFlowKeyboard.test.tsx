import { act, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { bindSemanticFlowKeyboard } from './semanticFlowKeyboard';
import { useWorkspaceFullscreen } from './useWorkspaceFullscreen';

function KeyboardFixture({ cleared }: { cleared: () => void }) {
  const fullscreen = useWorkspaceFullscreen(true), canvas = useRef<HTMLCanvasElement>(null), [selected, setSelected] = useState(true);
  useEffect(() => bindSemanticFlowKeyboard(canvas.current!, () => { setSelected(false); cleared(); }), [cleared]);
  return <div ref={fullscreen.root} onKeyDownCapture={fullscreen.onKeyDownCapture} data-fullscreen={fullscreen.isFullscreen} data-selected={selected}>
    <button onClick={() => void fullscreen.toggle()}>Fullscreen</button><button onClick={() => setSelected(true)}>Select</button>
    <canvas ref={canvas} tabIndex={0} /><input aria-label="text input" />
  </div>;
}

describe('3D canvas Escape lifecycle', () => {
  it('clears only a normal focused canvas, lets fullscreen capture preserve selection, and ignores IME/input', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const host = document.createElement('div'); document.body.append(host); const root = createRoot(host), cleared = vi.fn();
    let mounted = true;
    try {
      await act(async () => root.render(<KeyboardFixture cleared={cleared} />));
      const canvas = host.querySelector('canvas')!, workspace = host.firstElementChild!;
      const key = (event: KeyboardEventInit = {}) => act(async () => canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true, ...event })));
      canvas.focus(); await key(); expect(workspace.getAttribute('data-selected')).toBe('false'); expect(cleared).toHaveBeenCalledTimes(1);
      await act(async () => host.querySelectorAll<HTMLButtonElement>('button')[1]!.click());
      canvas.focus(); await key({ isComposing: true }); await key({ keyCode: 229 });
      expect(workspace.getAttribute('data-selected')).toBe('true'); expect(cleared).toHaveBeenCalledTimes(1);
      await act(async () => { const input = host.querySelector('input')!; input.focus(); input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
      expect(cleared).toHaveBeenCalledTimes(1);
      await act(async () => host.querySelector<HTMLButtonElement>('button')!.click());
      expect(workspace.getAttribute('data-fullscreen')).toBe('true');
      canvas.focus(); await key();
      expect(workspace.getAttribute('data-fullscreen')).toBe('false'); expect(workspace.getAttribute('data-selected')).toBe('true'); expect(cleared).toHaveBeenCalledTimes(1);
      canvas.focus(); await key(); expect(workspace.getAttribute('data-selected')).toBe('false'); expect(cleared).toHaveBeenCalledTimes(2);
      await act(async () => root.unmount()); mounted = false;
      canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); expect(cleared).toHaveBeenCalledTimes(2);
    } finally { if (mounted) await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
  });
});
