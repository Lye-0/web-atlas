import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SemanticGraph } from '../../analyzer/semantic/types';
import type { SemanticPosition } from '../../analyzer/semantic/presentation';
import type { FlowConnectionNotice, FlowLabelPlacement } from './semanticFlowLabels';
import { SemanticFlow3D } from './SemanticFlow3D';

const scene = vi.hoisted(() => ({ current: {} as {
  positions: SemanticPosition[]; graph: SemanticGraph; onSelect: (id: string) => void;
  onLabels: (labels: FlowLabelPlacement[]) => void; onConnections: (notices: FlowConnectionNotice[]) => void;
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
  const onSelect = vi.fn(), onFocus = vi.fn(), onCamera = vi.fn();
  const render = (selectedIds = new Set<string>(), selectedEdgeId?: string) => act(async () => root.render(<SemanticFlow3D graph={graph} selectedIds={selectedIds} selectedEdgeId={selectedEdgeId} matchIds={new Set()}
    motion={{ enabled: false, reduced: false, visible: true }} onCamera={onCamera} onSelect={onSelect} onSelectEdge={() => {}} onClear={() => {}} onUnavailable={() => {}} onFocusRegion={onFocus} />));
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

  it('opens and collapses a synthetic point without selecting it as an analyzer object or moving the camera', async () => {
    await render();
    const aggregate = scene.current.positions.find(item => item.node.attributes.displayAggregate)!;
    expect(scene.current.positions).toHaveLength(2); expect(scene.current.graph).toBe(graph);
    await act(async () => scene.current.onSelect(aggregate.node.id));
    expect(scene.current.positions).toHaveLength(4);
    expect(host.querySelector('.semantic-flow-unresolved-control')?.getAttribute('open')).toBe('');
    expect(onSelect).not.toHaveBeenCalled(); expect(onCamera).not.toHaveBeenCalled(); expect(onFocus).not.toHaveBeenCalled();
    const collapse = [...host.querySelectorAll('button')].find(button => button.textContent === '集約表示へ戻す')!;
    await act(async () => collapse.click());
    expect(scene.current.positions).toHaveLength(2); expect(scene.current.graph.nodes).toHaveLength(3); expect(scene.current.graph.edges).toHaveLength(1);
  });

  it('reveals canonical targets from a function, a relation and a direct selection while the aggregate stays closed', async () => {
    await render(new Set(['caller']));
    expect(scene.current.positions.map(item => item.node.id)).toContain('first');
    expect(scene.current.positions.map(item => item.node.id)).not.toContain('second');
    await render(new Set(), 'call-1');
    expect(scene.current.positions.find(item => item.node.id === 'first')?.node).toBe(graph.nodes[1]);
    await render(new Set(['second']));
    expect(scene.current.positions.find(item => item.node.id === 'second')?.node).toBe(graph.nodes[2]);
    expect(host.querySelector('.semantic-flow-3d')?.getAttribute('data-unresolved-expanded')).toBe('false');
    expect(onCamera).not.toHaveBeenCalled();
  });

  it('uses original IDs in member navigation and explicit movement to offscreen endpoints', async () => {
    await render();
    const aggregate = scene.current.positions.find(item => item.node.attributes.displayAggregate)!;
    await act(async () => scene.current.onSelect(aggregate.node.id));
    const target = [...host.querySelectorAll('.semantic-flow-unresolved-control li button')].find(button => button.textContent?.includes('src/second.ts')) as HTMLButtonElement;
    await act(async () => target.click());
    expect(onSelect).toHaveBeenLastCalledWith('second'); expect(onFocus).toHaveBeenLastCalledWith(['second']);
    await act(async () => scene.current.onConnections([{ id: 'first', status: 'offscreen' }]));
    expect(host.querySelector('.semantic-flow-connection-notices summary')?.textContent).toContain('画面外 1対象');
    await act(async () => (host.querySelector('.semantic-flow-connection-notices button') as HTMLButtonElement).click());
    expect(onFocus).toHaveBeenLastCalledWith(['first']); expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
