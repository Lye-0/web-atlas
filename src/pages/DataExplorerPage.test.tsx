import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyzerSessionProvider, filesFromDirectoryHandle, scanProjectFiles, useAnalyzerSession, type AnalyzerProjectStore, type DirectoryHandleLike } from '../analyzer';
import { AnalyzerPage } from './AnalyzerPage';
import { getSemanticAnalysis } from '../analyzer/semantic/client';
import type { SemanticAnalysis } from '../analyzer/semantic/types';
import { semanticTraceCache } from '../analyzer/semantic/traceCache';

vi.mock('../analyzer', async importOriginal => ({ ...await importOriginal<typeof import('../analyzer')>(), filesFromDirectoryHandle: vi.fn(), scanProjectFiles: vi.fn() }));
vi.mock('../analyzer/semantic/client', () => ({ getSemanticAnalysis: vi.fn(), cancelSemanticAnalysis: vi.fn() }));
vi.mock('../components/analyzer/SemanticFlow3D', () => ({ SemanticFlow3D: () => <div>3D test surface</div> }));
vi.mock('../components/analyzer/AnalyzerEmptyOrbit', () => ({ AnalyzerEmptyOrbit: () => null }));
const source = 'interface Payload { id: string } function handle(payload: Payload) { return payload.id; }';
const evidence = [{ path: 'src/app.ts', start: 0, end: source.length, line: 1, endLine: 1, description: 'fixture source' }];
const analysis: SemanticAnalysis = { nodes: [
  { id: 'payload', kind: 'value', label: 'payload.id', path: 'src/app.ts', line: 1, group: 'Data', confidence: 'source', evidence, attributes: { owner: 'handle', ownerName: 'handle' },
    data: { role: 'property-read', expression: 'payload.id', propertyPath: ['id'] }, links: [{ targetId: 'Payload', view: 'data-model', fieldId: 'Payload.id', reason: '項目 id の定義', evidence }] },
  { id: 'Payload', kind: 'model', label: 'Payload', path: 'src/app.ts', line: 1, group: 'Data', confidence: 'source', evidence, attributes: {}, fields: [{ id: 'Payload.id', name: 'id', type: 'string', optional: false, nullable: false, evidence }],
    model: { domain: 'code', kind: 'interface', definition: 'interface Payload { id: string }', expansion: 'expanded', reasons: [] }, links: [{ targetId: 'payload', view: 'data-flow', fieldId: 'Payload.id', reason: 'payload.id の利用', evidence }] },
  { id: 'Choice', kind: 'model', label: 'Choice', path: 'src/app.ts', line: 1, group: 'Data', confidence: 'source', evidence, attributes: {}, fields: [],
    model: { domain: 'code', kind: 'literal-union', definition: "'a' | 'b'", expansion: 'expanded', reasons: [], choices: [{ label: "'a'", evidence }, { label: "'b'", evidence }] } },
], edges: [], coverage: [], warnings: [], stats: { files: 1, functions: 1, models: 2, unresolved: 0, elapsedMs: 1 } };
const store: AnalyzerProjectStore = { files: [], facts: [], relations: [], evidence: [], sources: { 'src/app.ts': source }, warnings: [], scannedAt: 'first' };
const folder = { name: 'fixture', kind: 'directory', values: async function* () {} } as unknown as DirectoryHandleLike;
function Project({ project, handle }: { project: AnalyzerProjectStore; handle?: DirectoryHandleLike }) {
  const { state, replaceProject } = useAnalyzerSession(); useEffect(() => replaceProject(project, handle), [project, handle, replaceProject]);
  return <><span data-current-project={state.store?.scannedAt} /><AnalyzerPage /></>;
}
function deferred<T>() { let resolve!: (value: T) => void, reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

describe('data explorer navigation and asynchronous ownership', () => {
  let host: HTMLDivElement, root: Root;
  const render = (project = store, handle?: DirectoryHandleLike) => act(async () => root.render(<MemoryRouter initialEntries={['/analyzer/data-flow']}><AnalyzerSessionProvider><Project project={project} handle={handle} /></AnalyzerSessionProvider></MemoryRouter>));
  const button = (text: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === text)!;
  const tab = (view: string) => act(async () => host.querySelector<HTMLAnchorElement>(`a[href="/analyzer/${view}"]`)!.click());
  const search = (text: string) => act(async () => { const input = host.querySelector<HTMLInputElement>('input[type="search"]')!; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text); input.dispatchEvent(new Event('input', { bubbles: true })); });
  const choose = async (text: string) => { await search(text); await act(async () => host.querySelector<HTMLButtonElement>('[role="option"]')!.click()); };
  const importFile = (file: { name: string; size: number; text: () => Promise<string> }) => act(async () => { const input = host.querySelector<HTMLInputElement>('input[aria-label="実行ログ・Traceファイル"]')!; Object.defineProperty(input, 'files', { configurable: true, value: [file] }); input.dispatchEvent(new Event('change', { bubbles: true })); });
  beforeEach(async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('ResizeObserver', class { constructor(private callback: ResizeObserverCallback) {} observe() { this.callback([{ contentRect: { width: 1000, height: 600 } } as ResizeObserverEntry], this as unknown as ResizeObserver); } disconnect() {} });
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1)); vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.mocked(getSemanticAnalysis).mockReturnValue({ promise: Promise.resolve(analysis), unsubscribe: () => {} });
    host = document.createElement('div'); document.body.append(host); root = createRoot(host); await import('./SemanticAnalyzerPage'); await render();
  });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); semanticTraceCache.delete(store); vi.clearAllMocks(); vi.unstubAllGlobals(); });
  it('uses the shared shell and returns from an exact field link without losing the source location or query', async () => {
    await tab('data-model'); await search('Choice'); await tab('data-flow'); await choose('payload.id');
    const center = host.querySelector('.semantic-flow-2d')?.getAttribute('data-explorer-center');
    await act(async () => button('項目 id の定義 ↗').click());
    expect(host.querySelector('.semantic-object-list')).toBeNull(); expect(host.querySelector('.semantic-data-field-detail')?.textContent).toContain('id');
    expect(host.querySelector<HTMLInputElement>('input[type="search"]')!.value).toBe('Choice');
    await act(async () => button('戻る').click());
    expect(host.querySelector('.semantic-flow-2d')?.getAttribute('data-explorer-center')).toBe(center);
    expect(host.querySelector<HTMLInputElement>('input[type="search"]')!.value).toBe('payload.id');
  });
  it('renders literal choices and no empty field table or inapplicable trace controls', async () => {
    await tab('data-model'); await choose('Choice');
    expect(host.querySelector('.semantic-data-choices')?.textContent).toContain("'a'"); expect(host.querySelector('.semantic-data-choices')?.textContent).toContain("'b'");
    expect(host.querySelector('.semantic-fields, .semantic-data-fields')).toBeNull();
    await act(async () => button('詳細設定').click()); expect(button('実行データを読み込む')).toBeUndefined();
    expect(host.textContent).toContain('モデル定義との比較用サンプルがありません');
  });
  it('does not present storage column null/default declarations as INSERT requiredness', async () => {
    const storageAnalysis: SemanticAnalysis = { ...analysis, nodes: analysis.nodes.map(node => node.id === 'Payload' ? { ...node,
      model: { ...node.model!, domain: 'storage', kind: 'table' }, fields: [{ id: 'created', name: 'createdAt', type: "text('created_at').notNull().default('epoch')", optional: false, nullable: false, default: "'epoch'", defaultSource: 'database', evidence }] } : node) };
    vi.mocked(getSemanticAnalysis).mockReturnValue({ promise: Promise.resolve(storageAnalysis), unsubscribe: () => {} });
    await render({ ...store, scannedAt: 'storage' }); await tab('data-model'); await choose('Payload');
    const detail = host.querySelector('.semantic-data-structure')?.textContent;
    expect(detail).not.toContain('省略不可'); expect(detail).toContain('null不可'); expect(detail).toContain('既定値あり'); expect(detail).toContain('INSERT時に必要な入力');
    await act(async () => button('createdAt').click()); expect(host.querySelector('.semantic-data-field-detail')?.textContent).toContain('既定値（DB定義）');
  });
  it('ignores a file read that finishes after the project changes', async () => {
    const file = deferred<string>(); await importFile({ name: 'old.json', size: 10, text: () => file.promise });
    await render({ ...store, scannedAt: 'replacement' }); await act(async () => file.resolve(JSON.stringify({ version: 1, spans: [{ name: 'old', spanId: 's', traceId: 't' }] })));
    expect(semanticTraceCache.get(store)).toBeUndefined(); expect(host.querySelector('.semantic-trace-info')).toBeNull(); expect(host.querySelector('[data-current-project]')?.getAttribute('data-current-project')).toBe('replacement');
  });
  it('ignores an older failed read after a newer successful trace import', async () => {
    const file = deferred<string>(); await importFile({ name: 'old.json', size: 10, text: () => file.promise });
    await importFile({ name: 'new.json', size: 10, text: async () => JSON.stringify({ version: 1, spans: [{ name: 'new', spanId: 's', traceId: 't', attributes: { 'data.input.name': 'input' } }] }) });
    await act(async () => file.reject(new Error('stale read failed')));
    expect(host.querySelector('.semantic-trace-info')?.textContent).toContain('new.json'); expect(host.querySelector('[role="alert"]')).toBeNull();
  });
  it('ignores a pending import after moving to another view', async () => {
    const file = deferred<string>(); await importFile({ name: 'old.json', size: 10, text: () => file.promise }); await tab('data-model');
    await act(async () => file.resolve('invalid JSON'));
    expect(host.querySelector('[role="alert"]')).toBeNull(); expect(semanticTraceCache.get(store)).toBeUndefined();
  });
  it('cannot replace a newer project with an old rescan result', async () => {
    await render(store, folder);
    const scan = deferred<AnalyzerProjectStore>(); vi.mocked(filesFromDirectoryHandle).mockResolvedValue([]); vi.mocked(scanProjectFiles).mockReturnValue(scan.promise);
    await act(async () => button('詳細設定').click()); await act(async () => button('再解析').click());
    await render({ ...store, scannedAt: 'new-project' }); await act(async () => scan.resolve({ ...store, scannedAt: 'old-rescan' }));
    expect(host.querySelector('[data-current-project]')?.getAttribute('data-current-project')).toBe('new-project'); expect(host.querySelector('[role="alert"]')).toBeNull();
  });
});
