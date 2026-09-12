import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SemanticGraph } from '../../analyzer/semantic/types';
import { SemanticFlow2D } from './SemanticFlow2D';
import { buildSemanticExplorer, explorerLocationForNode, layoutExplorerRelations } from '../../analyzer/semantic/semanticExplorer';
import { semanticFlowEdgePaths } from '../../analyzer/semantic/flowPresentation';

const graph: SemanticGraph = { view: 'function-call-flow', nodes: ['a', 'b', 'c'].map(id => ({ id, label: id, kind: 'function', group: 'Source', path: `src/${id}.ts`, confidence: 'source', evidence: [], attributes: {} })),
  edges: [['a', 'b'], ['b', 'c'], ['a', 'c']].map(([source, target]) => ({ id: `${source}-${target}`, source: source!, target: target!, label: `${source} calls ${target}`, kind: 'calls', confidence: 'source', evidence: [], views: ['function-call-flow'] })) };

describe('semantic 2D drawing and selection layers', () => {
  let host: HTMLDivElement, root: Root;
  let screenSize = { width: 1000, height: 700 };
  const onSelect = vi.fn(), onSelectEdge = vi.fn(), onClear = vi.fn(), onCamera = vi.fn(), onHoverTarget = vi.fn();
  const render = (motion = { enabled: true, reduced: false, visible: true }, extras: Partial<ComponentProps<typeof SemanticFlow2D>> = {}) => act(async () => root.render(<SemanticFlow2D graph={graph} selectedIds={new Set(['a'])} matchIds={new Set()} camera={{ x: 130, y: 180, scale: .7 }}
    motion={motion} onCamera={onCamera} onSelect={onSelect} onSelectEdge={onSelectEdge} onClear={onClear} onHoverTarget={onHoverTarget} {...extras} />));
  beforeEach(async () => {
    screenSize = { width: 1000, height: 700 };
    Object.defineProperty(SVGElement.prototype, 'getTotalLength', { configurable: true, value() { return this.getAttribute('data-particle-route') === 'a-b' ? 100 : 200; } });
    Object.defineProperty(SVGElement.prototype, 'getPointAtLength', { configurable: true, value(x: number) { return { x, y: 0 }; } });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ createImageData: () => ({ data: new Uint8ClampedArray(76 * 48 * 4) }), putImageData: vi.fn() } as unknown as ReturnType<HTMLCanvasElement['getContext']>);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,fixture');
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
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllMocks(); vi.restoreAllMocks(); vi.unstubAllGlobals(); Reflect.deleteProperty(SVGElement.prototype, 'getTotalLength'); Reflect.deleteProperty(SVGElement.prototype, 'getPointAtLength'); });

  it('paints lines and particles above cards while leaving edge hit targets below cards', () => {
    expect([...host.querySelectorAll('[data-flow-layer]')].map(item => item.getAttribute('data-flow-layer'))).toEqual(['edge-targets', 'nodes', 'edges', 'particles']);
    const visual = host.querySelector('[data-flow-layer="edges"]')!, particles = host.querySelector('[data-flow-layer="particles"]')!;
    expect(visual.getAttribute('pointer-events')).toBe('none'); expect(particles.getAttribute('pointer-events')).toBe('none');
    expect([...visual.querySelectorAll('[data-edge-id]')].map(item => [item.getAttribute('data-edge-id'), item.getAttribute('data-source'), item.getAttribute('data-target')])).toEqual([['a-b', 'a', 'b'], ['b-c', 'b', 'c'], ['a-c', 'a', 'c']]);
    expect(particles.querySelectorAll('[data-particle-route]')).toHaveLength(2);
    expect(particles.querySelectorAll('image[data-flow-particle]')).toHaveLength(6);
    expect(visual.querySelectorAll('[marker-end]')).toHaveLength(3);
    expect(host.querySelectorAll('[data-node-id]')).toHaveLength(3);
  });

  it('uses the same smooth curve for the visible line, hit target and constant-spacing particles', () => {
    for (const id of ['a-b', 'a-c']) {
      const line = host.querySelector(`[data-edge-id="${id}"] > path`)!, particle = host.querySelector(`[data-particle-route="${id}"]`)!;
      expect(line.getAttribute('d')).toContain(' C');
      expect(particle.getAttribute('d')).toBe(line.getAttribute('d'));
      expect(host.querySelector(`[data-edge-hit-id="${id}"]`)?.getAttribute('d')).toBe(line.getAttribute('d'));
      expect(host.querySelector(`[data-particle-edge-id="${id}"]`)?.getAttribute('width')).toBe('19');
    }
    expect(host.querySelector('[data-particle-route="a-b"]')?.getAttribute('d')).not.toBe(host.querySelector('[data-particle-route="a-c"]')?.getAttribute('d'));
  });

  it('advances short and long connections by the same distance and supports reduced/off/hidden motion', async () => {
    const particles = [...host.querySelectorAll('[data-flow-particle]')];
    const offsets = () => particles.map(path => Number(path.getAttribute('transform')?.match(/translate\(([^ ]+)/)?.[1]));
    await act(async () => vi.mocked(requestAnimationFrame).mock.calls.at(-1)![0](1000));
    const before = offsets();
    await act(async () => vi.mocked(requestAnimationFrame).mock.calls.at(-1)![0](1100));
    offsets().forEach((offset, index) => expect((offset - before[index]! + 50) % 50).toBeCloseTo(6.5));
    await render({ enabled: true, reduced: true, visible: true });
    expect(host.querySelectorAll('[data-flow-particle]')).toHaveLength(3);
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

  it('isolates peer relations with paint alone while every card, curve, port, marker and camera stays fixed', async () => {
    const nodeGeometry = () => [...host.querySelectorAll('[data-node-id]')].map(item => ({ id: item.getAttribute('data-node-id'), transform: item.getAttribute('transform'),
      rects: [...item.querySelectorAll('rect')].map(rect => ['x', 'y', 'width', 'height', 'rx'].map(name => rect.getAttribute(name))),
      caption: [...item.querySelectorAll('foreignObject')].map(rect => ['x', 'y', 'width', 'height'].map(name => rect.getAttribute(name))),
    }));
    const lineGeometry = () => new Map([...host.querySelectorAll('[data-edge-id]')].map(item => [item.getAttribute('data-edge-id'), ['d', 'stroke-width', 'marker-end', 'stroke'].map(name => item.querySelector('path')!.getAttribute(name))]));
    const beforeNodes = nodeGeometry(), beforeLines = lineGeometry(), markers = host.querySelector('defs')!.innerHTML;
    for (const item of beforeNodes) { expect(item.rects[0]).toEqual(['-106', '-30', '212', '60', '7']); expect(item.caption[0]).toEqual(['-94', '-23', '188', '48']); }
    onCamera.mockClear();
    await render(undefined, { hoverTarget: { kind: 'node', id: 'b' } });
    expect(nodeGeometry()).toEqual(beforeNodes); expect(lineGeometry()).toEqual(beforeLines); expect(host.querySelector('defs')!.innerHTML).toBe(markers);
    expect(host.querySelectorAll('[data-edge-id]')).toHaveLength(3);
    expect(host.querySelector('[data-edge-id="a-b"]')?.getAttribute('data-flow-emphasized')).toBe('true');
    expect(host.querySelector('[data-edge-id="a-c"]')?.getAttribute('opacity')).toBe('0.18');
    expect(host.querySelector('[data-node-id="b"]')?.getAttribute('data-flow-role')).toBe('outgoing');
    expect(host.querySelector('[data-node-id="b"] small')?.textContent).toContain('呼び出し先');
    await render({ enabled: false, reduced: false, visible: true }, { hoverTarget: { kind: 'edge', id: 'a-c' }, direction: 'outgoing' });
    expect(nodeGeometry()).toEqual(beforeNodes); expect(host.querySelector('defs')!.innerHTML).toBe(markers);
    for (const [id, geometry] of lineGeometry()) expect(geometry).toEqual(beforeLines.get(id));
    expect(host.querySelector('[data-flow-particle]')).toBeNull(); expect(onCamera).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled(); expect(onSelectEdge).not.toHaveBeenCalled();
  });

  it('publishes exact node and edge IDs with independently releasable pointer and focus owners', async () => {
    const b = host.querySelector('[data-node-id="b"]')!, edge = host.querySelector('[data-edge-hit-id="a-c"]')!;
    await act(async () => { b.dispatchEvent(new MouseEvent('pointerover', { bubbles: true })); b.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, buttons: 0 })); });
    expect(onHoverTarget).toHaveBeenLastCalledWith({ kind: 'node', id: 'b' }, { source: '2d-node:b', modality: 'pointer' });
    await act(async () => edge.dispatchEvent(new FocusEvent('focusin', { bubbles: true })));
    expect(onHoverTarget).toHaveBeenLastCalledWith({ kind: 'edge', id: 'a-c' }, { source: '2d-edge:a-c', modality: 'focus' });
    await act(async () => b.dispatchEvent(new MouseEvent('pointerout', { bubbles: true })));
    expect(onHoverTarget).toHaveBeenLastCalledWith(undefined, { source: '2d-node:b', modality: 'pointer' });
    await act(async () => edge.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    expect(onHoverTarget).toHaveBeenLastCalledWith(undefined, { source: '2d-edge:a-c', modality: 'focus' });
    expect(onSelect).not.toHaveBeenCalled(); expect(onSelectEdge).not.toHaveBeenCalled();
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

describe('local relation entry readiness', () => {
  let host: HTMLDivElement, root: Root;
  let measured = { width: 0, height: 0 };
  const observers: { callback: ResizeObserverCallback; target?: Element; disconnect: ReturnType<typeof vi.fn> }[] = [];
  const onCamera = vi.fn();
  const show = (visitId: string, centerId = 'a', extras: Partial<ComponentProps<typeof SemanticFlow2D>> = {}) => act(async () => root.render(
    <SemanticFlow2D graph={graph} visitId={visitId} location={{ scopeId: 'file', centerId, depth: 1, direction: 'both' }} selectedIds={new Set([centerId])} matchIds={new Set()}
      motion={{ enabled: false, reduced: false, visible: true }} onCamera={onCamera} onSelect={() => {}} onSelectEdge={() => {}} onClear={() => {}} {...extras} />,
  ));
  const deliver = (index: number, width = 1000, height = 700) => act(async () => {
    const observer = observers[index]!;
    observer.callback([{ target: observer.target, contentRect: { width, height } } as ResizeObserverEntry], observer as unknown as ResizeObserver);
  });
  const camera = () => ['data-camera-x', 'data-camera-y', 'data-camera-scale'].map(name => Number(host.querySelector('.semantic-flow-2d')!.getAttribute(name)));
  beforeEach(() => {
    measured = { width: 0, height: 0 }; observers.length = 0;
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ ...measured, x: 0, y: 0, top: 0, left: 0, right: measured.width, bottom: measured.height, toJSON: () => ({}) }));
    vi.stubGlobal('ResizeObserver', class {
      entry: typeof observers[number];
      constructor(callback: ResizeObserverCallback) { this.entry = { callback, disconnect: vi.fn() }; observers.push(this.entry); }
      observe(target: Element) { this.entry.target = target; }
      disconnect() { this.entry.disconnect(); }
    });
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1)); vi.stubGlobal('cancelAnimationFrame', vi.fn());
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllMocks(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('draws the first relation frame using actual dimensions before any resize delivery', async () => {
    measured = { width: 841, height: 618 };
    await show('first');
    expect(observers).toHaveLength(1);
    expect(host.querySelector('.semantic-flow-2d')!.getAttribute('data-render-state')).toBe('ready');
    expect(host.querySelector('[role="status"]')).toBeNull();
    expect(host.querySelectorAll('[data-node-id]')).toHaveLength(3);
    expect(camera()).not.toEqual([100, 100, 1]);
    expect(onCamera).toHaveBeenCalledTimes(1);
    expect(onCamera).toHaveBeenLastCalledWith({ x: camera()[0], y: camera()[1], scale: camera()[2] });
  });

  it('explains a genuinely unmeasured nonempty graph and never persists its placeholder camera', async () => {
    await show('deferred');
    const svg = host.querySelector('.semantic-flow-2d')!;
    expect(svg.getAttribute('aria-busy')).toBe('true');
    expect(svg.getAttribute('data-node-count')).toBe('3');
    expect(host.querySelectorAll('[data-node-id]')).toHaveLength(0);
    expect(host.querySelector('[role="status"]')?.textContent).toBe('関係を表示しています…');
    expect(onCamera).not.toHaveBeenCalled();
    await deliver(0);
    expect(svg.getAttribute('aria-busy')).toBe('false');
    expect(host.querySelectorAll('[data-node-id]')).toHaveLength(3);
    expect(host.querySelector('[role="status"]')).toBeNull();
    expect(onCamera).toHaveBeenCalledTimes(1);
  });

  it('ignores an old visit resize result during rapid center changes', async () => {
    await show('first', 'a');
    await show('second', 'b');
    await show('third', 'c');
    expect(observers).toHaveLength(3);
    expect(observers[0]!.disconnect).toHaveBeenCalledOnce(); expect(observers[1]!.disconnect).toHaveBeenCalledOnce();
    await deliver(0); await deliver(1);
    expect(host.querySelector('.semantic-flow-2d')!.getAttribute('data-explorer-center')).toBe('c');
    expect(host.querySelector('[role="status"]')).not.toBeNull();
    expect(onCamera).not.toHaveBeenCalled();
    await deliver(2);
    const latest = camera();
    await deliver(0, 2000, 1400);
    expect(camera()).toEqual(latest);
    expect(host.querySelector('.semantic-flow-2d')!.getAttribute('data-explorer-center')).toBe('c');
    expect(onCamera).toHaveBeenCalledTimes(1);
  });

  it('applies a pending focus once dimensions and initial camera are ready', async () => {
    const command = { kind: 'focus' as const, nonce: 1, ids: ['c'] };
    await show('focus', 'a', { command });
    await deliver(0);
    const [x, , scale] = camera() as [number, number, number];
    const target = layoutExplorerRelations(graph, 'a').find(point => point.node.id === 'c')!;
    expect(scale).toBe(1.45);
    expect(target.x * scale + x).toBeCloseTo(500);
    const focused = camera();
    await show('focus', 'a', { command, selectedIds: new Set(['b']) });
    expect(camera()).toEqual(focused);
  });

  it('restores saved panning without automatic Fit even when the saved view contains no nodes', async () => {
    measured = { width: 1000, height: 700 };
    const saved = { x: -10000, y: -10000, scale: .73 };
    await show('restored', 'a', { camera: saved });
    expect(camera()).toEqual([saved.x, saved.y, saved.scale]);
    expect(host.querySelector('.semantic-flow-2d')!.getAttribute('data-render-state')).toBe('ready');
    expect(host.querySelectorAll('[data-node-id]')).toHaveLength(0);
    expect(host.querySelector('[role="status"]')).toBeNull();
    await deliver(0);
    expect(camera()).toEqual([saved.x, saved.y, saved.scale]);
  });

  it('distinguishes an empty filtered result from pending measurement', async () => {
    await show('empty', 'a', { graph: { ...graph, nodes: [], edges: [] } });
    expect(host.querySelector('[role="status"]')).toBeNull();
    expect(host.querySelector('.semantic-empty-result h3')?.textContent).toBe('表示する対象がありません');
    expect(onCamera).not.toHaveBeenCalled();
  });

  it('uses human display names in both file blocks and relation cards while selection still receives canonical IDs', async () => {
    measured = { width: 1000, height: 700 };
    const path = 'scripts/build-extension.mjs';
    const initializer = { ...graph.nodes[0]!, id: 'function:scripts/build-extension.mjs:0:<module>', label: '<module>', path, attributes: { initializer: true } };
    const callee = 'plugins.filter(plugin => { return plugin.enabled && plugin.matches({ phase: "build" }); }).map';
    const external = { ...graph.nodes[1]!, id: 'external:recorded', label: callee, kind: 'external' as const, confidence: 'unresolved' as const, path, line: 5, attributes: { callee } };
    const displayGraph: SemanticGraph = { ...graph, nodes: [initializer, external], edges: [{ ...graph.edges[0]!, source: initializer.id, target: external.id }] };
    const before = JSON.stringify(displayGraph), explorer = buildSemanticExplorer(displayGraph, new Set([path]));
    const initializerLocation = explorerLocationForNode(explorer, initializer.id), onOpenNode = vi.fn(), onSelect = vi.fn();
    await show('file-labels', initializer.id, { graph: displayGraph, explorer, location: { ...initializerLocation, centerId: undefined }, onOpenNode });
    const block = host.querySelector('[data-node-open-id]')!;
    expect(block.querySelector('strong')?.textContent).toBe('ファイル直下の処理');
    expect(block.querySelector('small')?.textContent).toBe(path);
    expect(block.getAttribute('title')).toContain('元の表示名: <module>');
    await act(async () => block.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onOpenNode).toHaveBeenLastCalledWith(initializer.id);
    await show('call-labels', initializer.id, { graph: displayGraph, explorer, location: initializerLocation, onSelect });
    const cards = [...host.querySelectorAll('[data-node-id]')];
    const center = cards.find(card => card.getAttribute('data-node-id') === initializer.id)!;
    const call = cards.find(card => card.getAttribute('data-node-id') === external.id)!;
    expect(center.querySelector('strong')?.textContent).toBe('ファイル直下の処理');
    expect(call.querySelector('strong')?.textContent).toBe('plugins.filter(...).map(...)');
    expect(call.querySelector('small')?.textContent).toBe(`呼び出し先 · ${path}:5`);
    expect(call.querySelector('title')?.textContent).toContain(callee);
    await act(async () => call.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onSelect).toHaveBeenLastCalledWith(external.id);
    expect(JSON.stringify(displayGraph)).toBe(before);
  });
});
