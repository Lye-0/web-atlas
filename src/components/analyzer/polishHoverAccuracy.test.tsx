import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SemanticGraph } from '../../analyzer/semantic/types';
import type { FlowLabelPlacement } from './semanticFlowLabels';
import { SemanticFlow3D } from './SemanticFlow3D';
import { useSemanticFlowHover } from './useSemanticFlowHover';
import { useSemanticFlowHoverBindings } from './semanticFlowHoverBindings';
import type { SemanticFlowHoverHandler } from '../../analyzer/semantic/flowRelationInteraction';

const scene = vi.hoisted(() => ({ current: {} as { onLabels: (labels: FlowLabelPlacement[]) => void } }));
vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children: ReactElement }) => { scene.current = children.props as typeof scene.current; return <div data-testid="canvas" />; },
  useFrame: vi.fn(), useThree: vi.fn(),
}));
const graph: SemanticGraph = { view: 'function-call-flow', nodes: ['caller', 'peer', 'keyboard-peer'].map(id => ({ id, label: id, kind: 'function',
  group: 'Source', confidence: 'source', evidence: [], attributes: {}, path: `src/${id}.ts` })), edges: [
  { id: 'relation', source: 'caller', target: 'peer', kind: 'calls', label: 'calls', confidence: 'source', views: ['function-call-flow'], evidence: [] },
] };
const selectedIds = new Set(['caller']), matchIds = new Set<string>(), context = {};
const label: FlowLabelPlacement = { id: 'peer', label: 'peer', path: 'src/peer.ts', selected: false, match: false, x: 100, y: 200 };
const noop = () => {};
function Harness() {
  const hover = useSemanticFlowHover(context);
  return <><output>{hover.hoverTarget?.id ?? ''}</output><SemanticFlow3D graph={graph} selectedIds={selectedIds} matchIds={matchIds}
    motion={{ enabled: false, reduced: false, visible: true }} onCamera={noop} onSelect={noop} onSelectEdge={noop} onClear={noop} onUnavailable={noop}
    hoverTarget={hover.hoverTarget} onHoverTarget={hover.onHoverTarget} /></>;
}
function BindingRow({ id, handler }: { id: string; handler: SemanticFlowHoverHandler }) {
  const bindings = useSemanticFlowHoverBindings<HTMLButtonElement>(handler, { kind: 'node', id });
  return <button {...bindings} data-peer={id}>{id}</button>;
}
function BindingHarness() {
  const hover = useSemanticFlowHover(context);
  return <><output>{hover.hoverTarget?.id ?? ''}</output>{['peer', 'keyboard-peer'].map(id => <BindingRow key={id} id={id} handler={hover.onHoverTarget} />)}</>;
}

describe('independent mounted-label hover lifetime', () => {
  let host: HTMLDivElement, root: Root;
  beforeEach(async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    await act(async () => root.render(<Harness />));
  });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('releases shared keyboard emphasis when its focused 3D label is culled, and does not revive it when remounted', async () => {
    await act(async () => scene.current.onLabels([label]));
    await act(async () => host.querySelector<HTMLButtonElement>('[data-flow-label-id="peer"]')!.focus());
    expect(host.querySelector('output')!.textContent).toBe('peer');
    await act(async () => scene.current.onLabels([]));
    expect(host.querySelector('[data-flow-label-id="peer"]')).toBeNull();
    expect(host.querySelector('output')!.textContent).toBe('');
    await act(async () => scene.current.onLabels([label]));
    expect(host.querySelector('output')!.textContent).toBe('');
  });

  it('releases a pointer input acquired from a 3D label when that label is removed', async () => {
    await act(async () => scene.current.onLabels([label]));
    // Browser layout/scroll can emit entry under a parked pointer. Acquisition now
    // requires actual button-free movement; the original removal assertion is unchanged.
    await act(async () => {
      const button = host.querySelector<HTMLButtonElement>('[data-flow-label-id="peer"]')!;
      button.dispatchEvent(new MouseEvent('pointerover', { bubbles: true, clientX: 100, clientY: 200 }));
      button.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, buttons: 0, clientX: 101, clientY: 200 }));
    });
    expect(host.querySelector('output')!.textContent).toBe('peer');
    await act(async () => scene.current.onLabels([]));
    expect(host.querySelector('[data-flow-label-id="peer"]')).toBeNull();
    expect(host.querySelector('output')!.textContent).toBe('');
  });

  it.each(['3d', 'shared-row'])('keeps keyboard focus through layout-only entry and switches only for genuine pointer motion (%s)', async surface => {
    if (surface === '3d') await act(async () => scene.current.onLabels([label, { ...label, id: 'keyboard-peer', x: 400 }]));
    else await act(async () => root.render(<BindingHarness />));
    const selector = surface === '3d' ? 'data-flow-label-id' : 'data-peer';
    const peer = host.querySelector<HTMLButtonElement>(`[${selector}="peer"]`)!;
    const keyboard = host.querySelector<HTMLButtonElement>(`[${selector}="keyboard-peer"]`)!;
    await act(async () => keyboard.focus());
    expect(host.querySelector('output')!.textContent).toBe('keyboard-peer');
    await act(async () => peer.dispatchEvent(new MouseEvent('pointerover', { bubbles: true, clientX: 100, clientY: 200 })));
    expect(host.querySelector('output')!.textContent).toBe('keyboard-peer');
    await act(async () => peer.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, buttons: 1, clientX: 101, clientY: 200 })));
    expect(host.querySelector('output')!.textContent).toBe('keyboard-peer');
    await act(async () => peer.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, buttons: 0, clientX: 102, clientY: 200 })));
    expect(host.querySelector('output')!.textContent).toBe('peer');
    vi.useFakeTimers();
    await act(async () => peer.dispatchEvent(new MouseEvent('pointerout', { bubbles: true })));
    await act(async () => vi.advanceTimersByTime(150));
    expect(host.querySelector('output')!.textContent).toBe('keyboard-peer');
  });
});
