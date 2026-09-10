import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalyzerProjectStore } from '../../analyzer';
import type { SemanticAnalysis, SemanticEvidence, SemanticGraph, SemanticNode } from '../../analyzer/semantic/types';
import { ArchitectureDetail } from './ArchitectureDetail';
import { ArchitectureEvidenceList } from './ArchitectureEvidence';
import { architectureEvidencePaths } from './architectureEvidencePaths';

const evidence = (path: string): SemanticEvidence => ({ path, line: 2, endLine: 3, start: 8, end: 32, description: `参照: ${path.includes('api') ? 'API' : 'web'}` });
const paths = ['workspace/very-long-project-name/packages/api/src/shared/settings/config.ts', 'workspace/very-long-project-name/packages/web/src/shared/settings/config.ts'];
const items = paths.map(evidence);
const source = 'first\nsecond source\nthird source\nlast';
const sources = Object.fromEntries(paths.map(path => [path, source]));
const store: AnalyzerProjectStore = { files: [], facts: [], relations: [], evidence: [], sources, warnings: [], scannedAt: 'fixture' };
const analysis: SemanticAnalysis = { nodes: [], edges: [], warnings: [], coverage: [], stats: { files: 0, functions: 0, models: 0, unresolved: 0, elapsedMs: 0 } };
const makeNode = (): SemanticNode => ({ id: 'app', label: 'app', kind: 'subsystem', group: 'Project', confidence: 'source', evidence: items, attributes: {}, architecture: { kind: 'application', files: [], memberIds: [], roles: [], entryPaths: ['src/main.ts', 'web/main.ts'], context: [], environments: [], technologyNames: [], auxiliary: false } });
const noop = () => {};

describe('Architecture evidence locations and independent settings collections', () => {
  let host: HTMLDivElement, root: Root;
  beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
  const expand = async (details: HTMLDetailsElement) => act(async () => { details.open = true; details.dispatchEvent(new Event('toggle')); });
  const showNode = async (node: SemanticNode) => {
    const graph: SemanticGraph = { view: 'architecture-map', nodes: [node], edges: [] };
    await act(async () => root.render(<MemoryRouter><ArchitectureDetail node={node} graph={graph} visible={graph} sources={sources} store={store} analysis={analysis} onOpen={noop} onReveal={noop} onSelect={noop} onSelectEdge={noop} onJump={noop} onClose={noop} /></MemoryRouter>));
    const details = [...host.querySelectorAll('details')].find(d => d.querySelector('summary')?.textContent === '実行・配信・接続')!;
    await expand(details);
  };
  it('keeps same-named paths distinguishable without modifying raw evidence', () => {
    const before = JSON.stringify(items), shown = architectureEvidencePaths(items);
    expect(shown.get(paths[0]!)?.filename).toBe('config.ts');
    expect(shown.get(paths[0]!)?.parent).toContain('api/'); expect(shown.get(paths[1]!)?.parent).toContain('web/');
    expect(shown.get(paths[0]!)?.parent).not.toBe(shown.get(paths[1]!)?.parent); expect(JSON.stringify(items)).toBe(before);
    const long = ['a/' + 'common/'.repeat(15) + 'left/shared/config.ts', 'a/' + 'common/'.repeat(15) + 'right/shared/config.ts'].map(evidence);
    const result = architectureEvidencePaths(long); expect(result.get(long[0]!.path)?.parent).not.toBe(result.get(long[1]!.path)?.parent);
  });
  it('exposes filename and lines before expansion, then full copyable path and exact source range', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined); vi.stubGlobal('navigator', { clipboard: { writeText } });
    await act(async () => root.render(<ArchitectureEvidenceList evidence={items} sources={sources} />));
    const details = host.querySelector('details')!;
    expect(details.querySelector('summary strong')?.textContent).toBe('config.ts · L2–3'); expect(host.querySelector('pre')).toBeNull();
    await expand(details); expect(details.querySelector('code')?.textContent).toBe(paths[0]); expect(details.querySelector('code')?.tabIndex).toBe(0);
    expect(details.textContent).toContain('8–32'); expect(details.querySelector('pre')?.textContent).toContain('2  second source\n3  third source');
    await act(async () => { details.querySelector('button')!.click(); }); expect(writeText).toHaveBeenCalledWith(paths[0]); expect(details.querySelector('[role="status"]')?.textContent).toBe('コピーしました');
  });
  it('retains the selectable full path when clipboard permission is unavailable', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    await act(async () => root.render(<ArchitectureEvidenceList evidence={items} sources={sources} />)); await expand(host.querySelector('details')!);
    await act(async () => { host.querySelector('button')!.click(); }); expect(host.querySelector('[role="status"]')?.textContent).toContain('完全なパスを選択'); expect(host.querySelector('code')?.textContent).toBe(paths[0]);
  });
  it('counts only displayed entry declarations and distinguishes missing settings metadata from zero', async () => {
    const node = makeNode(), before = JSON.stringify(node); await showNode(node);
    expect(host.querySelector('[data-architecture-settings="entries"] h4')?.textContent).toBe('確認した入口の宣言：2件');
    expect(host.querySelectorAll('[data-architecture-settings="entries"] code')).toHaveLength(2);
    expect(host.querySelector('[data-architecture-settings="unknown"]')).not.toBeNull(); expect(host.querySelector('[data-architecture-settings="variants"]')).toBeNull(); expect(JSON.stringify(node)).toBe(before);
  });
  it('reports a recorded empty collection as zero independently of two entry declarations', async () => {
    const node = makeNode(); node.architecture!.configurationVariants = []; await showNode(node);
    expect(host.querySelector('[data-architecture-settings="variants"] h4')?.textContent).toBe('実行・配信の設定宣言：0件');
    expect(host.querySelectorAll('[data-architecture-settings="entries"] code')).toHaveLength(2); expect(host.querySelector('[data-architecture-settings="unknown"]')).toBeNull();
  });
  it('keeps execution variants and connection occurrences in their own counted collections', async () => {
    const node = makeNode();
    node.architecture!.configurationVariants = [{ environment: 'production', name: 'worker', inherited: [], evidence: [items[0]!] }];
    node.architecture!.identity = { status: 'unconfirmed', type: 'storage', reason: 'fixture', configurations: paths.map((path, i) => ({ id: `setting-${i}`, path, environment: i ? 'production' : 'development', evidence: [items[i]!] })) };
    const before = JSON.stringify(node); await showNode(node);
    expect(host.querySelector('[data-architecture-settings="variants"] h4')?.textContent).toContain('1件');
    expect(host.querySelector('[data-architecture-settings="connections"] h4')?.textContent).toContain('2件');
    expect(host.querySelectorAll('[data-architecture-settings="connections"] > details')).toHaveLength(2);
    await expand(host.querySelector('[data-architecture-settings="connections"] details')!);
    expect(host.querySelector('[data-architecture-settings="connections"] code')?.textContent).toBe(paths[0]);
    expect(JSON.stringify(node)).toBe(before);
  });
});
