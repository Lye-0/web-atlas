import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SemanticGraph } from '../../analyzer/semantic/types';
import { SemanticFlow2D } from './SemanticFlow2D';

const graph: SemanticGraph = { view: 'function-call-flow', nodes: ['a', 'b', 'c'].map(id => ({ id, label: id, kind: 'function', group: 'Source', path: `src/${id}.ts`, confidence: 'source', evidence: [], attributes: {} })),
  edges: [['a', 'b'], ['b', 'c'], ['a', 'c']].map(([source, target]) => ({ id: `${source}-${target}`, source: source!, target: target!, label: `${source} calls ${target}`, kind: 'calls', confidence: 'source', evidence: [], views: ['function-call-flow'] })) };

describe('semantic 2D drawing and selection layers', () => {
  let host: HTMLDivElement, root: Root;
  const onSelect = vi.fn(), onSelectEdge = vi.fn(), onClear = vi.fn();
  const render = (motion = { enabled: true, reduced: false, visible: true }) => act(async () => root.render(<SemanticFlow2D graph={graph} selectedIds={new Set(['a'])} matchIds={new Set()} camera={{ x: 130, y: 180, scale: .7 }}
    motion={motion} onCamera={() => {}} onSelect={onSelect} onSelectEdge={onSelectEdge} onClear={onClear} />));
  beforeEach(async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('ResizeObserver', class {
      constructor(private callback: ResizeObserverCallback) {}
      observe(target: Element) { this.callback([{ target, contentRect: { width: 1000, height: 700 } } as ResizeObserverEntry], this as unknown as ResizeObserver); }
      disconnect() {}
    });
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1)); vi.stubGlobal('cancelAnimationFrame', vi.fn());
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    await render();
  });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

  it('paints lines and particles above cards while leaving edge hit targets below cards', () => {
    expect([...host.querySelectorAll('[data-flow-layer]')].map(item => item.getAttribute('data-flow-layer'))).toEqual(['edge-targets', 'nodes', 'edges', 'particles']);
    const visual = host.querySelector('[data-flow-layer="edges"]')!, particles = host.querySelector('[data-flow-layer="particles"]')!;
    expect(visual.getAttribute('pointer-events')).toBe('none'); expect(particles.getAttribute('pointer-events')).toBe('none');
    expect([...visual.querySelectorAll('[data-edge-id]')].map(item => [item.getAttribute('data-edge-id'), item.getAttribute('data-source'), item.getAttribute('data-target')])).toEqual([['a-b', 'a', 'b'], ['b-c', 'b', 'c'], ['a-c', 'a', 'c']]);
    expect(particles.querySelectorAll('[data-flow-particle]')).toHaveLength(2);
    expect(visual.querySelectorAll('[marker-end]')).toHaveLength(3);
    expect(host.querySelectorAll('[data-node-id]')).toHaveLength(3);
  });

  it('uses the same smooth curve for the visible line, hit target and constant-spacing particles', () => {
    for (const id of ['a-b', 'a-c']) {
      const line = host.querySelector(`[data-edge-id="${id}"] > path`)!, particle = host.querySelector(`[data-particle-edge-id="${id}"]`)!;
      expect(line.getAttribute('d')).toContain(' C');
      expect(particle.getAttribute('d')).toBe(line.getAttribute('d'));
      expect(host.querySelector(`[data-edge-hit-id="${id}"]`)?.getAttribute('d')).toBe(line.getAttribute('d'));
      expect(particle.getAttribute('stroke-dasharray')).toBe('0 50');
      expect(particle.getAttribute('stroke-linecap')).toBe('round');
    }
    expect(host.querySelector('[data-particle-edge-id="a-b"]')?.getAttribute('d')).not.toBe(host.querySelector('[data-particle-edge-id="a-c"]')?.getAttribute('d'));
  });

  it('advances short and long connections by the same distance and supports reduced/off/hidden motion', async () => {
    const particles = [...host.querySelectorAll('[data-flow-particle]')];
    const offsets = () => particles.map(path => Number(path.getAttribute('stroke-dashoffset')));
    const before = offsets();
    await act(async () => vi.mocked(requestAnimationFrame).mock.calls.at(-1)![0](1000));
    await act(async () => vi.mocked(requestAnimationFrame).mock.calls.at(-1)![0](1100));
    offsets().forEach((offset, index) => expect(offset - before[index]!).toBeCloseTo(-6.5));
    await render({ enabled: true, reduced: true, visible: true });
    expect([...host.querySelectorAll('[data-flow-particle]')].every(path => path.getAttribute('stroke-dasharray') === '0 100')).toBe(true);
    await render({ enabled: false, reduced: false, visible: true });
    expect(host.querySelector('[data-flow-particle]')).toBeNull(); expect(cancelAnimationFrame).toHaveBeenCalled();
    await render({ enabled: true, reduced: false, visible: false });
    expect(host.querySelector('[data-flow-particle]')).toBeNull();
  });

  it('keeps canonical node and edge selection available through mouse and keyboard', async () => {
    const b = host.querySelector('[data-node-id="b"]')!, edge = host.querySelector('[data-edge-hit-id="a-c"]')!;
    await act(async () => b.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onSelect).toHaveBeenLastCalledWith('b'); expect(onSelectEdge).not.toHaveBeenCalled(); expect(onClear).not.toHaveBeenCalled();
    await act(async () => b.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(onSelect).toHaveBeenCalledTimes(2);
    await act(async () => edge.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onSelectEdge).toHaveBeenLastCalledWith('a-c');
    await act(async () => edge.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })));
    expect(onSelectEdge).toHaveBeenCalledTimes(2); expect(onClear).not.toHaveBeenCalled();
  });
});
