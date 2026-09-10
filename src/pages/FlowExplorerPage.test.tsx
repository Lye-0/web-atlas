import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyzerSessionProvider, useAnalyzerSession, type AnalyzerProjectStore } from '../analyzer';
import { getSemanticAnalysis } from '../analyzer/semantic/client';
import type { SemanticAnalysis, SemanticNode } from '../analyzer/semantic/types';
import { AnalyzerPage } from './AnalyzerPage';
import type { SemanticFlowHoverHandler, SemanticFlowHoverTarget } from '../analyzer/semantic/flowRelationInteraction';

vi.mock('../components/analyzer/AnalyzerEmptyOrbit', () => ({ AnalyzerEmptyOrbit: () => null }));
vi.mock('../analyzer/semantic/client', () => ({ getSemanticAnalysis: vi.fn(), cancelSemanticAnalysis: vi.fn() }));
vi.mock('../components/analyzer/SemanticFlow3D', () => ({ SemanticFlow3D: ({ graph, camera, command, onCamera, showGroupBounds, hoverTarget, onHoverTarget, explicitPathNodeIds, onClear, onSelect }: { graph: { nodes: { id: string }[] }; camera?: { zoom: number }; command?: { kind: string; ids?: string[] }; onCamera: (camera: unknown) => void; showGroupBounds?: boolean; hoverTarget?: SemanticFlowHoverTarget; onHoverTarget?: SemanticFlowHoverHandler; explicitPathNodeIds?: ReadonlySet<string>; onClear: () => void; onSelect: (id: string) => void }) =>
  <div data-cloud-path={[...explicitPathNodeIds ?? []].join(",")} data-cloud-count={graph.nodes.length} data-cloud-zoom={camera?.zoom ?? ''} data-cloud-command={command ? `${command.kind}:${command.ids?.join(',')}` : ''} data-cloud-bounds={String(showGroupBounds)} data-cloud-hover={hoverTarget?.id ?? ''}>
    <button type="button" onClick={onClear}>3D選択解除</button><button type="button" onClick={() => onSelect("unrelated")}>3D関係0を選択</button>
    <button type="button" onClick={() => onCamera({ position: [20, 30, 40], target: [1, 2, 3], zoom: .73 })}>3Dカメラを保存</button>
    <button type="button" onClick={() => onHoverTarget?.({ kind: 'node', id: 'save' }, { source: 'test-graph', modality: 'pointer' })}>3D相手ホバー</button>
  </div> }));

const node = (id: string, path: string): SemanticNode => ({ id, label: id, kind: 'function', path, line: 2, endLine: 3, group: 'API', confidence: 'source', evidence: [{ path, start: 0, end: 15, line: 2, endLine: 3, description: `${id} declaration` }], attributes: {} });
const analysis: SemanticAnalysis = { nodes: [
  { ...node('run', 'src/api/run.ts'), attributes: { entry: true } }, node('save', 'src/db/save.ts'), node('caller', 'src/ui/caller.ts'), node('unrelated', 'src/misc/util.ts'),
  ...Array.from({ length: 30 }, (_, i) => node(`helper-${String(i).padStart(2, '0')}`, 'src/api/run.ts')),
  { ...node('unknown', 'src/api/run.ts'), label: 'client.unknown', kind: 'external', confidence: 'unresolved' },
], edges: [
  { id: 'calls-save', source: 'run', target: 'save', kind: 'calls', label: 'save()', views: ['function-call-flow', 'runtime-flow'], confidence: 'source', evidence: [] },
  { id: 'calls-run', source: 'caller', target: 'run', kind: 'calls', label: 'run()', views: ['function-call-flow', 'runtime-flow'], confidence: 'source', evidence: [] },
  { id: 'unknown-1', source: 'run', target: 'unknown', kind: 'calls', label: 'client.unknown()', views: ['function-call-flow'], confidence: 'unresolved', evidence: [] },
], coverage: [], warnings: [], stats: { files: 4, functions: 34, models: 0, unresolved: 1, elapsedMs: 1 } };
const store: AnalyzerProjectStore = { files: [], facts: [], relations: [], evidence: [], sources: Object.fromEntries(['src/api/run.ts', 'src/db/save.ts', 'src/ui/caller.ts', 'src/misc/util.ts'].map(path => [path, 'export function run() {}\nsource line\nsource line'])), warnings: [], scannedAt: 'explorer' };

