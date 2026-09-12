import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { AnalyzerSessionProvider } from '../../analyzer/sessionProvider';
import { useSpatialFlowMotion } from './useSpatialFlowMotion';

afterEach(() => vi.unstubAllGlobals());

it('shares the explicit setting while respecting reduced motion and disposing visibility listeners', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const listeners = new Set<() => void>();
  let matches = false;
  vi.stubGlobal('matchMedia', () => ({ get matches() { return matches; }, addEventListener: (_: string, callback: () => void) => listeners.add(callback), removeEventListener: (_: string, callback: () => void) => listeners.delete(callback) }));
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  function Probe() {
    const flow = useSpatialFlowMotion(null);
    return <><output>{JSON.stringify({ mode: flow.mode, enabled: flow.enabled, reduced: flow.reduced, visible: flow.visible })}</output><button onClick={() => flow.setMode('off')}>off</button><button onClick={() => flow.setMode('normal')}>normal</button></>;
  }
  const render = (key: string) => act(async () => root.render(<AnalyzerSessionProvider><Probe key={key} /></AnalyzerSessionProvider>));
  const current = () => JSON.parse(host.querySelector('output')!.textContent!);
  try {
    await render('tab1'); expect(current().mode).toBe('normal');
    await act(async () => host.querySelector<HTMLButtonElement>('button')!.click());
    await render('tab5'); expect(current()).toMatchObject({ mode: 'off', enabled: false }); expect(listeners.size).toBe(1);
    await act(async () => { matches = true; listeners.forEach(callback => callback()); });
    expect(current()).toMatchObject({ mode: 'off', enabled: false, reduced: true });
    await act(async () => host.querySelectorAll<HTMLButtonElement>('button')[1]!.click());
    expect(current()).toMatchObject({ mode: 'normal', enabled: true, reduced: true });
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    expect(current().visible).toBe(false); hidden.mockRestore();
  } finally { await act(async () => root.unmount()); host.remove(); }
  expect(listeners.size).toBe(0);
});
