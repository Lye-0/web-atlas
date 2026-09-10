import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { bindSemanticFlowKeyboard } from './semanticFlowKeyboard';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SemanticGraph } from '../../analyzer/semantic/types';
import type { SemanticPosition } from '../../analyzer/semantic/presentation';
import type { FlowConnectionNotice, FlowLabelPlacement } from './semanticFlowLabels';
import type { SemanticFlowHoverHandler, SemanticFlowHoverTarget } from '../../analyzer/semantic/flowRelationInteraction';
import { SemanticFlow3D } from './SemanticFlow3D';
import type { AnalyzerViewSession } from '../../analyzer/session';

const scene = vi.hoisted(() => ({ current: {} as {
  positions: SemanticPosition[]; graph: SemanticGraph; onSelect: (id: string) => void; selectedIds: ReadonlySet<string>;
  onLabels: (labels: FlowLabelPlacement[]) => void; onConnections: (notices: FlowConnectionNotice[]) => void;
  onHover: (id?: string, edgeId?: string) => void; hoverTarget?: SemanticFlowHoverTarget; showGroupBounds?: boolean;
} }));
vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children: ReactElement }) => { scene.current = children.props as typeof scene.current; return <div data-testid="canvas" />; },
  useFrame: vi.fn(), useThree: vi.fn(),
}));

const graph: SemanticGraph = { view: 'function-call-flow', nodes: [
  { id: 'caller', label: 'caller', kind: 'function', group: 'Source', confidence: 'source', evidence: [], attributes: {}, path: 'src/main.ts' },
  ...['first', 'second'].map(id => ({ id, label: 'same.name', kind: 'external' as const, group: 'External', confidence: 'unresolved' as const, evidence: [], attributes: {}, path: `src/${id}.ts`, line: 3 })),
], edges: [{ id: 'call-1', source: 'caller', target: 'first', kind: 'calls', label: 'same.name', confidence: 'unresolved', views: ['function-call-flow'], evidence: [] }] };

