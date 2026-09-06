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
vi.mock('../components/analyzer/SemanticFlow3D', () => ({ SemanticFlow3D: ({ graph, camera, onCamera }: { graph: SemanticGraph; camera?: { zoom: number }; onCamera: (camera: { position: [number, number, number]; target: [number, number, number]; zoom: number }) => void }) => <div data-graph={graph.view} data-orbit="true" data-camera-zoom={camera?.zoom}>{graph.nodes.map(node => node.label).join(' ')}<button onClick={() => onCamera({ position: [2, 3, 4], target: [5, 6, 7], zoom: .72 })}>3Dテスト移動</button></div> }));
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
  const openDetailSection = (label: string) => act(async () => {
    const section = [...host.querySelectorAll<HTMLDetailsElement>('.semantic-flow-detail .analyzer-detail-accordion')].find(element => element.querySelector(':scope > summary > span')?.textContent === label)!;
    section.open = true; section.dispatchEvent(new Event('toggle'));
  });
  const choose = (id: string) => act(async () => host.querySelector(`[data-node-id="${id}"]`)!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  const search = (value: string) => act(async () => { const input = host.querySelector<HTMLInputElement>('input[type="search"]')!; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); });
  beforeEach(async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('ResizeObserver', class { constructor(private callback: ResizeObserverCallback) {} observe() { this.callback([{ contentRect: { width: 1000, height: 600 } } as ResizeObserverEntry], this as unknown as ResizeObserver); } disconnect() {} });
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1)); vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.mocked(getSemanticAnalysis).mockImplementation(() => ({ promise: Promise.resolve(analysis), unsubscribe: () => {} }));
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    await import('./SemanticAnalyzerPage'); await render();
  });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
  it('keeps selections and 3D mode per view while separating models from function calls', async () => {
    expect(host.querySelectorAll('.analyzer-view-tabs a')).toHaveLength(10);
    expect(host.querySelector('.semantic-object-list')).toBeNull();
    await choose('run');
    expect(host.querySelector('.semantic-detail')?.textContent).toContain('save()');
    await openDetailSection('Evidence'); expect(host.querySelector('.semantic-detail')?.textContent).toContain('run declaration');
    await act(async () => button('一覧3D').click()); expect(host.querySelector('[data-orbit]')?.getAttribute('data-orbit')).toBe('true');
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
    expect(host.querySelector('.semantic-trace-info')?.textContent).toContain('1 spans'); expect(host.querySelector('.semantic-flow-stage')?.textContent).toContain('observed run');
    await choose('run');
    await render({ ...store, scannedAt: 'second' });
    expect(host.querySelector('.semantic-trace-info')).toBeNull(); expect(host.querySelector('.semantic-detail')).toBeNull();
    expect(host.querySelector('[data-active-view]')?.getAttribute('data-active-view')).toBe('function-call-flow');
  });
  it('exposes relation evidence and restores source/target selection', async () => {
    await choose('run');
    await act(async () => button('save() · ソースで確認').click());
    expect(host.querySelector('.semantic-detail')?.textContent).toContain('save call');
    const target = [...host.querySelectorAll<HTMLButtonElement>('.semantic-detail button')].find(element => element.querySelector('strong')?.textContent === 'save')!;
    await act(async () => target.click()); expect(host.querySelector('.semantic-detail h3')?.textContent).toBe('save');
  });
  it('shows a recoverable engine error and retries', async () => {
    vi.mocked(getSemanticAnalysis).mockImplementationOnce(() => ({ promise: Promise.reject(new Error('Engine unavailable')), unsubscribe: () => {} }));
    await render({ ...store, scannedAt: 'failed' }); expect(host.querySelector('[role="alert"]')?.textContent).toContain('Engine unavailable');
    await act(async () => button('再実行').click()); expect(host.querySelector('[role="alert"]')).toBeNull(); expect(host.querySelector('.semantic-flow-stage [data-node-id]')).not.toBeNull();
  });
  it('opens actual subsystem members in another view', async () => {
    await act(async () => host.querySelector<HTMLAnchorElement>('a[href="/analyzer/architecture-map"]')!.click());
    await act(async () => host.querySelector<HTMLButtonElement>('.semantic-object-list button')!.click());
    expect(host.querySelector('.semantic-member-files')?.textContent).toContain('app.ts');
    await act(async () => button('Function Call Flow ↗').click());
    expect(host.querySelector('.semantic-flow-stage')?.textContent).toContain('run'); expect(host.querySelector('.semantic-empty-result')).toBeNull();
  });
  it('uses search only for candidates/highlights and preserves selection/camera when cleared', async () => {
    const initial = host.querySelector('.semantic-flow-2d')!;
    const camera = [initial.getAttribute('data-camera-x'), initial.getAttribute('data-camera-y'), initial.getAttribute('data-camera-scale')];
    await search('run');
    expect(host.querySelector('.semantic-detail')).toBeNull(); expect(host.querySelectorAll('[data-node-id]')).toHaveLength(2);
    expect(host.querySelector('[data-flow-particle]')).toBeNull();
    const searched = host.querySelector('.semantic-flow-2d')!;
    expect([searched.getAttribute('data-camera-x'), searched.getAttribute('data-camera-y'), searched.getAttribute('data-camera-scale')]).toEqual(camera);
    await act(async () => host.querySelector<HTMLButtonElement>('[role="option"]')!.click());
    expect(host.querySelector('.semantic-detail h3')?.textContent).toBe('run');
    const selectedCamera = host.querySelector('.semantic-flow-2d')!.getAttribute('data-camera-scale');
    await search(''); expect(host.querySelector('.semantic-detail h3')?.textContent).toBe('run');
    expect(host.querySelector('.semantic-flow-2d')!.getAttribute('data-camera-scale')).toBe(selectedCamera);
    expect(host.querySelector('.analyzer-search-strip')?.getAttribute('data-search-state')).toBe('idle');
  });
  it('preserves the 2D and 3D cameras independently and keeps the same selected edge evidence', async () => {
    await choose('run'); await act(async () => button('save() · ソースで確認').click());
    const camera2D = host.querySelector('.semantic-flow-2d')!.getAttribute('data-camera-scale');
    await act(async () => button('一覧3D').click()); await act(async () => button('3Dテスト移動').click());
    expect(host.querySelector('.semantic-detail')?.textContent).toContain('save call');
    await act(async () => button('分類2D').click());
    expect(host.querySelector('.semantic-flow-2d')!.getAttribute('data-camera-scale')).toBe(camera2D);
    await act(async () => button('一覧3D').click()); expect(host.querySelector('[data-camera-zoom]')?.getAttribute('data-camera-zoom')).toBe('0.72');
    expect(host.querySelector('.semantic-detail')?.textContent).toContain('save call');
  });
  it('offers Runtime 3D without discarding source entries and explains filtered-out selections', async () => {
    await choose('run');
    const scope = [...host.querySelectorAll<HTMLSelectElement>('select')].find(select => select.parentElement?.textContent?.startsWith('責務'))!;
    await act(async () => { scope.value = 'Persistence'; scope.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(host.querySelector('.semantic-flow-notice')?.textContent).toContain('run'); expect(host.querySelector('.semantic-detail h3')?.textContent).toBe('run');
    await act(async () => button('フィルターを解除して表示').click()); expect(host.querySelector('.semantic-flow-notice')).toBeNull();
    await act(async () => host.querySelector<HTMLAnchorElement>('a[href="/analyzer/runtime-flow"]')!.click());
    expect(host.querySelector('.semantic-object-list')).toBeNull(); await act(async () => button('一覧3D').click());
    expect(host.querySelector('[data-graph="runtime-flow"]')?.textContent).toContain('run');
  });
  it('retains Runtime model fields and navigates to the same Data Model using the source layer', async () => {
    const runtimeModel: SemanticAnalysis = { ...analysis, nodes: analysis.nodes.map(node => node.id === 'User' ? { ...node, attributes: { unresolvedSpreads: ['sharedColumns'] } } : node),
      edges: [...analysis.edges, { id: 'read-user', source: 'User', target: 'run', kind: 'reads', label: '読み取り', views: ['runtime-flow', 'data-flow'], confidence: 'source', evidence: [] }] };
    vi.mocked(getSemanticAnalysis).mockImplementation(() => ({ promise: Promise.resolve(runtimeModel), unsubscribe: () => {} }));
    await render({ ...store, scannedAt: 'runtime-model' });
    await act(async () => host.querySelector<HTMLAnchorElement>('a[href="/analyzer/runtime-flow"]')!.click());
    await act(async () => button('詳細設定').click());
    const runtimeLayer = [...host.querySelectorAll<HTMLSelectElement>('select')].find(select => select.parentElement?.textContent?.startsWith('表示データ'))!;
    await act(async () => { runtimeLayer.value = 'combined'; runtimeLayer.dispatchEvent(new Event('change', { bubbles: true })); });
    await choose('User');
    expect(host.querySelector('.semantic-fields')?.textContent).toContain('idstring');
    expect(host.querySelector('.semantic-detail')?.textContent).toContain('未展開のフィールド: sharedColumns');
    await openDetailSection('関連するView');
    expect(host.querySelectorAll('.semantic-crosslinks button')).toHaveLength(4);
    await act(async () => button('Data Model ↗').click());
    expect(host.querySelector('.semantic-detail h3')?.textContent).toBe('User'); expect(host.querySelector('.semantic-fields')?.textContent).toContain('idstring');
    const layer = [...host.querySelectorAll<HTMLSelectElement>('select')].find(select => select.parentElement?.textContent?.startsWith('表示データ'))!;
    expect(layer.value).toBe('source');
    await act(async () => button('Runtime Flow ↗').click());
    expect(host.querySelector('.semantic-detail h3')?.textContent).toBe('User'); expect(host.querySelector('.semantic-fields')?.textContent).toContain('idstring');
  });
  it('opens a function-owned Data Flow context and returns through the exact owner identity', async () => {
    const values: SemanticAnalysis['nodes'] = [
      { id: 'run-input', label: 'input', kind: 'value', path: 'app.ts', group: 'API', confidence: 'source', evidence: [], attributes: { owner: 'run' } },
      { id: 'run-result', label: 'result', kind: 'value', path: 'app.ts', group: 'API', confidence: 'source', evidence: [], attributes: { owner: 'run' } },
      { id: 'save-other', label: 'other', kind: 'value', path: 'app.ts', group: 'API', confidence: 'source', evidence: [], attributes: { owner: 'save' } },
    ];
    vi.mocked(getSemanticAnalysis).mockImplementation(() => ({ promise: Promise.resolve({ ...analysis, nodes: [...analysis.nodes, ...values] }), unsubscribe: () => {} }));
    await render({ ...store, scannedAt: 'owner-values' }); await choose('run');
    await openDetailSection('関連するView');
    await act(async () => button('Data Flow ↗').click());
    expect(host.querySelector('.semantic-object-list')?.textContent).toContain('input'); expect(host.querySelector('.semantic-object-list')?.textContent).toContain('result');
    expect(host.querySelector('.semantic-object-list')?.textContent).not.toContain('other');
    await act(async () => host.querySelector<HTMLButtonElement>('.semantic-object-list button')!.click());
    await act(async () => button('Function Call Flow ↗').click());
    expect(host.querySelector('.semantic-detail h3')?.textContent).toBe('run');
  });
  it('clears a subsystem member filter after a Runtime jump while preserving query, selection and camera', async () => {
    const navigation: SemanticAnalysis = { ...analysis, nodes: [
      { id: 'module-ui', label: '<module>', kind: 'function', path: 'src/ui.ts', group: 'UI', confidence: 'source', evidence: [], attributes: { initializer: true } },
      { id: 'event', label: 'submit event', kind: 'entry', path: 'src/ui.ts', group: 'UI', confidence: 'source', evidence: [], attributes: {} },
      { ...analysis.nodes[0]!, path: 'src/api.ts' },
      { id: 'request', label: '/orders', kind: 'request', path: 'src/api.ts', group: 'API', confidence: 'source', evidence: [], attributes: { owner: 'run' } },
    ], edges: [
      { id: 'register', source: 'module-ui', target: 'event', kind: 'registers-event', label: 'submitを登録', views: ['runtime-flow'], confidence: 'source', evidence: [] },
      { id: 'handler', source: 'event', target: 'run', kind: 'handles', label: 'handler', views: ['runtime-flow'], confidence: 'source', evidence: [] },
      { id: 'request-edge', source: 'run', target: 'request', kind: 'requests', label: 'API request', views: ['runtime-flow'], confidence: 'source', evidence: [] },
    ] };
    vi.mocked(getSemanticAnalysis).mockImplementation(() => ({ promise: Promise.resolve(navigation), unsubscribe: () => {} }));
    await render({ ...store, scannedAt: 'member-reset' });
    await act(async () => host.querySelector<HTMLAnchorElement>('a[href="/analyzer/architecture-map"]')!.click());
    const apiGroup = [...host.querySelectorAll<HTMLButtonElement>('.semantic-object-list > button')].find(element => element.querySelector('strong')?.textContent === 'API')!;
    await act(async () => apiGroup.click()); await act(async () => button('Runtime Flow ↗').click());
    expect(host.querySelector('.semantic-flow-2d')?.getAttribute('data-node-count')).toBe('2');
    expect(host.querySelector('.semantic-flow-2d')?.getAttribute('data-edge-count')).toBe('1');
    await choose('run'); await search('run');
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')!.click());
    const camera = () => { const canvas = host.querySelector('.semantic-flow-2d')!; return ['data-camera-x', 'data-camera-y', 'data-camera-scale'].map(name => canvas.getAttribute(name)); };
    const before = camera();
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-controls="semantic-flow-settings"]')!.click());
    await act(async () => button('フィルターを解除').click());
    expect(host.querySelector('.semantic-flow-2d')?.getAttribute('data-node-count')).toBe('4');
    expect(host.querySelector('.semantic-flow-2d')?.getAttribute('data-edge-count')).toBe('3');
    expect(host.querySelector('[aria-controls="semantic-flow-settings"]')?.textContent).toBe('詳細設定');
    expect(host.querySelector<HTMLInputElement>('input[type="search"]')!.value).toBe('run');
    expect(host.querySelector('.semantic-detail h3')?.textContent).toBe('run'); expect(camera()).toEqual(before);
  });
  it('resets the auxiliary filter to its default without clearing an explicit selection', async () => {
    const auxiliary: SemanticAnalysis = { ...analysis, nodes: [...analysis.nodes,
      { id: 'test-helper', label: 'test helper', kind: 'function', path: 'src/test.ts', group: 'Tests', confidence: 'source', evidence: [], attributes: { auxiliary: true } },
    ] };
    vi.mocked(getSemanticAnalysis).mockImplementation(() => ({ promise: Promise.resolve(auxiliary), unsubscribe: () => {} }));
    await render({ ...store, scannedAt: 'auxiliary-reset' });
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-controls="semantic-flow-settings"]')!.click());
    const checkbox = [...host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find(input => input.parentElement?.textContent === 'Test・生成定義を含む')!;
    await act(async () => checkbox.click());
    expect(host.querySelector('.semantic-flow-2d')?.getAttribute('data-node-count')).toBe('3');
    await choose('test-helper'); await search('test');
    const before = host.querySelector('.semantic-flow-2d')!.getAttribute('data-camera-scale');
    await act(async () => button('フィルターを解除').click());
    expect(checkbox.checked).toBe(false); expect(host.querySelector('.semantic-flow-2d')?.getAttribute('data-node-count')).toBe('2');
    expect(host.querySelector('.semantic-detail h3')?.textContent).toBe('test helper');
    expect(host.querySelector('.semantic-flow-notice')?.textContent).toContain('現在のフィルターで非表示');
    expect(host.querySelector<HTMLInputElement>('input[type="search"]')!.value).toBe('test');
    expect(host.querySelector('.semantic-flow-2d')!.getAttribute('data-camera-scale')).toBe(before);
  });
});
