import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SemanticGraph } from '../../analyzer/semantic/types';
import { SemanticFlow2D } from './SemanticFlow2D';
import { layoutExplorerRelations } from '../../analyzer/semantic/semanticExplorer';
import { semanticFlowEdgePaths } from '../../analyzer/semantic/flowPresentation';

const graph: SemanticGraph = { view: 'function-call-flow', nodes: ['a', 'b', 'c'].map(id => ({ id, label: id, kind: 'function', group: 'Source', path: `src/${id}.ts`, confidence: 'source', evidence: [], attributes: {} })),
  edges: [['a', 'b'], ['b', 'c'], ['a', 'c']].map(([source, target]) => ({ id: `${source}-${target}`, source: source!, target: target!, label: `${source} calls ${target}`, kind: 'calls', confidence: 'source', evidence: [], views: ['function-call-flow'] })) };

describe('semantic 2D drawing and selection layers', () => {
  let host: HTMLDivElement, root: Root;
  let screenSize = { width: 1000, height: 700 };
  const onSelect = vi.fn(), onSelectEdge = vi.fn(), onClear = vi.fn();
  const render = (motion = { enabled: true, reduced: false, visible: true }) => act(async () => root.render(<SemanticFlow2D graph={graph} selectedIds={new Set(['a'])} matchIds={new Set()} camera={{ x: 130, y: 180, scale: .7 }}
    motion={motion} onCamera={() => {}} onSelect={onSelect} onSelectEdge={onSelectEdge} onClear={onClear} />));
  beforeEach(async () => {
    screenSize = { width: 1000, height: 700 };
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('ResizeObserver', class {
      constructor(private callback: ResizeObserverCallback) {}
      observe(target: Element) { this.callback([{ target, contentRect: screenSize } as ResizeObserverEntry], this as unknown as ResizeObserver); }
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

  it('pans the local diagram independently of selection and fits back from empty space', async () => {
    const main = host.querySelector('.semantic-flow-2d')!;
    const originalY = Number(main.getAttribute('data-camera-y'));
    await act(async () => main.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    expect(Number(main.getAttribute('data-camera-y'))).toBeCloseTo(originalY - 60);
    for (let index = 0; index < 20; index++) await act(async () => main.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    expect(main.getAttribute('data-explorer-center')).toBe('a');
    expect(host.querySelector('[data-node-id="a"]')).toBeNull(); expect(onClear).not.toHaveBeenCalled();
    await act(async () => main.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })));
    expect(host.querySelectorAll('[data-node-id]')).toHaveLength(3);
    expect(host.querySelector('[data-node-id="a"]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('starts a high-degree center at a readable scale, keeps every local edge on selection, and explicitly fits every curve', async () => {
    const dense: SemanticGraph = { ...graph, nodes: [graph.nodes[0]!, ...Array.from({ length: 160 }, (_, index) => ({ ...graph.nodes[1]!, id: `callee-${index}`, label: `callee-${index}` }))],
      edges: Array.from({ length: 160 }, (_, index) => ({ ...graph.edges[0]!, id: `call-${index}`, target: `callee-${index}` })) };
    const renderDense = (selected: string, fit = false) => act(async () => root.render(<SemanticFlow2D key="dense" graph={dense} selectedIds={new Set([selected])} matchIds={new Set()}
      location={{ scopeId: 'file', centerId: 'a', depth: 1, direction: 'both' }} command={fit ? { kind: 'fit', nonce: 1 } : undefined}
      motion={{ enabled: false, reduced: false, visible: true }} onCamera={() => {}} onSelect={onSelect} onSelectEdge={onSelectEdge} onClear={onClear} />));
    await renderDense('a');
    const camera = () => { const main = host.querySelector('.semantic-flow-2d')!; return ['data-camera-x', 'data-camera-y', 'data-camera-scale'].map(name => Number(main.getAttribute(name))); };
    const before = camera(); expect(before[2]).toBeGreaterThanOrEqual(.85);
    expect(host.querySelectorAll('[data-edge-id]')).toHaveLength(160);
    await renderDense('callee-0');
    expect(camera()).toEqual(before); expect(host.querySelector('.semantic-flow-2d')?.getAttribute('data-explorer-center')).toBe('a');
    expect(host.querySelectorAll('[data-edge-id]')).toHaveLength(160);
    await renderDense('callee-0', true);
    expect(host.querySelectorAll('[data-node-id]')).toHaveLength(161);
    const [x, y, scale] = camera() as [number, number, number];
    for (const path of semanticFlowEdgePaths(dense, layoutExplorerRelations(dense, 'a'), new Set(['callee-0']), undefined, '2d')) for (const point of path.points) {
      expect(point.x * scale + x).toBeGreaterThanOrEqual(0); expect(point.x * scale + x).toBeLessThanOrEqual(1000);
      expect(point.y * scale + y).toBeGreaterThanOrEqual(0); expect(point.y * scale + y).toBeLessThanOrEqual(700);
    }
  });

  it('initially contains a six-object local diagram below measured navigation at a readable scale', async () => {
    screenSize = { width: 841, height: 618 };
    const local: SemanticGraph = { ...graph, nodes: [graph.nodes[0]!, ...Array.from({ length: 5 }, (_, index) => ({ ...graph.nodes[1]!, id: `callee-${index}`, label: `callee-${index}` }))],
      edges: Array.from({ length: 5 }, (_, index) => ({ ...graph.edges[0]!, id: `call-${index}`, target: `callee-${index}` })) };
    await act(async () => root.render(<SemanticFlow2D key="six-objects" graph={local} selectedIds={new Set(['a'])} matchIds={new Set()} overlayTop={160}
      location={{ scopeId: 'file', centerId: 'a', depth: 1, direction: 'both' }} motion={{ enabled: false, reduced: false, visible: true }} onCamera={() => {}} onSelect={onSelect} onSelectEdge={onSelectEdge} onClear={onClear} />));
    const main = host.querySelector('.semantic-flow-2d')!;
    const scale = Number(main.getAttribute('data-camera-scale')), x = Number(main.getAttribute('data-camera-x')), y = Number(main.getAttribute('data-camera-y'));
    expect(scale).toBeGreaterThanOrEqual(.8); expect(scale).toBeLessThanOrEqual(1.05);
    expect(host.querySelectorAll('[data-node-id]')).toHaveLength(6);
    for (const point of layoutExplorerRelations(local, 'a')) {
      expect((point.x - 111) * scale + x).toBeGreaterThanOrEqual(0); expect((point.x + 111) * scale + x).toBeLessThanOrEqual(841);
      expect((point.y - 35) * scale + y).toBeGreaterThanOrEqual(160); expect((point.y + 35) * scale + y).toBeLessThanOrEqual(618 - 76);
    }
  });
});
