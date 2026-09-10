import { act, useCallback, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalyzerViewSession, AnalyzerViewSessionUpdate } from '../../analyzer/session';
import type { SemanticGraph, SemanticNode } from '../../analyzer/semantic/types';
import { buildSemanticExplorer, canOpenArchitectureScope, explorerBreadcrumbs } from '../../analyzer/semantic/semanticExplorer';
import { recordExplorerCamera, recordExplorerSelection } from '../../analyzer/semantic/semanticExplorerState';
import { ArchitectureNavigation } from './ArchitectureNavigation';
import { useArchitectureNodeGesture } from './useArchitectureNodeGesture';
import { useSemanticExplorerNavigation } from './useSemanticExplorerNavigation';

const node = (id: string, parentId?: string): SemanticNode => ({ id, label: id, kind: 'subsystem', group: parentId ?? 'Project', confidence: 'source', evidence: [], attributes: {},
  architecture: { kind: parentId ? 'component' : 'application', parentId, files: [], memberIds: [], roles: [], entryPaths: [], context: [], environments: [], technologyNames: [], auxiliary: false } });
const graph: SemanticGraph = { view: 'architecture-map', nodes: [node('API'), node('web'), node('service', 'API'), node('module', 'service'), node('unit', 'module'), node('leaf', 'unit'), node('web-child', 'web'), { ...node('aggregate'), attributes: { displayAggregate: true } }, node('aggregate-child', 'aggregate')], edges: [] };
const explorer = buildSemanticExplorer(graph, new Set());
const noFocus = () => {};
function Harness() {
  const [session, setSession] = useState<AnalyzerViewSession>({ search: 'keep', filter: 'all', expandedPresentationIds: new Set(), detailOpen: false, flow: { mode: '2d', expandedGroupIds: [] } });
  const updateView = useCallback((_view: string, update: AnalyzerViewSessionUpdate) => setSession(current => typeof update === 'function' ? update(current) : { ...current, ...update }), []);
  const navigation = useSemanticExplorerNavigation({ view: 'architecture-map', scanVersion: 1, session, explorer, edges: [], ready: true, updateView, onFocus: noFocus });
  const select = (id: string) => setSession(current => recordExplorerSelection(current, { selectedNodeId: id, detailOpen: true }));
  const gesture = useArchitectureNodeGesture(navigation.visitId, true, navigation.canOpenScope, navigation.openScope, select);
  return <div {...gesture.bindings}><output>{JSON.stringify(session)}</output>
    <ArchitectureNavigation explorer={explorer} graph={graph} mode="2d" selectedId={session.selectedNodeId} navigation={{ location: navigation.location, visitId: navigation.visitId, scrollTop: 0, projectLabel: 'fixture', canBack: navigation.canBack, canOpenScope: navigation.canOpenScope, onBack: navigation.back, onParent: navigation.parent, onProject: navigation.project, onOpenScope: navigation.openScope, onOpenNode: navigation.openNode, onJumpMode: navigation.jumpMode, onScroll: navigation.saveScroll, onCenter: navigation.openNode, onDefinition: navigation.openDefinition, onDepth: () => {}, onRevealSelection: () => {} }} />
    {graph.nodes.map(n => <button key={n.id} data-node={n.id} onClick={event => gesture.onNodeClick?.(n.id, event)}>{n.id}</button>)}
    <button data-duplicate onClick={() => { navigation.openScope('API'); navigation.openScope('API'); }}>open twice</button>
    <button data-same onClick={() => navigation.openScope(navigation.location.scopeId)}>same</button>
    <button data-camera onClick={() => setSession(current => recordExplorerCamera(current, '2d', { x: 91, y: 32, scale: .75 }))}>camera</button>
    <button data-other onClick={() => select('web')}>other action</button>
  </div>;
}

