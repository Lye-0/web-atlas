import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SemanticFlowStage } from './SemanticFlowStage';
import type { SemanticFlowRenderProps } from './SemanticFlow2D';
const capture = vi.hoisted(() => ({ props: undefined as SemanticFlowRenderProps | undefined }));
vi.mock('./SemanticFlow2D', () => ({ SemanticFlow2D: (props: SemanticFlowRenderProps) => { capture.props = props; return <button onClick={props.onClear}>clear selection</button>; } }));
vi.mock('./SemanticFlow3D', () => ({ SemanticFlow3D: (props: SemanticFlowRenderProps) => { capture.props = props; return <button onClick={props.onClear}>clear selection</button>; } }));
vi.mock('./useSpatialFlowMotion', () => ({ useSpatialFlowMotion: () => ({ mode: 'normal', setMode: vi.fn(), enabled: true, reduced: false, visible: true }) }));
let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
beforeEach(() => {
  capture.props = undefined;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
it('applies the current direction filter to an active path without reviving a saved inactive location', async () => {
  const location = { scopeId: 'project', centerId: 'a', depth: 2, direction: 'both' as const };
  const navigation = { location, activePath: location, visitId: 'visit', scrollTop: 0, canBack: false, onBack: vi.fn(), onParent: vi.fn(), onProject: vi.fn(), onOpenScope: vi.fn(), onOpenNode: vi.fn(), onCenter: vi.fn(), onDefinition: vi.fn(), onJumpMode: vi.fn(), onDepth: vi.fn(), onScroll: vi.fn(), onRevealSelection: vi.fn() };
  const nodes = ['a', 'b', 'c'].map(id => ({ id, label: id, kind: 'value' as const, group: 'fixture', confidence: 'source' as const, evidence: [], attributes: {} }));
  const edges = [['in', 'b', 'a'], ['out', 'a', 'c']].map(([id, source, target]) => ({ id: id!, source: source!, target: target!, kind: 'reads', label: id!, confidence: 'source' as const, views: ['data-flow' as const], evidence: [] }));
  const props = { graph: { view: 'data-flow' as const, nodes, edges }, navigation, mode: '2d' as const, selectedIds: new Set(['a']), matchIds: new Set<string>(), cameras: {}, onCamera: vi.fn(), onMode: vi.fn(), onParticleMode: vi.fn(), onSelect: vi.fn(), onSelectEdge: vi.fn(), onClear: vi.fn(), isFullscreen: false, onFullscreen: vi.fn(), onUnavailable: vi.fn() };
  await act(async () => root.render(<SemanticFlowStage {...props} direction="incoming" />));
  expect([...capture.props!.explicitPathEdgeIds!]).toEqual(['in']);
  await act(async () => root.render(<SemanticFlowStage {...props} direction="outgoing" />));
  expect([...capture.props!.explicitPathEdgeIds!]).toEqual(['out']);
  await act(async () => root.render(<SemanticFlowStage {...props} navigation={{ ...navigation, activePath: undefined }} direction="both" />));
  expect(capture.props!.explicitPathEdgeIds!.size).toBe(0);
});
it.each([['2d','clear'],['3d','clear'],['2d','node'],['3d','node'],['2d','edge'],['3d','edge']] as const)('releases a consumed focus request on %s/%s without moving the camera or replaying focus', async (mode, action) => {
  const onClear = vi.fn(), onCamera = vi.fn(), focus = { nonce: 1, ids: ['selected'] };
  const props = { graph: { view: 'data-flow' as const, nodes: [{ id: 'selected', label: 'value', kind: 'value' as const, group: 'fixture', confidence: 'source' as const, evidence: [], attributes: {} }], edges: [] }, mode, matchIds: new Set<string>(), focus, cameras: {}, onCamera,
    onMode: vi.fn(), onParticleMode: vi.fn(), onSelect: vi.fn(), onSelectEdge: vi.fn(), onClear, isFullscreen: false, onFullscreen: vi.fn(), onUnavailable: vi.fn() };
  await act(async () => { root.render(<SemanticFlowStage {...props} selectedIds={new Set(['selected'])} />); if (mode === '3d') await import('./SemanticFlow3D'); });
  expect(capture.props?.command).toMatchObject({ kind: 'focus', ids: ['selected'] });
  await act(async () => {
    if (action === 'clear') capture.props!.onClear();
    else if (action === 'node') capture.props!.onSelect('selected');
    else capture.props!.onSelectEdge('edge');
  });
  await act(async () => root.render(<SemanticFlowStage {...props} selectedIds={new Set()} />));
  if (action === 'clear') expect(onClear).toHaveBeenCalledOnce();
  else if (action === 'node') expect(props.onSelect).toHaveBeenCalledWith('selected');
  else expect(props.onSelectEdge).toHaveBeenCalledWith('edge');
  expect(capture.props?.command).toBeUndefined(); expect(onCamera).not.toHaveBeenCalled();
});
