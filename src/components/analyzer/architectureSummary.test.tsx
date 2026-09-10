import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { AnalyzerProjectStore } from '../../analyzer';
import { architectureScopeGraph } from '../../analyzer/semantic/architectureProjection';
import { architectureRelationCounts, architectureRelationOriginals } from '../../analyzer/semantic/architectureRelations';
import type { SemanticAnalysis, SemanticEdge, SemanticGraph, SemanticNode } from '../../analyzer/semantic/types';
import { ArchitectureDetail } from './ArchitectureDetail';
import { ArchitectureRequestInspection } from './ArchitectureRequestInspection';
import { architecturePartners, architectureRelationSummary, architectureRequestSources } from './architectureSummary';
import { semanticNodeDisplays } from './semanticFlowDisplay';
import { FlowLabelLayer, type FlowLabelPlacement } from './semanticFlowLabels';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const node = (id: string, parentId?: string): SemanticNode => ({ id, label: id, kind: 'subsystem', group: parentId ?? 'Project', confidence: 'source', evidence: [], attributes: {},
  architecture: { kind: parentId ? 'component' : 'application', parentId, files: [], memberIds: [], roles: [], entryPaths: [], context: [], environments: [], technologyNames: [], auxiliary: false } });
const source = { path: 'app.ts', start: 0, end: 10, line: 1, endLine: 1, description: 'reference' };
const edge = (id: string, from: string, to: string, kind = 'code-reference'): SemanticEdge => ({ id, source: from, target: to, kind, label: 'original source spelling', confidence: 'source', views: ['architecture-map'], evidence: [source] });
const request = (id: string, ownerId: string): SemanticNode => { const value = node(id); value.architecture!.kind = 'unresolved'; value.architecture!.request = { kind: 'http', ownerId, sourceId: 'source-'+id, expression: `fetch(${id})` }; return value; };
const model: SemanticGraph = { view: 'architecture-map', nodes: [node('A'), node('inside', 'A'), node('B'), node('C'), node('D')], edges: [edge('inside-B', 'inside', 'B'), edge('C-D', 'C', 'D')] };
const store: AnalyzerProjectStore = { files: [], facts: [], relations: [], evidence: [], sources: {}, warnings: [], scannedAt: 'fixture' };
const analysis: SemanticAnalysis = { nodes: [], edges: [], warnings: [], coverage: [], stats: { files: 0, functions: 0, models: 0, unresolved: 0, elapsedMs: 0 } };