describe('Architecture scope gestures, ancestors and browser visits', () => {
  let host: HTMLDivElement, root: Root;
  const session = () => JSON.parse(host.querySelector('output')!.textContent!) as AnalyzerViewSession;
  const scope = () => session().explorer!.twoD.location.scopeId;
  const count = () => Object.keys(session().explorer!.visits).length;
  const button = (text: string) => [...host.querySelectorAll('button')].find(b => b.textContent === text)!;
  const click = (element: Element, detail = 0, x = 10, y = 10) => act(async () => { element.dispatchEvent(new MouseEvent('click', { bubbles: true, detail, clientX: x, clientY: y })); });
  const dbl = async (id: string) => { await click(host.querySelector(`[data-node="${id}"]`)!, 1); await click(host.querySelector(`[data-node="${id}"]`)!, 2); };
  beforeEach(async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    await act(async () => root.render(<MemoryRouter><Harness /></MemoryRouter>));
  });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
  it('opens one visit for an unselected double click and ignores repeated opening of the same scope', async () => {
    expect(scope()).toBe('project'); await dbl('API'); expect(scope()).toBe('API'); expect(count()).toBe(2);
    await click(host.querySelector('[data-same]')!); expect(count()).toBe(2);
    await click(button('戻る')); expect(scope()).toBe('project'); expect(session().selectedNodeId).toBe('API');
  });
  it('atomically rejects two open calls in the same event', async () => { await click(host.querySelector('[data-duplicate]')!); expect(scope()).toBe('API'); expect(count()).toBe(2); });
  it('keeps selection and camera out of history and restores them with browser Back', async () => {
    await dbl('API'); await click(host.querySelector('[data-camera]')!); await click(host.querySelector('[data-node="web"]')!, 1);
    expect(scope()).toBe('API'); expect(count()).toBe(2); await click(host.querySelector('[data-node="web"]')!, 2);
    expect(scope()).toBe('web'); expect(explorerBreadcrumbs(explorer, session().explorer!.twoD.location).map(n => n.id)).toEqual(['project', 'web']);
    await click(button('戻る')); expect(scope()).toBe('API'); expect(session().selectedNodeId).toBe('web'); expect(session().flowCameras?.['2d']).toEqual({ x: 91, y: 32, scale: .75 });
    await dbl('web'); await click(button('親へ')); expect(scope()).toBe('project'); expect(session().search).toBe('keep');
  });
  it('binds the second click to the original node when detail layout puts another target under the pointer', async () => {
    await click(host.querySelector('[data-node="API"]')!, 1); await click(host.querySelector('[data-other]')!, 2);
    expect(scope()).toBe('API'); expect(count()).toBe(2);
  });
  it('does not open leaves, display aggregates, unrelated controls or separate-position clicks', async () => {
    await dbl('leaf'); await dbl('aggregate'); expect(scope()).toBe('project'); expect(count()).toBe(1);
    await click(host.querySelector('[data-other]')!, 1); await click(host.querySelector('[data-other]')!, 2); expect(scope()).toBe('project');
    await click(host.querySelector('[data-node="API"]')!, 1); await click(host.querySelector('[data-node="web"]')!, 2, 30, 30); expect(scope()).toBe('project');
    expect(canOpenArchitectureScope(explorer, 'leaf')).toBe(false); expect(canOpenArchitectureScope(explorer, 'aggregate')).toBe(false);
  });
  it('keeps a leaf selection when the second click lands on a different element after layout', async () => {
    await click(host.querySelector('[data-node="leaf"]')!, 1); await click(host.querySelector('[data-other]')!, 2);
    expect(session().selectedNodeId).toBe('leaf'); expect(scope()).toBe('project'); expect(count()).toBe(1);
  });
  it('cancels a double gesture after drag out and back or a keyboard action', async () => {
    const target = host.querySelector('[data-node="API"]')!;
    await click(target, 1);
    await act(async () => { target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10, buttons: 1 })); target.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 40, clientY: 10, buttons: 1 })); target.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 10, clientY: 10, buttons: 1 })); });
    await click(target, 2); expect(scope()).toBe('project');
    await click(target, 1); await act(async () => { target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Tab' })); }); await click(target, 2); expect(scope()).toBe('project');
  });
  it('renders real deep ancestors, an inert current item and focus after navigation', async () => {
    await dbl('API'); await dbl('service'); await dbl('module'); await dbl('unit');
    expect(scope()).toBe('unit'); expect(host.querySelector('.architecture-location.is-deep')).not.toBeNull();
    expect(host.querySelector('[aria-current="page"]')?.tagName).toBe('SPAN'); expect(document.activeElement).toBe(host.querySelector('[aria-current="page"]'));
    expect([...host.querySelectorAll('.architecture-ancestor-collapsed button')].map(b => b.textContent)).toEqual(['API', 'service', 'module']);
    await click(button('親へ')); expect(scope()).toBe('module');
    await click(button('プロジェクトへ')); expect(scope()).toBe('project'); expect(button('親へ').disabled).toBe(true); expect(button('プロジェクトへ').disabled).toBe(true); expect(button('戻る').disabled).toBe(false);
  });
});
