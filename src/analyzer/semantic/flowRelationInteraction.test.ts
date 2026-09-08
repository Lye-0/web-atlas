import { describe, expect, it } from 'vitest';
import { resolveSemanticFlowHover, semanticFlowNodeRelationKinds, semanticFlowNodeRoles, semanticFlowRoleLabel } from './flowRelationInteraction';
import type { SemanticGraph, SemanticNode } from './types';

const nodes: SemanticNode[] = ['selected', 'peer', 'incoming', 'same-name', 'unrelated'].map(id => ({ id, label: id === 'same-name' ? 'peer' : id, kind: 'function', group: 'Source', confidence: 'source', evidence: [], attributes: {} }));
const graph: SemanticGraph = { view: 'function-call-flow', nodes, edges: [
  ['out', 'selected', 'peer', 'calls'], ['callback', 'selected', 'peer', 'callback'], ['back', 'peer', 'selected', 'calls'], ['in', 'incoming', 'selected', 'calls'], ['self', 'selected', 'selected', 'calls'], ['elsewhere', 'same-name', 'unrelated', 'calls'],
].map(([id, source, target, kind]) => ({ id: id!, source: source!, target: target!, kind: kind!, label: id!, views: ['function-call-flow'], confidence: 'source', evidence: [] })) };
const selected = new Set(['selected']);

describe('canonical relation interaction', () => {
  it('retains direct roles, kind and counterpart hover between representatives without changing provenance', () => {
    const display: SemanticGraph = { view: 'function-call-flow', nodes: ['displayA', 'displayB'].map(id => ({ id, label: 'Display collection', kind: 'subsystem', group: 'Display', confidence: 'source', evidence: [], attributes: { displayAggregate: true } })), edges: [{
      id: 'display-edge', source: 'displayA', target: 'displayB', kind: 'calls', label: '2 relations', views: ['function-call-flow'], confidence: 'source', evidence: [],
      provenance: { edges: ['1', '2'].map(id => ({ id: `original${id}`, source: `a${id}`, target: `b${id}`, kind: 'calls', label: 'calls', confidence: 'source', evidence: [] })) },
    }] };
    const before = JSON.stringify(display), selection = new Set(['displayA']);
    expect(semanticFlowNodeRoles(display, selection).get('displayB')).toBe('outgoing');
    expect(semanticFlowNodeRelationKinds(display, selection).get('displayB')).toEqual(new Set(['calls']));
    expect(resolveSemanticFlowHover(display, selection, undefined, { kind: 'node', id: 'displayB' }).edgeIds).toEqual(new Set(['display-edge']));
    expect(JSON.stringify(display)).toBe(before);
  });

  it('keeps reciprocal peers dual-role, incoming orange roles and explicit selected-edge endpoints', () => {
    expect([...semanticFlowNodeRoles(graph, selected)]).toEqual([['peer', 'both'], ['incoming', 'incoming'], ['selected', 'selected']]);
    expect([...semanticFlowNodeRoles(graph, selected, 'out')]).toEqual([['selected', 'source'], ['peer', 'target']]);
    expect([...semanticFlowNodeRoles(graph, selected, 'self')]).toEqual([['selected', 'source-target']]);
    expect(semanticFlowRoleLabel('source', graph.view)).toBe('始点（Source）');
    expect(semanticFlowRoleLabel('target', graph.view)).toBe('終点（Target）');
  });
  it('describes actual kinds without calling callbacks or mixed runtime links ordinary function calls', () => {
    const kinds = semanticFlowNodeRelationKinds(graph, selected);
    expect([...kinds.get('peer')!]).toEqual(['calls', 'callback']);
    expect(semanticFlowRoleLabel('both', graph.view, kinds.get('peer'))).toBe('入る・出る関係');
    expect(semanticFlowRoleLabel('incoming', graph.view, kinds.get('incoming'))).toBe('呼び出し元');
    expect(semanticFlowRoleLabel('outgoing', graph.view, new Set(['callback']))).toBe('コールバック先');
    expect(semanticFlowRoleLabel('outgoing', 'runtime-flow', new Set(['calls']))).toBe('出る関係');
  });
  it('isolates every existing relation of a hovered peer, including reciprocal and multiple-kind edges', () => {
    const before = JSON.stringify(graph);
    const focus = resolveSemanticFlowHover(graph, selected, undefined, { kind: 'node', id: 'peer' });
    expect([...focus.edgeIds]).toEqual(['out', 'callback', 'back']); expect([...focus.nodeIds]).toEqual(['selected', 'peer']);
    expect(JSON.stringify(graph)).toBe(before);
    expect([...resolveSemanticFlowHover(graph, selected, undefined, { kind: 'node', id: 'same-name' }).edgeIds]).toEqual([]);
    expect([...resolveSemanticFlowHover(graph, selected, undefined, { kind: 'node', id: 'unrelated' }).edgeIds]).toEqual([]);
  });
  it('individual relations, self edges and selected-edge endpoint hover retain exact identities', () => {
    expect([...resolveSemanticFlowHover(graph, selected, undefined, { kind: 'edge', id: 'callback' }).edgeIds]).toEqual(['callback']);
    expect([...resolveSemanticFlowHover(graph, selected, 'out', { kind: 'node', id: 'peer' }).edgeIds]).toEqual(['out']);
    const self = resolveSemanticFlowHover(graph, selected, undefined, { kind: 'edge', id: 'self' });
    expect([...self.nodeIds]).toEqual(['selected']); expect([...self.edgeIds]).toEqual(['self']);
    expect(resolveSemanticFlowHover(graph, selected, undefined).edgeIds.size).toBe(0);
    expect(resolveSemanticFlowHover(graph, selected, undefined, { kind: 'edge', id: 'removed' }).edgeIds.size).toBe(0);
    expect(resolveSemanticFlowHover({ ...graph, nodes: nodes.filter(node => node.id !== 'peer') }, selected, undefined, { kind: 'edge', id: 'out' }).edgeIds.size).toBe(0);
  });
});