describe('3D presentation controls retain canonical selection', () => {
  let host: HTMLDivElement, root: Root;
  const onSelect = vi.fn(), onFocus = vi.fn(), onCamera = vi.fn(), onHoverTarget = vi.fn(), onClear = vi.fn();
  const render = (selectedIds = new Set<string>(), selectedEdgeId?: string, options: { showGroupBounds?: boolean; hoverTarget?: SemanticFlowHoverTarget; onHoverTarget?: SemanticFlowHoverHandler; aggregationState?: AnalyzerViewSession['aggregation']; autoAggregation?: boolean } = {}) => act(async () => root.render(<SemanticFlow3D graph={graph} selectedIds={selectedIds} selectedEdgeId={selectedEdgeId} matchIds={new Set()} {...options} onHoverTarget={options.onHoverTarget ?? onHoverTarget}
    motion={{ enabled: false, reduced: false, visible: true }} onCamera={onCamera} onSelect={onSelect} onSelectEdge={() => {}} onClear={onClear} onUnavailable={() => {}} onFocusRegion={onFocus} />));
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

  const openUnresolved = () => act(async () => {
    const details = host.querySelector<HTMLDetailsElement>('.semantic-flow-unresolved-control')!;
    details.open = true; details.dispatchEvent(new Event('toggle', { bubbles: true }));
  });
  const clickText = (text: string) => act(async () => [...host.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === text)!.click());

  it.each([false, true])('keeps inspection outside the main selection when automatic omission is %s', async autoAggregation => {
    await render(new Set(['caller']), undefined, { autoAggregation, aggregationState: { expandedGroupIds: [], collapsedGroupIds: [], unresolved: 'collapsed' } });
    const aggregate = scene.current.positions.find(point => point.node.attributes.displayAggregate)!;
    await act(async () => scene.current.onSelect(aggregate.node.id));
    expect([...scene.current.selectedIds]).toEqual(['caller']);
    expect(onSelect).not.toHaveBeenCalled(); expect(onCamera).not.toHaveBeenCalled();
    await act(async () => scene.current.onLabels([{ id: aggregate.node.id, label: 'calls', path: '1対象', aggregate: true, selected: false, match: false, x: 10, y: 10 }]));
    const label = host.querySelector(`[data-flow-label-id="${aggregate.node.id}"]`)!;
    expect(label.getAttribute('aria-pressed')).toBe('false'); expect(label.textContent).toContain('内訳を表示中');
  });

  it('accepts Escape before Scene initialization and clears only once after its native listener is ready', async () => {
    await render(new Set(['caller']));
    const canvas = document.createElement('canvas'); host.querySelector('[data-testid="canvas"]')!.append(canvas);
    const escape = () => canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await act(async () => { escape(); }); expect(onClear).toHaveBeenCalledTimes(1);
    const unbind = bindSemanticFlowKeyboard(canvas, onClear);
    await act(async () => { escape(); }); expect(onClear).toHaveBeenCalledTimes(2);
    unbind();
    const prevented = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }); prevented.preventDefault();
    await act(async () => { canvas.dispatchEvent(prevented); }); expect(onClear).toHaveBeenCalledTimes(2);
  });

  it('keeps small inputs individual until an explicit manual collapse, with no duplicated representative on expansion', async () => {
    await render();
    expect(scene.current.positions).toHaveLength(3); expect(scene.current.graph).toBe(graph);
    await openUnresolved(); await clickText('すべての対象を点で展開');
    expect(scene.current.positions).toHaveLength(3);
    expect(host.querySelector('.semantic-flow-unresolved-control')?.getAttribute('open')).toBe('');
    expect(onSelect).not.toHaveBeenCalled(); expect(onCamera).not.toHaveBeenCalled(); expect(onFocus).not.toHaveBeenCalled();
    await clickText('集約表示へ戻す');
    expect(scene.current.positions).toHaveLength(2); expect(scene.current.graph.nodes).toHaveLength(3); expect(scene.current.graph.edges).toHaveLength(1);
    const aggregate = scene.current.positions.find(item => item.node.attributes.displayAggregate)!;
    await act(async () => scene.current.onSelect(aggregate.node.id));
    expect(host.querySelector('.auto-aggregation-panel h4')?.textContent).toContain('未特定');
    await clickText('この所属の2対象を個別表示');
    expect(scene.current.positions.map(point => point.node.id).sort()).toEqual(['caller', 'first', 'second']);
    expect(onSelect).not.toHaveBeenCalled(); expect(onCamera).not.toHaveBeenCalled();
  });

  it('protects the original relation endpoints and selected unresolved targets while manual collapse remains in force even with auto OFF', async () => {
    const options = { autoAggregation: false, aggregationState: { expandedGroupIds: [], collapsedGroupIds: [], unresolved: 'collapsed' as const } };
    await render(new Set(['caller']), undefined, options);
    expect(scene.current.positions.map(item => item.node.id)).toContain('caller');
    expect(scene.current.positions.map(item => item.node.id)).not.toContain('second');
    await render(new Set(), 'call-1', options);
    expect(scene.current.positions.find(item => item.node.id === 'first')?.node).toBe(graph.nodes[1]);
    expect(scene.current.positions.find(item => item.node.attributes.displayAggregate)?.node.attributes.targetCount).toBe(1);
    await render(new Set(['second']), undefined, options);
    expect(scene.current.positions.find(item => item.node.id === 'second')?.node).toBe(graph.nodes[2]);
    expect(host.querySelector('.semantic-flow-3d')?.getAttribute('data-unresolved-expanded')).toBe('false');
    expect(onCamera).not.toHaveBeenCalled();
  });

  it('uses original IDs in member navigation and explicit movement to offscreen endpoints', async () => {
    await render();
    await openUnresolved();
    const target = [...host.querySelectorAll('.semantic-flow-unresolved-control li button')].find(button => button.textContent?.includes('src/second.ts')) as HTMLButtonElement;
    await act(async () => target.click());
    expect(onSelect).toHaveBeenLastCalledWith('second'); expect(onFocus).toHaveBeenLastCalledWith(['second']);
    await act(async () => scene.current.onConnections([{ id: 'first', status: 'offscreen' }]));
    expect(host.querySelector('.semantic-flow-connection-notices summary')?.textContent).toContain('画面外 1対象');
    await act(async () => (host.querySelector('.semantic-flow-connection-notices button') as HTMLButtonElement).click());
    expect(onFocus).toHaveBeenLastCalledWith(['first']); expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('shares exact point, label focus and edge hover IDs while preserving selection and camera', async () => {
    await render(new Set(['caller']));
    await act(async () => scene.current.onHover('first'));
    expect(onHoverTarget).toHaveBeenLastCalledWith({ kind: 'node', id: 'first' }, { source: '3d-pointer', modality: 'pointer' });
    await act(async () => scene.current.onHover(undefined, 'call-1'));
    expect(onHoverTarget).toHaveBeenLastCalledWith({ kind: 'edge', id: 'call-1' }, { source: '3d-pointer', modality: 'pointer' });
    await act(async () => scene.current.onLabels([{ id: 'first', label: 'same.name', path: 'src/first.ts:3', selected: false, match: false, x: 100, y: 200, role: 'outgoing', roleLabel: '呼び出し先', disambiguation: 'first.ts', height: 60 }]));
    const button = host.querySelector<HTMLButtonElement>('[data-flow-label-id="first"]')!;
    await act(async () => button.focus());
    expect(onHoverTarget).toHaveBeenLastCalledWith({ kind: 'node', id: 'first' }, { source: '3d-focus:first', modality: 'focus' });
    expect(button.textContent).toContain('呼び出し先'); expect(button.textContent).toContain('first.ts');
    expect(button.style.height).toBe('60px');
    await act(async () => button.blur());
    expect(onHoverTarget).toHaveBeenLastCalledWith(undefined, { source: '3d-focus:first', modality: 'focus' });
    expect(onCamera).not.toHaveBeenCalled(); expect(onSelect).not.toHaveBeenCalled(); expect(onFocus).not.toHaveBeenCalled();
  });

  it('boundary toggle forwards visibility alone and controlled hover clears without resurrecting a local target', async () => {
    const selected = new Set(['caller']);
    await render(selected, undefined, { showGroupBounds: true });
    const before = scene.current.positions;
    await act(async () => scene.current.onHover('first'));
    await render(selected, undefined, { showGroupBounds: false, hoverTarget: { kind: 'node', id: 'first' } });
    expect(scene.current.positions).toBe(before); expect(scene.current.showGroupBounds).toBe(false); expect(scene.current.hoverTarget?.id).toBe('first');
    await render(selected, undefined, { showGroupBounds: false });
    expect(scene.current.hoverTarget).toBeUndefined(); expect(scene.current.positions).toBe(before);
    expect(onCamera).not.toHaveBeenCalled(); expect(onSelect).not.toHaveBeenCalled();
  });

  it.each(['first', 'second'])('releases only the old pointer owner after a newer detail hover of %s, without publishing a focused fallback', async detailId => {
    vi.useFakeTimers();
    const selected = new Set(['caller']);
    await render(selected);
    await act(async () => scene.current.onLabels([{ id: 'first', label: 'same.name', path: 'src/first.ts:3', selected: false, match: false, x: 100, y: 200 }]));
    const button = host.querySelector<HTMLButtonElement>('[data-flow-label-id="first"]')!;
    await act(async () => button.focus());
    await act(async () => { scene.current.onHover('first'); scene.current.onHover(); });
    await render(selected, undefined, { hoverTarget: { kind: 'node', id: detailId } });
    onHoverTarget.mockClear();
    await act(async () => vi.advanceTimersByTime(120));
    expect(onHoverTarget).toHaveBeenCalledExactlyOnceWith(undefined, { source: '3d-pointer', modality: 'pointer' });
    expect(scene.current.hoverTarget).toEqual({ kind: 'node', id: detailId });
    expect(onCamera).not.toHaveBeenCalled(); expect(onSelect).not.toHaveBeenCalled();
  });

  it('releases a removed focused label through its acquiring handler, preserving a newer context handler', async () => {
    const selected = new Set(['caller']), nextHandler = vi.fn();
    await render(selected);
    expect(onHoverTarget).not.toHaveBeenCalled(); // Initial empty projection is not an acquired input.
    await act(async () => scene.current.onLabels([{ id: 'first', label: 'first', path: 'src/first.ts', selected: false, match: false, x: 100, y: 200 }]));
    await act(async () => host.querySelector<HTMLButtonElement>('[data-flow-label-id="first"]')!.focus());
    onHoverTarget.mockClear();
    await render(selected, undefined, { onHoverTarget: nextHandler, hoverTarget: { kind: 'node', id: 'second' } });
    await act(async () => scene.current.onLabels([]));
    expect(host.querySelector('[data-flow-label-id="first"]')).toBeNull();
    expect(onHoverTarget).toHaveBeenCalledExactlyOnceWith(undefined, { source: '3d-focus:first', modality: 'focus' });
    expect(nextHandler).not.toHaveBeenCalled(); expect(scene.current.hoverTarget).toEqual({ kind: 'node', id: 'second' });
  });

  it('unmount releases only its captured pointer and focus owners and cancels pending pointer work', async () => {
    vi.useFakeTimers();
    const selected = new Set(['caller']), nextHandler = vi.fn();
    await render(selected);
    await act(async () => scene.current.onLabels([{ id: 'first', label: 'first', path: 'src/first.ts', selected: false, match: false, x: 100, y: 200 }]));
    await act(async () => host.querySelector<HTMLButtonElement>('[data-flow-label-id="first"]')!.focus());
    await act(async () => { scene.current.onHover('first'); scene.current.onHover(); });
    await render(selected, undefined, { onHoverTarget: nextHandler, hoverTarget: { kind: 'node', id: 'second' } });
    onHoverTarget.mockClear();
    await act(async () => root.render(null));
    expect(onHoverTarget.mock.calls).toEqual([[undefined, { source: '3d-pointer', modality: 'pointer' }], [undefined, { source: '3d-focus:first', modality: 'focus' }]]);
    await act(async () => vi.advanceTimersByTime(120));
    expect(onHoverTarget).toHaveBeenCalledTimes(2); expect(nextHandler).not.toHaveBeenCalled();
  });

  it('removing a pointer-owned label releases its input without clearing a remaining keyboard focus', async () => {
    await render(new Set(['caller']));
    const labels = ['first', 'second'].map((id, index) => ({ id, label: id, path: `src/${id}.ts`, selected: false, match: false, x: 100 + index * 260, y: 200 }));
    await act(async () => scene.current.onLabels(labels));
    await act(async () => host.querySelector<HTMLButtonElement>('[data-flow-label-id="second"]')!.focus());
    await act(async () => { const button = host.querySelector<HTMLButtonElement>('[data-flow-label-id="first"]')!; button.dispatchEvent(new MouseEvent('pointerover', { bubbles: true })); button.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, buttons: 0 })); });
    onHoverTarget.mockClear();
    await act(async () => scene.current.onLabels([labels[1]!]));
    expect(onHoverTarget).toHaveBeenCalledExactlyOnceWith(undefined, { source: '3d-pointer', modality: 'pointer' });
    expect(document.activeElement?.getAttribute('data-flow-label-id')).toBe('second');
  });

  it.each(['first', 'second'])('preserves a newer canvas point acquisition of %s when the former pointer label is removed', async canvasId => {
    await render(new Set(['caller']));
    await act(async () => scene.current.onLabels([{ id: 'first', label: 'first', path: 'src/first.ts', selected: false, match: false, x: 100, y: 200 }]));
    await act(async () => { const button = host.querySelector<HTMLButtonElement>('[data-flow-label-id="first"]')!; button.dispatchEvent(new MouseEvent('pointerover', { bubbles: true })); button.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, buttons: 0 })); });
    await act(async () => scene.current.onHover(canvasId));
    onHoverTarget.mockClear();
    await act(async () => scene.current.onLabels([]));
    expect(onHoverTarget).not.toHaveBeenCalled();
  });

  it('keeps the compact identity rows on hover while the complete source and original name remain in the tooltip', async () => {
    await render(new Set(['caller']));
    const tooltip = 'callback L163\nwebview/src/components/GraphSvg.tsx:163\n元の表示名: callback L163\nソース範囲: 12419–12451\nID: first';
    const label: FlowLabelPlacement = { id: 'first', label: 'callback L163', path: 'webview/src/components/GraphSvg.tsx:163', selected: false, match: false,
      role: 'outgoing', roleLabel: 'コールバック先', disambiguation: '範囲 12419–12451 · GraphSvg.tsx:163', tooltip, width: 220, height: 60, x: 100, y: 200 };
    await act(async () => scene.current.onLabels([label]));
    const button = host.querySelector<HTMLButtonElement>('[data-flow-label-id="first"]')!, before = button.textContent;
    await act(async () => scene.current.onLabels([{ ...label, hovered: true }]));
    expect(button.textContent).toBe(before); expect(button.querySelectorAll('small')).toHaveLength(1);
    expect(button.style.width).toBe('220px'); expect(button.style.height).toBe('60px'); expect(button.title).toContain(tooltip);
  });

  it('keeps keyboard focus through layout-only pointer entry and acquires pointer intent only on an unpressed move', async () => {
    await render(new Set(['caller']));
    await act(async () => scene.current.onLabels(['first', 'second'].map((id, index) => ({ id, label: id, path: `src/${id}.ts`, selected: false, match: false, x: 100 + index * 260, y: 200 }))));
    const first = host.querySelector<HTMLButtonElement>('[data-flow-label-id="first"]')!, second = host.querySelector<HTMLButtonElement>('[data-flow-label-id="second"]')!;
    await act(async () => second.focus());
    expect(onHoverTarget).toHaveBeenLastCalledWith({ kind: 'node', id: 'second' }, { source: '3d-focus:second', modality: 'focus' });
    onHoverTarget.mockClear();
    await act(async () => first.dispatchEvent(new MouseEvent('pointerover', { bubbles: true })));
    expect(onHoverTarget).not.toHaveBeenCalled(); expect(document.activeElement).toBe(second);
    await act(async () => first.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, buttons: 1 })));
    expect(onHoverTarget).not.toHaveBeenCalled();
    await act(async () => first.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, buttons: 0 })));
    expect(onHoverTarget).toHaveBeenCalledExactlyOnceWith({ kind: 'node', id: 'first' }, { source: '3d-pointer', modality: 'pointer' });
    expect(document.activeElement).toBe(second); expect(onSelect).not.toHaveBeenCalled();
  });
});
