import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyzerSessionProvider, useAnalyzerSession, type AnalyzerProjectStore } from '../analyzer';
import { AnalyzerPage } from './AnalyzerPage';
import type { SemanticAnalysis, SemanticGraph } from '../analyzer/semantic/types';
import { getSemanticAnalysis } from '../analyzer/semantic/client';

vi.mock('../analyzer/semantic/client', () => ({ getSemanticAnalysis: vi.fn(), cancelSemanticAnalysis: vi.fn() }));
vi.mock('../components/analyzer/AnalyzerEmptyOrbit', () => ({ AnalyzerEmptyOrbit: () => null }));
vi.mock('../components/analyzer/SemanticGraphCanvas', () => ({ SemanticGraphCanvas: ({ graph, orbit }: { graph: SemanticGraph; orbit: boolean }) => <div data-graph={graph.view} data-orbit={orbit}>{graph.nodes.length} graph objects</div> }));
const analysis: SemanticAnalysis = { nodes: [
  { id: 'run', label: 'run', kind: 'function', path: 'app.ts', line: 1, endLine: 1, group: 'API', confidence: 'source', evidence: [{ path: 'app.ts', start: 0, end: 20, line: 1, endLine: 1, description: 'run declaration' }], attributes: { name: 'run', entry: true } },
  { id: 'save', label: 'save', kind: 'function', path: 'app.ts', line: 2, endLine: 2, group: 'Persistence', confidence: 'source', evidence: [], attributes: { name: 'save' } },
  { id: 'User', label: 'User', kind: 'model', path: 'app.ts', group: 'Data models', confidence: 'source', evidence: [], fields: [{ name: 'id', type: 'string', optional: false }], attributes: {} },
], edges: [{ id: 'run-save', source: 'run', target: 'save', kind: 'calls', label: 'save()', views: ['function-call-flow', 'runtime-flow'], confidence: 'source', evidence: [{ path: 'app.ts', start: 17, end: 23, line: 1, endLine: 1, description: 'save call' }] }], coverage: [{ path: 'app.ts', language: 'typescript', status: 'parsed' }], warnings: [], stats: { files: 1, functions: 2, models: 1, unresolved: 0, elapsedMs: 3 } };
const store: AnalyzerProjectStore = { files: [], facts: [], relations: [], evidence: [], sources: { 'app.ts': 'function run() { save(); }\nfunction save() { return 1; }' }, warnings: [], scannedAt: 'first' };
function Project({ project }: { project: AnalyzerProjectStore }) {
  const { state, replaceProject } = useAnalyzerSession(); useEffect(() => replaceProject(project), [replaceProject, project]);
  return <><span data-active-view={state.activeView} /><AnalyzerPage /></>;
}

describe('semantic Analyzer exploration', () => {
  let host: HTMLDivElement, root: Root;
  const render = async (project = store) => act(async () => root.render(<MemoryRouter initialEntries={['/analyzer/function-call-flow']}><AnalyzerSessionProvider><Project project={project} /></AnalyzerSessionProvider></MemoryRouter>));
  const button = (label: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find(element => element.textContent === label)!;
  beforeEach(async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.mocked(getSemanticAnalysis).mockImplementation(() => ({ promise: Promise.resolve(analysis), unsubscribe: () => {} }));
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    await import('./SemanticAnalyzerPage'); await render();
  });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
  it('keeps selections and 3D mode per view while separating models from function calls', async () => {
    expect(host.querySelectorAll('.analyzer-view-tabs a')).toHaveLength(10);
    await act(async () => host.querySelector<HTMLButtonElement>('.semantic-object-list button')!.click());
    expect(host.querySelector('.semantic-detail')?.textContent).toContain('save()'); expect(host.querySelector('.semantic-detail')?.textContent).toContain('run declaration');
    await act(async () => button('3D Orbitに切替').click()); expect(host.querySelector('[data-orbit]')?.getAttribute('data-orbit')).toBe('true');
    await act(async () => host.querySelector<HTMLAnchorElement>('a[href="/analyzer/data-model"]')!.click());
    expect(host.querySelector('.semantic-object-list')?.textContent).toContain('User'); expect(host.querySelector('.semantic-object-list')?.textContent).not.toContain('run');
    await act(async () => host.querySelector<HTMLButtonElement>('.semantic-object-list button')!.click()); expect(host.querySelector('.semantic-fields')?.textContent).toContain('string');
    await act(async () => host.querySelector<HTMLAnchorElement>('a[href="/analyzer/function-call-flow"]')!.click());
    expect(host.querySelector('.semantic-detail h3')?.textContent).toBe('run'); expect(host.querySelector('[data-orbit]')?.getAttribute('data-orbit')).toBe('true');
  });
  it('imports an execution file and clears trace/selection state on a new project', async () => {
    const input = host.querySelector<HTMLInputElement>('input[aria-label="実行ログ・Traceファイル"]')!;
    const file = { name: 'run.json', size: 100, text: async () => JSON.stringify([{ name: 'observed run', spanId: '1', attributes: { 'code.function.name': 'run' } }]) };
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    expect(host.querySelector('.semantic-trace-info')?.textContent).toContain('1 spans'); expect(host.querySelector('.semantic-object-list')?.textContent).toContain('observed run');
    await act(async () => host.querySelector<HTMLButtonElement>('.semantic-object-list button')!.click());
    await render({ ...store, scannedAt: 'second' });
    expect(host.querySelector('.semantic-trace-info')).toBeNull(); expect(host.querySelector('.semantic-detail')).toBeNull();
    expect(host.querySelector('[data-active-view]')?.getAttribute('data-active-view')).toBe('function-call-flow');
  });
  it('exposes relation evidence and restores source/target selection', async () => {
    await act(async () => host.querySelector<HTMLButtonElement>('.semantic-object-list button')!.click());
    await act(async () => button('save() · ソースで確認').click());
    expect(host.querySelector('.semantic-detail')?.textContent).toContain('save call');
    const target = [...host.querySelectorAll<HTMLButtonElement>('.semantic-detail button')].find(element => element.textContent === 'save')!;
    await act(async () => target.click()); expect(host.querySelector('.semantic-detail h3')?.textContent).toBe('save');
  });
  it('shows a recoverable engine error and retries', async () => {
    vi.mocked(getSemanticAnalysis).mockImplementationOnce(() => ({ promise: Promise.reject(new Error('Engine unavailable')), unsubscribe: () => {} }));
    await render({ ...store, scannedAt: 'failed' }); expect(host.querySelector('[role="alert"]')?.textContent).toContain('Engine unavailable');
    await act(async () => button('再実行').click()); expect(host.querySelector('[role="alert"]')).toBeNull(); expect(host.querySelector('[data-graph]')).not.toBeNull();
  });
  it('opens actual subsystem members in another view', async () => {
    await act(async () => host.querySelector<HTMLAnchorElement>('a[href="/analyzer/architecture-map"]')!.click());
    await act(async () => host.querySelector<HTMLButtonElement>('.semantic-object-list button')!.click());
    expect(host.querySelector('.semantic-member-files')?.textContent).toContain('app.ts');
    await act(async () => button('Function Call Flow ↗').click());
    expect(host.querySelector('.semantic-object-list')?.textContent).toContain('run'); expect(host.querySelector('.semantic-empty-result')).toBeNull();
  });
});
