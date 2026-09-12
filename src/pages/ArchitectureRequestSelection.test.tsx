import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { AnalyzerSessionProvider, useAnalyzerSession, type AnalyzerProjectStore } from '../analyzer';
import { AnalyzerPage } from './AnalyzerPage';
import type { SemanticAnalysis, SemanticGraph } from '../analyzer/semantic/types';

const { getAnalysis } = vi.hoisted(() => ({ getAnalysis: vi.fn() }));
vi.mock('../analyzer/semantic/client', () => ({ getSemanticAnalysis: getAnalysis, cancelSemanticAnalysis: vi.fn() }));
vi.mock('../components/analyzer/AnalyzerEmptyOrbit', () => ({ AnalyzerEmptyOrbit: () => null }));
vi.mock('../components/analyzer/SemanticFlowStage', () => ({ SemanticFlowStage: ({ graph, onSelect, onClear, selectedIds }: { graph: SemanticGraph; onSelect: (id: string) => void; onClear: () => void; selectedIds: Set<string> }) => <div data-stage><pre>{JSON.stringify({ ids: graph.nodes.map(n => n.id), selected: [...selectedIds], positions: [...graph.architectureView!.positions2d!] })}</pre>{graph.nodes.map(node => <button key={node.id} data-node={node.id} onClick={() => onSelect(node.id)}>{node.label}</button>)}<button onClick={onClear}>解除</button></div> }));
const store: AnalyzerProjectStore = { files: [], facts: [], relations: [], evidence: [], sources: {}, warnings: [], scannedAt: 'fixture' };
const architecture: SemanticGraph = { view: 'architecture-map', nodes: Array.from({ length: 24 }, (_, i) => ({ id: `request${i}`, label: '未特定要求', kind: 'external', confidence: 'unresolved', group: 'project', attributes: {}, evidence: [], architecture: {
  kind: 'unresolved', files: [], memberIds: [], roles: [], entryPaths: [], context: [], environments: [], technologyNames: [], auxiliary: false,
  request: { ownerId: 'project', kind: 'http', expression: `url${i}`, sourceId: `source${i}` },
} })), edges: [] };
const analysis: SemanticAnalysis = { nodes: [], edges: [], warnings: [], coverage: [], stats: { files: 0, functions: 0, models: 0, unresolved: 0, elapsedMs: 0 }, architecture: { ...architecture, environments: [], limitations: [] } };
function Project() {
  const { state, replaceProject } = useAnalyzerSession();
  useEffect(() => replaceProject(store), [replaceProject]);
  return <><pre data-session>{JSON.stringify(state.views['architecture-map'])}</pre><AnalyzerPage /></>;
}
it('selects groups in the common detail and distinguishes temporary selection, closing and explicit expansion', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  getAnalysis.mockReturnValue({ promise: Promise.resolve(analysis), unsubscribe() {} });
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const click = async (text: string) => act(async () => { const target = [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === text); expect(target, text).toBeDefined(); target!.click(); });
  const session = () => JSON.parse(host.querySelector('[data-session]')!.textContent!);
  const stage = () => JSON.parse(host.querySelector('[data-stage] pre')!.textContent!) as { ids: string[]; selected: string[]; positions: unknown[] };
  try {
    await import('./SemanticAnalyzerPage');
    await act(async () => root.render(<MemoryRouter initialEntries={['/analyzer/architecture-map']}><AnalyzerSessionProvider><Project /></AnalyzerSessionProvider></MemoryRouter>));
    const baseline = stage(), groupId = baseline.ids[0]!;
    await click('HTTP接続先・未特定：24対象');
    expect(stage().selected).toEqual([groupId]); expect(host.querySelectorAll('aside')).toHaveLength(1);
    expect(host.querySelector('.architecture-request-detail')?.textContent).toContain('元の要求 24件 · 集合内 24件 · 個別表示 0件');
    const location = JSON.stringify(session().explorer);
    await click('図で表示して選択');
    expect(stage().selected).toEqual(['request0']); expect(stage().ids).toHaveLength(2);
    expect(stage().positions).toEqual(baseline.positions);
    expect(host.querySelector('aside')?.textContent).toContain('集合内 23件 · 個別表示 1件');
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="詳細を閉じる"]')!.click());
    expect(stage().selected).toEqual(['request0']); expect(stage().ids).toHaveLength(2); expect(host.querySelector('aside')).toBeNull();
    await click('解除'); expect(stage().ids).toEqual(baseline.ids);
    await click('HTTP接続先・未特定：24対象'); await click('要求を個別に表示');
    expect(stage().ids).toHaveLength(24); expect(stage().selected).toEqual([groupId]);
    expect(host.querySelector('aside')?.textContent).toContain('集合内 0件 · 個別表示 24件');
    await click('図で表示して選択'); await click('元の集合の内訳を見る');
    expect(stage().ids).toHaveLength(24); await click('まとめる'); expect(stage().ids).toEqual(baseline.ids);
    await click('要求を個別に表示'); await click('解除'); expect(stage().ids).toHaveLength(24);
    // Selection snapshots may change, but no visit or scope is pushed.
    expect(session().explorer.twoD.location).toEqual(JSON.parse(location).twoD.location);
    expect(session().explorer.history).toEqual(JSON.parse(location).history);
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});