describe('Architecture readability preserves identity and relation meaning', () => {
  it('keeps scope priority stable when an unrelated outside node is selected, with unchanged IDs and positions', () => {
    const before = JSON.stringify(model), normal = architectureScopeGraph(model, 'A', '', false, { mode: '3d' });
    const selected = architectureScopeGraph(model, 'A', '', false, { mode: '3d', selectedNodeId: 'C' });
    const off = architectureScopeGraph(model, 'A', '', false, { mode: '3d', selectedNodeId: 'C', surroundings: false });
    const roles = (graph: SemanticGraph) => Object.fromEntries(graph.nodes.map(n => [n.id, n.attributes.architectureScopeRole]));
    expect(roles(normal)).toEqual({ inside: 'inside', B: 'direct', C: 'surrounding', D: 'surrounding' });
    expect(roles(selected)).toEqual(roles(normal)); expect(roles(off)).toEqual(roles(normal));
    expect([...normal.architectureView!.positions]).toEqual([...selected.architectureView!.positions]);
    expect(JSON.stringify(model)).toBe(before);
    const display = semanticNodeDisplays(selected.nodes);
    expect(display.get('inside')?.dataRole).toContain('内部'); expect(display.get('B')?.dataRole).toContain('接続先'); expect(display.get('C')?.dataRole).toContain('周辺');
  });
  it('publishes temporary label promotion and demotion without changing the stable scope role or hit position', () => {
    const publish = vi.fn(), layer = new FlowLabelLayer(publish);
    const label: FlowLabelPlacement = { id: 'C', label: 'C', path: '', selected: false, match: false, x: 300, y: 300, scopeRole: 'surrounding' };
    layer.update([label]); layer.update([{ ...label, scopeActive: true }]); layer.update([label]);
    expect(publish.mock.calls.map(call => call[0][0].scopeActive)).toEqual([undefined, true, undefined]);
    expect(publish.mock.calls.every(call => call[0][0].scopeRole === 'surrounding')).toBe(true);
  });
  it('resolves request origins from recorded IDs across filtered context, without assigning destination membership', () => {
    const owner = { ...node('owner'), label: 'A very long source application name / 名前'.repeat(3) }, req = request('r', owner.id), nodes = new Map([owner, req].map(n => [n.id, n]));
    const group: SemanticNode = { ...req, id: 'group', label: 'HTTP接続先・未特定：2対象', architecture: { ...req.architecture!, request: undefined }, attributes: { architectureRequestGroup: true, requestIds: [req.id, 'r2'] } };
    const req2 = request('r2', owner.id); nodes.set(req2.id, req2);
    const before = JSON.stringify([group, ...nodes.values()]);
    const displays = semanticNodeDisplays([group], nodes);
    expect(displays.get(group.id)?.disambiguation).toBe(`要求元：${owner.label}`);
    expect(group.architecture?.parentId).toBeUndefined(); expect(JSON.stringify([group, ...nodes.values()])).toBe(before);
    expect(architectureRequestSources([request('x', 'missing')], nodes).label).toBe('要求元：要求元未確認');
    nodes.set('other', { ...node('other'), label: owner.label });
    expect(architectureRequestSources([req, request('y', 'other')], nodes)).toMatchObject({ label: '要求元：複数の要求元', unknown: false });
    expect(architectureRequestSources([], nodes).unknown).toBe(true);
  });
  it('summarizes distinct partners by ID, retaining both directions and all kinds in stable order', () => {
    const edges = [edge('out', 'A', 'B'), edge('in', 'B', 'A', 'calls'), edge('other', 'A', 'C'), edge('callback', 'A', 'B', 'callback')];
    const before = JSON.stringify(edges), partners = architecturePartners(edges, 'A');
    expect(partners.map(p => p.otherId)).toEqual(['B', 'C']); expect(partners[0]?.direction).toBe('相手から・相手への関係あり');
    expect(partners[0]?.relations).toHaveLength(3); expect(architecturePartners([...edges].reverse(), 'A')).toEqual(partners);
    expect(partners.flatMap(p => p.relations.flatMap(r => r.edges.map(e => e.id))).sort()).toEqual(edges.map(e => e.id).sort());
    expect(JSON.stringify(edges)).toBe(before); expect(architecturePartners([], 'A')).toEqual([]);
  });
  it('retains request origins through same-name disambiguation and keeps absent source locations explicit', () => {
    const owner = node('owner'), first = { ...request('r1', owner.id), label: 'HTTP接続先・未特定', evidence: [source] }, second = { ...request('r2', owner.id), label: first.label, evidence: [{ ...source, start: 20, end: 30 }] };
    const displayed = semanticNodeDisplays([owner, first, second]);
    expect(displayed.get(first.id)?.disambiguation).toContain('要求元：owner'); expect(displayed.get(second.id)?.disambiguation).toContain('要求元：owner');
    expect(displayed.get(first.id)?.disambiguation).not.toBe(displayed.get(second.id)?.disambiguation);
    const missing = { ...request('missing', 'unknown'), label: first.label };
    expect(semanticNodeDisplays([missing, first, owner]).get(missing.id)?.disambiguation).not.toMatch(/ · :$/);
  });
  it('counts distinct records, ranges and Evidence separately through nested display aggregates and mixed confidence', () => {
    const a = edge('one', 'A', 'B'), b = { ...edge('two', 'A', 'B'), confidence: 'inferred' as const, evidence: [{ ...source, description: 'inferred relation' }] };
    const display = { ...edge('display', 'A', 'B'), provenance: { edges: [a, b] } }, nested = { ...edge('nested', 'A', 'B'), provenance: { edges: [display, a] } };
    expect(architectureRelationCounts([nested])).toEqual({ records: 2, sites: 1 });
    expect(architectureRelationSummary([nested])).toEqual({ records: 2, sites: 1, evidence: 2, status: '推定・ソースで確認が混在' });
    expect(architectureRelationOriginals([nested]).map(e => e.id)).toEqual(['one', 'two']);
  });
});

