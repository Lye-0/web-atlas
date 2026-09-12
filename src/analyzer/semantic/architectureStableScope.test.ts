// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { architectureScopeGraph } from './architectureProjection';
import { layoutSemanticFlow } from './flowPresentation';
import { semanticFlow3DInput } from './flow3DInput';
import { semanticNodeDisplays } from '../../components/analyzer/semanticFlowDisplay';
import type { SemanticGraph, SemanticNode } from './types';

const node = (id: string, parentId?: string): SemanticNode => ({ id, label: id, kind: 'subsystem', group: 'fixture', confidence: 'source', evidence: [], attributes: {},
  architecture: { kind: parentId ? 'component' : 'application', parentId, files: [], memberIds: [], roles: [], entryPaths: [], context: [], environments: [], technologyNames: [], auxiliary: false } });
const request = (id: string): SemanticNode => ({ ...node(id), architecture: { ...node(id).architecture!, kind: 'unresolved', request: { ownerId: 'chess', kind: 'http', expression: id, sourceId: id } } });
const nodes = [node('suite'), node('auth', 'suite'), node('storage', 'suite'), node('chess'), node('web', 'chess'), node('firestore'), node('other'), ...Array.from({ length: 27 }, (_, i) => request(`request${i}`))];
const edges = [['chess', 'auth'], ['storage', 'chess'], ['auth', 'firestore'], ['chess', 'other'], ...nodes.filter(n => n.architecture?.request).map(n => ['chess', n.id])].map(([source, target], i) => ({ id: `edge${i}`, source: source!, target: target!, kind: 'service-use', label: 'explicit relation', confidence: 'source' as const, views: ['architecture-map' as const], evidence: [{ path: 'fixture.ts', start: i, end: i + 1, line: 1, endLine: 1, description: 'fixture relation' }] }));
const model: SemanticGraph = { view: 'architecture-map', nodes, edges };
const coordinates = (g: SemanticGraph) => layoutSemanticFlow(g, '2d').map(p => [p.node.id, p.x, p.y, p.z]);

describe('Architecture selection keeps its open scope and basic composition', () => {
  it.each(['incoming', 'outgoing', 'both'])('%s relationships use a direction-neutral outside role', direction => {
    const relation = edges[0]!;
    const originalEdges = direction === 'incoming' ? [{ ...relation, source: 'chess', target: 'auth' }]
      : direction === 'outgoing' ? [{ ...relation, source: 'auth', target: 'chess' }]
      : [{ ...relation, source: 'chess', target: 'auth' }, { ...relation, id: 'reverse', source: 'auth', target: 'chess' }];
    const source = { ...model, edges: originalEdges };
    const graph = architectureScopeGraph(source, 'suite');
    expect(semanticNodeDisplays(graph.nodes).get('chess')?.dataRole).toContain('外側の接続相手');
    expect(graph.edges.map(edge => [edge.source, edge.target])).toEqual(originalEdges.map(edge => [edge.source, edge.target]));
  });
  it.each(['2d', '3d'] as const)('%s does not expand an outside node into all its neighbours', mode => {
    const original = JSON.stringify(model);
    for (const surroundings of [false, true]) {
      const initial = architectureScopeGraph(model, 'suite', '', false, { mode, surroundings });
      for (const selectedNodeId of ['auth', 'chess', 'firestore']) {
        const selected = architectureScopeGraph(model, 'suite', '', false, { mode, surroundings, selectedNodeId });
        expect(selected.architectureView!.representedNodeIds).toEqual(initial.architectureView!.representedNodeIds);
        expect(selected.edges).toEqual(initial.edges);
        expect(coordinates(selected)).toEqual(coordinates(initial));
        expect(semanticFlow3DInput(selected)).toBe(semanticFlow3DInput(initial));
      }
    }
    expect(JSON.stringify(model)).toBe(original);
  });
  it('protects a selected request without moving existing blocks or changing the represented set', () => {
    const initial = architectureScopeGraph(model);
    const selected = architectureScopeGraph(model, undefined, '', false, { selectedNodeId: 'request0' });
    expect(selected.nodes.some(n => n.id === 'request0')).toBe(true);
    expect(selected.architectureView!.representedNodeIds).toEqual(initial.architectureView!.representedNodeIds);
    const before = new Map(coordinates(initial).map(row => [row[0], row.slice(1)]));
    for (const row of coordinates(selected)) if (before.has(row[0])) expect(row.slice(1)).toEqual(before.get(row[0]));
  });
});
