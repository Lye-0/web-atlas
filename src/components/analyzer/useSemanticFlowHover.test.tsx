import { act, type HTMLAttributes } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSemanticFlowHover } from './useSemanticFlowHover';
import { useSemanticFlowHoverBindings } from './semanticFlowHoverBindings';
import type { SemanticFlowHoverHandler } from '../../analyzer/semantic/flowRelationInteraction';

describe('shared flow hover input ownership', () => {
  let host: HTMLDivElement, root: Root, controls: ReturnType<typeof useSemanticFlowHover>;
  function Harness({ context }: { context: object }) { controls = useSemanticFlowHover(context); return <output>{controls.hoverTarget?.id ?? ''}</output>; }
  beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
  const input = async (id: string | undefined, source: string, modality: 'pointer' | 'focus' = 'pointer') => act(async () => controls.onHoverTarget(id ? { kind: 'node', id } : undefined, { source, modality }));

  it('ignores delayed 3D leave after the same counterpart gains detail hover, then restores keyboard focus', async () => {
    await act(async () => root.render(<Harness context={{}} />));
    await input('keyboard-peer', 'label', 'focus');
    await input('same-peer', '3d-pointer');
    await input('same-peer', 'detail-row');
    await input(undefined, '3d-pointer');
    expect(host.textContent).toBe('same-peer');
    await input(undefined, 'detail-row');
    expect(host.textContent).toBe('keyboard-peer');
    await input(undefined, 'label', 'focus');
    expect(host.textContent).toBe('');
  });

  it('clears old graph inputs and rejects callbacks from an earlier selection/view even after revisiting it', async () => {
    await act(async () => root.render(<Harness context={{ view: 'call', selected: 'a' }} />));
    const oldHandler = controls!.onHoverTarget;
    await input('first', 'detail-row');
    await act(async () => root.render(<Harness context={{ view: 'runtime', selected: 'b' }} />));
    expect(host.textContent).toBe('');
    await input('current', 'detail-row');
    await act(async () => oldHandler(undefined, { source: 'detail-row', modality: 'pointer' }));
    expect(host.textContent).toBe('current');
    await act(async () => root.render(<Harness context={{ view: 'call', selected: 'a' }} />));
    await act(async () => oldHandler({ kind: 'node', id: 'first' }));
    expect(host.textContent).toBe('');
    await input('current-again', 'new');
    await act(async () => controls.clearHover());
    expect(host.textContent).toBe('');
  });

  it('lets keyboard focus identify another counterpart while the pointer is parked on an older one', async () => {
    await act(async () => root.render(<Harness context={{}} />));
    await input('pointer-peer', 'detail-pointer');
    await input('keyboard-peer', 'label-focus', 'focus');
    expect(host.textContent).toBe('keyboard-peer');
    await input(undefined, 'label-focus', 'focus');
    expect(host.textContent).toBe('pointer-peer');
    await input('keyboard-peer', 'label-focus', 'focus');
    await input('new-pointer-peer', 'new-detail-pointer');
    expect(host.textContent).toBe('new-pointer-peer');
    await input(undefined, 'new-detail-pointer');
    expect(host.textContent).toBe('keyboard-peer');
  });

  it('keeps a sibling row active when an identical counterpart row unmounts and clears a removed focused row', async () => {
    const context = {}, bindings = new Map<string, HTMLAttributes<HTMLButtonElement>>();
    function Row({ name, handler }: { name: string; handler: SemanticFlowHoverHandler }) {
      const props = useSemanticFlowHoverBindings<HTMLButtonElement>(handler, { kind: 'node', id: 'peer' }, 'detail-peer');
      bindings.set(name, props); return <button {...props}>{name}</button>;
    }
    function Rows({ first = true, second = true }: { first?: boolean; second?: boolean }) {
      controls = useSemanticFlowHover(context);
      return <><output>{controls.hoverTarget?.id ?? ''}</output>{first && <Row key="one" name="one" handler={controls.onHoverTarget} />}{second && <Row key="two" name="two" handler={controls.onHoverTarget} />}</>;
    }
    const enter = (name: string, event: 'onFocus' | 'onPointerMove') => act(async () => bindings.get(name)?.[event]?.({ buttons: 0 } as never));
    await act(async () => root.render(<Rows />));
    await enter('one', 'onPointerMove'); await enter('two', 'onPointerMove');
    await act(async () => root.render(<Rows first={false} />));
    expect(host.querySelector('output')?.textContent).toBe('peer');
    await enter('two', 'onFocus');
    await act(async () => root.render(<Rows first={false} second={false} />));
    expect(host.querySelector('output')?.textContent).toBe('');
  });

  it('retains keyboard emphasis through layout-generated pointer entry until an unpressed pointer moves', async () => {
    const context = {};
    function Row({ id, handler }: { id: string; handler: SemanticFlowHoverHandler }) {
      const bindings = useSemanticFlowHoverBindings<HTMLButtonElement>(handler, { kind: 'node', id }, 'detail-row');
      return <button data-peer={id} {...bindings}>{id}</button>;
    }
    function Rows() {
      controls = useSemanticFlowHover(context);
      return <><output>{controls.hoverTarget?.id ?? ''}</output><Row id="focused" handler={controls.onHoverTarget} /><Row id="under-pointer" handler={controls.onHoverTarget} /></>;
    }
    await act(async () => root.render(<Rows />));
    const focused = host.querySelector<HTMLButtonElement>('[data-peer="focused"]')!, other = host.querySelector('[data-peer="under-pointer"]')!;
    await act(async () => focused.focus());
    await act(async () => other.dispatchEvent(new MouseEvent('pointerover', { bubbles: true })));
    expect(host.querySelector('output')?.textContent).toBe('focused');
    await act(async () => other.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, buttons: 1 })));
    expect(host.querySelector('output')?.textContent).toBe('focused');
    await act(async () => other.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, buttons: 0 })));
    expect(host.querySelector('output')?.textContent).toBe('under-pointer');
    await act(async () => other.dispatchEvent(new MouseEvent('pointerout', { bubbles: true, relatedTarget: host })));
    expect(host.querySelector('output')?.textContent).toBe('focused');
  });
});