async function open(details: HTMLDetailsElement) { await act(async () => { details.open = true; details.dispatchEvent(new Event('toggle')); }); }
describe('Architecture summaries in the detail panel', () => {
  it('defers a node evidence collection until requested, then retains different descriptions at the same source site', async () => {
    const object = node('A'), read = vi.fn(() => [source, { ...source, description: 'another explanation' }]);
    Object.defineProperty(object, 'evidence', { get: read, enumerable: true });
    const graph: SemanticGraph = { view: 'architecture-map', nodes: [object], edges: [] }, host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
    try {
      await act(async () => root.render(<MemoryRouter><ArchitectureDetail node={object} graph={graph} visible={graph} analysis={analysis} store={store} sources={{ 'app.ts': 'source code' }} onSelect={vi.fn()} onSelectEdge={vi.fn()} onOpen={vi.fn()} onReveal={vi.fn()} onJump={vi.fn()} onClose={vi.fn()} /></MemoryRouter>));
      expect(read).not.toHaveBeenCalled();
      const disclosure = [...host.querySelectorAll('details')].find(item => item.querySelector('summary')?.textContent === '元の根拠・Evidence')!;
      await open(disclosure); expect(read).toHaveBeenCalled(); expect(disclosure.textContent).toContain('2 Evidence · 1ソース箇所');
      expect(disclosure.textContent).toContain('reference'); expect(disclosure.textContent).toContain('another explanation');
    } finally { await act(async () => root.unmount()); host.remove(); }
  });
  it('shows each partner once, opens its directed relationships, and leaves counts/Evidence behind a disclosure', async () => {
    const graph = { ...model, edges: [edge('out', 'A', 'B'), { ...edge('in', 'B', 'A', 'calls'), confidence: 'inferred' as const }, edge('out2', 'A', 'B')] };
    const host = document.createElement('div'); document.body.append(host); const root = createRoot(host), onSelect = vi.fn();
    try {
      await act(async () => root.render(<MemoryRouter><ArchitectureDetail node={graph.nodes[0]} graph={graph} visible={graph} analysis={analysis} store={store} sources={{ 'app.ts': 'source code' }} onSelect={onSelect} onSelectEdge={vi.fn()} onOpen={vi.fn()} onReveal={vi.fn()} onJump={vi.fn()} onClose={vi.fn()} /></MemoryRouter>));
      expect(host.querySelectorAll('.architecture-summary-partners [data-partner-id]')).toHaveLength(1);
      expect(host.querySelector('.architecture-summary-partners')?.textContent).toContain('相手から・相手への関係あり');
      expect(host.querySelector('.architecture-summary-partners')?.textContent).not.toContain('元関係');
      await open(host.querySelector('.architecture-summary-partners details')!);
      expect(onSelect).not.toHaveBeenCalled();
      const rows = host.querySelectorAll('.architecture-summary-partners .architecture-relation-group'); expect(rows).toHaveLength(2);
      const outgoing = host.querySelector('.architecture-summary-partners [data-direction="outgoing"]')!;
      expect(outgoing.textContent).toContain('ソースで確認 · 1箇所');
      expect(outgoing.textContent?.match(/コードから参照/g)).toHaveLength(1);
      await open(outgoing.querySelector('details')!);
      expect(outgoing.textContent).toContain('2元関係 · 1 Evidence · 1ソース箇所');
      await open(outgoing.querySelector('.architecture-count-definitions')!);
      expect(outgoing.textContent).toContain('通信・実行回数ではありません');
    } finally { await act(async () => root.unmount()); host.remove(); }
  });
  it('provides multiple-origin and unknown-origin request breakdowns without guessing from labels', async () => {
    const a = node('a'), b = node('b'), requests = [request('r1', 'a'), request('r2', 'b'), request('r3', 'unknown')], nodes = new Map([a, b, ...requests].map(n => [n.id, n]));
    const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
    try {
      await act(async () => root.render(<ArchitectureRequestInspection group={{ id: 'g', label: 'HTTP接続先・未特定', memberIds: requests.map(n => n.id) }} nodes={nodes} expanded={false} onExpanded={vi.fn()} onSelect={vi.fn()} onClose={vi.fn()} />));
      expect(host.querySelector('.architecture-request-origin')?.textContent).toBe('要求元：複数の要求元');
      expect(host.textContent).toContain('要求元未確認');
      await open(host.querySelector('details')!); expect(host.textContent).toContain('要求元を確認できない要求も含みます');
      expect(host.querySelectorAll('li button')).toHaveLength(3);
    } finally { await act(async () => root.unmount()); host.remove(); }
  });
});
