import { act, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { AnalyzerGraph3DStage } from './AnalyzerGraph3DStage';
import { createInitialAnalyzerViewSession } from '../../analyzer/session';
import type { AnalyzerViewModel } from '../../analyzer/types';

const scene = vi.hoisted(() => ({ current: undefined as undefined | { edges: { source: string; target: string; animate: boolean }[] } }));
// Inspect the actual renderer input; temporal GPU movement is verified in-browser.
vi.mock('@react-three/fiber', () => ({ Canvas: ({ children }: { children: ReactElement<typeof scene.current> }) => { scene.current = children.props; return null; }, useThree: vi.fn(), useFrame: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

it.each(['architecture', 'workspace'] as const)('animates selected contains in %s without requiring edge selection', async view => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const model: AnalyzerViewModel = { view, nodes: [{ id: 'project', type: 'project', label: 'project', evidenceIds: [], metadata: {} }],
    edges: [{ id: 'contains', sourceId: 'project', targetId: 'scope', kind: 'contains', label: 'contains', evidenceIds: [], metadata: {} }],
    regions: [], clusters: [], evidence: [], warnings: [] };
  if (view === 'architecture') model.regions!.push({ id: 'scope', entityKind: 'region', regionKind: 'scope', label: 'scope', childIds: [], ports: [], selectable: true, evidenceIds: [], metadata: {} });
  else model.nodes.push({ id: 'scope', type: 'workspace-package', label: 'root package', evidenceIds: [], metadata: {} });
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host), noop = () => undefined;
  const render = async (selection: { selectedNodeId?: string; selectedRegionId?: string }) => {
    await act(async () => root.render(<AnalyzerGraph3DStage model={model} state={{ ...createInitialAnalyzerViewSession(), ...selection }} input="fixture"
      onMode={noop} onCamera={noop} onUnavailable={noop} onSelectNode={noop} onSelectRegion={noop} onSelectEdge={noop} onClear={noop} onTogglePresentation={noop}
      autoAggregation={false} onAutoAggregation={noop} showGroupBounds onGroupBounds={noop} onAggregation={noop} onCounts={noop} isFullscreen={false} onFullscreen={noop} />));
  };
  try {
    await render({}); expect(scene.current!.edges.some(edge => edge.animate)).toBe(false);
    await render({ selectedNodeId: 'project' }); expect(scene.current!.edges).toEqual([expect.objectContaining({ source: 'project', target: 'scope', animate: true })]);
    await render(view === 'architecture' ? { selectedRegionId: 'scope' } : { selectedNodeId: 'scope' }); expect(scene.current!.edges[0]!.animate).toBe(true);
    await render({}); expect(scene.current!.edges.some(edge => edge.animate)).toBe(false);
  } finally { await act(async () => root.unmount()); host.remove(); }
});