function Harness({ project = store }: { project?: AnalyzerProjectStore }) {
  const { state, replaceProject } = useAnalyzerSession(), navigate = useNavigate();
  useEffect(() => replaceProject(project), [replaceProject, project]);
  return <><button data-browser-back onClick={() => navigate(-1)}>Browser back</button><button data-browser-forward onClick={() => navigate(1)}>Browser forward</button>
    <output data-navigation-state data-selected-edge={state.views['function-call-flow'].selectedEdgeId}>{JSON.stringify(state.views['function-call-flow'].explorer?.twoD)}</output><AnalyzerPage /></>;
}

describe('Flow explorer locations and visits', () => {
  let host: HTMLDivElement, root: Root;
  const click = async (button: Element) => act(async () => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  const button = (label: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent === label)!;
  const openBlock = (label: string) => click([...host.querySelectorAll<HTMLButtonElement>('.semantic-explorer-block')].find(item => item.querySelector('strong')?.textContent === label)!);
  const search = async (value: string) => act(async () => { const input = host.querySelector<HTMLInputElement>('input[type="search"]')!; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); });
  const center = () => host.querySelector('.semantic-flow-2d')?.getAttribute('data-explorer-center');
  const camera = () => ['data-camera-x', 'data-camera-y', 'data-camera-scale'].map(key => host.querySelector('.semantic-flow-2d')?.getAttribute(key));
  const openRunFile = async () => { await openBlock('src'); await openBlock('api'); await openBlock('run.ts'); };

  beforeEach(async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('ResizeObserver', class { constructor(private callback: ResizeObserverCallback) {} observe() { this.callback([{ contentRect: { width: 1000, height: 620 } } as ResizeObserverEntry], this as unknown as ResizeObserver); } disconnect() {} });
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1)); vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.mocked(getSemanticAnalysis).mockImplementation(() => ({ promise: Promise.resolve(analysis), unsubscribe: () => {} }));
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    await import('./SemanticAnalyzerPage');
    await act(async () => root.render(<MemoryRouter initialEntries={['/analyzer/function-call-flow']}><AnalyzerSessionProvider><Harness /></AnalyzerSessionProvider></MemoryRouter>));
  });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

  it('opens only direct hierarchy children and restores file scroll, selection and relation camera through Back/Forward', async () => {
    expect([...host.querySelectorAll('.semantic-explorer-block strong')].map(item => item.textContent)).toEqual(['src', '定義先が未特定の呼び出し']);
    expect(button('Fit').disabled).toBe(true);
    await openBlock('src');
    expect([...host.querySelectorAll('.semantic-explorer-block strong')].map(item => item.textContent)).toEqual(['api', 'db', 'misc', 'ui']);
    await openBlock('api'); await openBlock('run.ts');
    expect(host.querySelectorAll('[data-node-open-id]')).toHaveLength(31);
    const scroll = host.querySelector<HTMLDivElement>('.semantic-explorer-blocks')!;
    await act(async () => { scroll.scrollTop = 180; scroll.dispatchEvent(new Event('scroll', { bubbles: true })); });
    await openBlock('run');
    expect(center()).toBe('run');
    expect([...host.querySelectorAll('[data-node-id]')].map(item => item.getAttribute('data-node-id')).sort()).toEqual(['caller', 'run', 'save', 'unknown']);
    await click(host.querySelector<SVGElement>('[data-node-id="save"]') as unknown as HTMLButtonElement);
    expect(center()).toBe('run'); expect(host.querySelector('.semantic-detail h3')?.textContent).toBe('save');
    await click(button('+')); const savedCamera = camera();
    await click(button('この要素を中心に見る'));
    expect(center()).toBe('save'); expect(host.querySelector('.semantic-explorer-breadcrumb')?.textContent).toContain('db');
    await click(button('戻る'));
    expect(center()).toBe('run'); expect(camera()).toEqual(savedCamera); expect(host.querySelector('.semantic-detail h3')?.textContent).toBe('save');
    await click(host.querySelector<HTMLButtonElement>('[data-browser-forward]')!); expect(center()).toBe('save');
    await click(host.querySelector<HTMLButtonElement>('[data-browser-back]')!); expect(center()).toBe('run');
    await click(button('戻る'));
    expect(host.querySelector<HTMLDivElement>('.semantic-explorer-blocks')?.scrollTop).toBe(180);
    expect(host.querySelectorAll('[data-node-open-id]')).toHaveLength(31);
    await openBlock('run'); await click(button('親へ'));
    expect(host.querySelector('.semantic-explorer-breadcrumb')?.textContent).toContain('run.ts'); expect(center()).toBeUndefined();
    await click(button('親へ'));
    expect([...host.querySelectorAll('.semantic-explorer-block strong')].map(item => item.textContent)).toEqual(['run.ts']);
  });

  it.each(['3D選択解除', '3D関係0を選択'])('does not resurrect a cleared relationship on normal mode visits after %s', async action => {
    await openRunFile(); await openBlock('run');
    await act(async () => { const select = host.querySelector<HTMLSelectElement>('[aria-label="中心からの関係の深さ"]')!; select.value = '2'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    await click(button('3D'));
    expect(host.querySelector('[data-cloud-path]')?.getAttribute('data-cloud-path')).toContain('run');
    await click(button(action));
    expect(host.querySelector('[data-cloud-path]')?.getAttribute('data-cloud-path')).toBe('');
    await click(button('3Dカメラを保存')); await click(button('自動省略：ON')); await click(button('自動省略：OFF'));
    await click(button('2D')); expect(center()).toBe('run'); await click(button('3D'));
    expect(host.querySelector('[data-cloud-path]')?.getAttribute('data-cloud-path')).toBe('');
  });

  it('searches the full filtered project without moving until candidate selection and keeps scope on clear', async () => {
    await openRunFile();
    const scope = host.querySelector('.semantic-explorer-blocks')?.getAttribute('data-explorer-scope');
    await search('save');
    expect(host.querySelector('.semantic-explorer-blocks')?.getAttribute('data-explorer-scope')).toBe(scope);
    expect(host.querySelector('[role="option"]')?.textContent).toContain('src/db/save.ts:2');
    await click(host.querySelector<HTMLButtonElement>('[role="option"]')!);
    expect(center()).toBe('save'); expect(host.querySelector('.semantic-explorer-breadcrumb')?.textContent).toContain('db');
    expect(Number(camera()[2])).toBeLessThanOrEqual(1.05);
    const before = camera(); await search(''); expect(center()).toBe('save'); expect(camera()).toEqual(before);
    await click(button('戻る')); expect(host.querySelector('.semantic-explorer-blocks')?.getAttribute('data-explorer-scope')).toBe(scope);
    await search('client.unknown'); expect(host.querySelector('[role="option"]')?.textContent).toContain('呼び出し箇所: src/api/run.ts:2');
  });

  it('shows semantic module and compact callee search names only in 2D while keeping canonical matching, selection and query', async () => {
    const initializer: SemanticNode = { ...node('module:canonical', 'scripts/build-extension.mjs'), label: '<module>', line: undefined, endLine: undefined, evidence: [], attributes: { initializer: true } };
    const callee = "records.filter((record) => record.fullName.startsWith('refs/heads/')).map";
    const call: SemanticNode = { ...node('call:canonical', 'src/git/parsers/refParser.ts'), label: callee, kind: 'external', confidence: 'unresolved', line: 5, attributes: { callee } };
    const displayAnalysis: SemanticAnalysis = { ...analysis, nodes: [...analysis.nodes, initializer, call], edges: [...analysis.edges,
      { ...analysis.edges[0]!, id: 'module-call', source: initializer.id, target: call.id },
    ] };
    const before = JSON.stringify(displayAnalysis);
    vi.mocked(getSemanticAnalysis).mockImplementation(() => ({ promise: Promise.resolve(displayAnalysis), unsubscribe: () => {} }));
    await act(async () => root.render(<MemoryRouter initialEntries={['/analyzer/function-call-flow']}><AnalyzerSessionProvider><Harness project={{ ...store, scannedAt: 'display-search', sources: {
      ...store.sources, [initializer.path!]: 'await build();', [call.path!]: callee,
    } }} /></AnalyzerSessionProvider></MemoryRouter>));
    const query = () => host.querySelector<HTMLInputElement>('input[type="search"]')!.value;
    const option = () => host.querySelector<HTMLButtonElement>('[role="option"]')!;
    await search('<module>');
    expect(option().querySelector('strong')?.textContent).toBe('ファイル直下の処理');
    expect(option().querySelector('small')?.textContent).toBe('scripts/build-extension.mjs');
    expect(option().title).toContain('ファイル直下の処理\nscripts/build-extension.mjs');
    await click(option());
    expect(center()).toBe(initializer.id); expect(query()).toBe('<module>');
    expect(option().getAttribute('aria-selected')).toBe('true');
    expect(host.querySelector('.semantic-detail h3')?.textContent).toBe('<module>');
    await search('refs/heads/');
    expect(center()).toBe(initializer.id);
    expect(option().querySelector('strong')?.textContent).toBe('records.filter(...).map(...)');
    expect(option().querySelector('small')?.textContent).toBe('呼び出し箇所: src/git/parsers/refParser.ts:5');
    expect(option().title).not.toContain('record.fullName');
    await click(option());
    expect(center()).toBe(call.id); expect(query()).toBe('refs/heads/');
    expect(option().getAttribute('aria-selected')).toBe('true');
    expect(host.querySelector('.semantic-detail h3')?.textContent).toBe(callee);
    await click(button('3D'));
    expect(query()).toBe('refs/heads/');
    expect(option().querySelector('strong')?.textContent).toBe(callee);
    expect(option().getAttribute('aria-selected')).toBe('true');
    await click(button('2D'));
    expect(center()).toBe(call.id); expect(query()).toBe('refs/heads/');
    expect(option().querySelector('strong')?.textContent).toBe('records.filter(...).map(...)');
    expect(JSON.stringify(displayAnalysis)).toBe(before);
  });

  it('restores mode-specific places while explicit jumps carry the same selected ID and 3D keeps the whole filter', async () => {
    await openRunFile(); await openBlock('run');
    await click(button('3D上で位置を見る'));
    expect(host.querySelector('[data-cloud-count]')?.getAttribute('data-cloud-count')).toBe(String(analysis.nodes.length));
    expect(host.querySelector('[data-cloud-command]')?.getAttribute('data-cloud-command')).toBe('focus:run');
    await click(button('3Dカメラを保存')); await click(button('2D'));
    expect(center()).toBe('run');
    await click(host.querySelector<SVGElement>('[data-node-id="save"]') as unknown as HTMLButtonElement);
    await click(button('3D'));
    expect(host.querySelector('[data-cloud-zoom]')?.getAttribute('data-cloud-zoom')).toBe('0.73');
    expect(host.querySelector('[data-cloud-command]')?.getAttribute('data-cloud-command')).toBe('');
    await click(button('2Dで詳しく見る')); expect(center()).toBe('save');
    expect(Number(camera()[2])).toBeLessThanOrEqual(1.05);
    await click(button('定義へ移動')); expect(center()).toBeUndefined();
    expect(host.querySelector('[data-node-open-id="save"]')).not.toBeNull();
  });

  it('keeps bounds off across tabs 6/7 and changes only the bounds prop while a counterpart is highlighted', async () => {
    await openRunFile(); await openBlock('run'); await search('run'); await click(button('3D'));
    const bounds = () => host.querySelector<HTMLButtonElement>('[aria-label="分類の囲い"]')!;
    expect(bounds().getAttribute('aria-pressed')).toBe('true');
    await click(button('3Dカメラを保存')); await click(button('3D相手ホバー'));
    const cloud = () => host.querySelector('[data-cloud-count]')!;
    const before = cloud().outerHTML, detail = host.querySelector('.semantic-detail h3')?.textContent;
    await click(bounds());
    expect(bounds().getAttribute('aria-pressed')).toBe('false');
    expect(cloud().outerHTML).toBe(before.replace('data-cloud-bounds="true"', 'data-cloud-bounds="false"'));
    expect(host.querySelector<HTMLInputElement>('input[type="search"]')?.value).toBe('run');
    expect(host.querySelector('.semantic-detail h3')?.textContent).toBe(detail);
    await act(async () => host.querySelector<HTMLAnchorElement>('a[href="/analyzer/runtime-flow"]')!.click());
    expect(bounds()).toBeNull();
    await click(button('3D'));
    expect(bounds().getAttribute('aria-pressed')).toBe('false');
    expect(cloud().getAttribute('data-cloud-hover')).toBe('');
    await act(async () => host.querySelector<HTMLAnchorElement>('a[href="/analyzer/function-call-flow"]')!.click());
    expect(bounds().getAttribute('aria-pressed')).toBe('false');
    expect(cloud().getAttribute('data-cloud-zoom')).toBe('0.73');
    expect(cloud().getAttribute('data-cloud-hover')).toBe('');
    await click(button('2D')); expect(bounds()).toBeNull(); expect(center()).toBe('run');
  });

  it('does not revive a removed counterpart hover after Parent and Back retain the same selected object', async () => {
    await openRunFile(); await openBlock('run');
    const peer = host.querySelector('[data-node-id="save"]')!;
    await act(async () => { peer.dispatchEvent(new MouseEvent('pointerover', { bubbles: true })); peer.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, buttons: 0 })); });
    expect(host.querySelector('[data-edge-id="calls-save"]')?.getAttribute('data-flow-emphasized')).toBe('true');
    await click(button('親へ'));
    expect(center()).toBeUndefined(); expect(host.querySelector('.semantic-detail h3')?.textContent).toBe('run');
    await click(button('戻る'));
    expect(center()).toBe('run'); expect(host.querySelector('.semantic-detail h3')?.textContent).toBe('run');
    expect(host.querySelector('[data-edge-id="calls-save"]')?.getAttribute('data-flow-emphasized')).toBeNull();
  });

  it('uses grounded Runtime entries and the explicit membership fallback with the same drilldown operations', async () => {
    const runtime: SemanticAnalysis = { ...analysis, nodes: [...analysis.nodes,
      { ...node('runtime', 'wrangler.jsonc'), label: 'Cloudflare Workers', kind: 'resource', attributes: { resourceType: 'runtime', entryPath: 'src/api/run.ts' } },
    ], edges: [...analysis.edges,
      { id: 'runtime-entry', source: 'runtime', target: 'run', kind: 'runtime-entry', label: 'entry point', views: ['runtime-flow'], confidence: 'source', evidence: [] },
      { id: 'execute-save', source: 'run', target: 'save', kind: 'executes', label: 'database', views: ['runtime-flow'], confidence: 'source', evidence: [] },
    ] };
    vi.mocked(getSemanticAnalysis).mockImplementation(() => ({ promise: Promise.resolve(runtime), unsubscribe: () => {} }));
    const runtimeStore = { ...store, sources: { ...store.sources, 'wrangler.jsonc': '{"main":"src/api/run.ts"}' }, scannedAt: 'runtime-boundaries' };
    await act(async () => root.render(<MemoryRouter initialEntries={['/analyzer/function-call-flow']}><AnalyzerSessionProvider><Harness project={runtimeStore} /></AnalyzerSessionProvider></MemoryRouter>));
    await act(async () => host.querySelector<HTMLAnchorElement>('a[href="/analyzer/runtime-flow"]')!.click());
    const roots = [...host.querySelectorAll('.semantic-explorer-block strong')].map(item => item.textContent);
    expect(roots).toContain('Cloudflare Workers'); expect(roots).toContain('実行環境未判定・所属別表示');
    await openBlock('Cloudflare Workers'); await openBlock('src'); await openBlock('api'); await openBlock('run.ts'); await openBlock('run');
    expect(center()).toBe('run');
    await click(host.querySelector('[data-node-id="save"]')!); expect(center()).toBe('run');
    await click(button('この要素を中心に見る'));
    expect(center()).toBe('save'); expect(host.querySelector('.semantic-explorer-breadcrumb')?.textContent).toContain('実行環境未判定・所属別表示');
    expect(host.querySelector('.semantic-explorer-breadcrumb')?.textContent).toContain('db');
    await click(button('3D上で位置を見る'));
    expect(host.querySelector('[data-cloud-count]')?.getAttribute('data-cloud-count')).toBe('3');
    expect(host.querySelector('.semantic-explorer-runtime-note')?.textContent).toContain('実行環境未判定・所属別表示');
  });

  it.each(['この関係を表示', '選択へ移動'])('preserves an outside edge selection and evidence until explicit %s opens its source context', async action => {
    const outsideEdge = { id: 'save-to-unrelated', source: 'save', target: 'unrelated', kind: 'calls' as const, label: 'persist()', views: ['function-call-flow' as const], confidence: 'source' as const,
      evidence: [{ path: 'src/db/save.ts', start: 22, end: 33, line: 2, endLine: 2, description: 'save calls persist' }] };
    vi.mocked(getSemanticAnalysis).mockImplementation(() => ({ promise: Promise.resolve({ ...analysis, edges: [...analysis.edges, outsideEdge] }), unsubscribe: () => {} }));
    await act(async () => root.render(<MemoryRouter initialEntries={['/analyzer/function-call-flow']}><AnalyzerSessionProvider><Harness project={{ ...store, scannedAt: 'outside-edge' }} /></AnalyzerSessionProvider></MemoryRouter>));
    await openRunFile(); await openBlock('run');
    await click(host.querySelector('[data-node-id="save"]')!);
    await click(button('persist() · ソースで確認'));
    const selectedEdge = () => host.querySelector('[data-navigation-state]')?.getAttribute('data-selected-edge');
    expect(center()).toBe('run'); expect(selectedEdge()).toBe(outsideEdge.id);
    expect(host.querySelector('[data-node-id="unrelated"]')).toBeNull();
    expect(host.querySelector('[data-edge-id="save-to-unrelated"]')).toBeNull();
    expect(host.querySelector('.semantic-detail h3')?.textContent).toBe('persist()');
    expect(host.querySelector('.semantic-evidence')?.textContent).toContain('save calls persist');
    expect(host.querySelector('.semantic-explorer-selection')?.textContent).toContain('現在の関係図の外で選択');
    const before = camera();
    await click(button(action));
    expect(center()).toBe('save'); expect(selectedEdge()).toBe(outsideEdge.id);
    expect(host.querySelector('[data-node-id="unrelated"]')).not.toBeNull();
    expect(host.querySelector('[data-edge-id="save-to-unrelated"]')).not.toBeNull();
    expect(host.querySelector('.semantic-evidence')?.textContent).toContain('save calls persist');
    expect(host.querySelector('.semantic-explorer-selection')?.textContent).not.toContain('現在の関係図の外で選択');
    await click(button('戻る'));
    expect(center()).toBe('run'); expect(camera()).toEqual(before); expect(selectedEdge()).toBe(outsideEdge.id);
    expect(host.querySelector('.semantic-evidence')?.textContent).toContain('save calls persist');
  });

  it('focuses both endpoints of an existing edge when opening 3D for the first time', async () => {
    await openRunFile(); await openBlock('run'); await click(button('save() · ソースで確認'));
    expect(host.querySelector('.semantic-detail h3')?.textContent).toBe('save()');
    await click(button('3D'));
    expect(host.querySelector('[data-cloud-command]')?.getAttribute('data-cloud-command')).toBe('focus:run,save');
    expect(host.querySelector('.semantic-detail h3')?.textContent).toBe('save()');
    await click(button('2D')); expect(center()).toBe('run');
    expect(host.querySelector('.semantic-detail h3')?.textContent).toBe('save()');
  });

  it('filters lines around the selected neighbor while keeping the local center, nodes and positions unchanged', async () => {
    await openRunFile(); await openBlock('run');
    const before = camera(), transforms = [...host.querySelectorAll('[data-node-id]')].map(node => [node.getAttribute('data-node-id'), node.getAttribute('transform')]);
    await click(host.querySelector('[data-node-id="save"]')!);
    await click(host.querySelector<HTMLButtonElement>('[aria-controls="semantic-flow-settings"]')!);
    const direction = [...host.querySelectorAll<HTMLSelectElement>('select')].find(select => select.parentElement?.textContent?.startsWith('線の方向（選択対象）'))!;
    await act(async () => { direction.value = 'incoming'; direction.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(center()).toBe('run'); expect(camera()).toEqual(before);
    expect([...host.querySelectorAll('[data-node-id]')].map(node => [node.getAttribute('data-node-id'), node.getAttribute('transform')])).toEqual(transforms);
    expect(host.querySelector('[data-edge-id="calls-save"]')).not.toBeNull();
    await act(async () => { direction.value = 'outgoing'; direction.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(host.querySelector('[data-edge-id="calls-save"]')).toBeNull();
    expect(host.querySelector('.semantic-flow-2d')?.getAttribute('data-edge-count')).toBe('3');
    expect(host.querySelector('.semantic-explorer-local-count')?.textContent).toContain('関係総数 3');
    await click(host.querySelector('.semantic-flow-2d')!);
    expect(direction.value).toBe('outgoing'); expect(host.querySelectorAll('[data-edge-id]')).toHaveLength(3);
    await click(host.querySelector('[data-node-id="run"]')!);
    await click(button('save() · ソースで確認'));
    expect(host.querySelector('[data-edge-id="calls-save"]')).not.toBeNull(); expect(center()).toBe('run');
  });
});
