import { describe, expect, it } from 'vitest';
import { buildAggregationGroups, prepareAutoAggregation, projectAutoAggregation, stableAggregationRepresentation } from '../autoAggregation';
import { createSemanticFlowProjector } from './flowAutoAggregation';
import { semanticFlow3DInput } from './flow3DInput';
import type { SemanticGraph } from './types';

describe('display projection retains canonical relations through cached transitions', () => {
  it('reuses immutable 3D input across visits without sharing it with a replacement graph', () => {
    const graph: SemanticGraph = { view: 'data-model', nodes: [{ id: 'model', label: 'model', kind: 'model', group: 'source', confidence: 'source', attributes: {}, evidence: [] }], edges: [] };
    const first = semanticFlow3DInput(graph);
    expect(semanticFlow3DInput(graph)).toBe(first);
    const replacement = semanticFlow3DInput({ ...graph, nodes: [...graph.nodes] });
    expect(replacement).not.toBe(first);
    expect(replacement.allPositions).toEqual(first.allPositions);
    expect(replacement.preparedAggregation).not.toBe(first.preparedAggregation);
  });
  it('reuses split/merge geometry and query-only relations without inferring a route between distinct group members', () => {
    const nodes = ['A', 'b1', 'b2', 'C'].map(id => ({ id, label: id, kind: 'value' as const, group: 'source', confidence: 'source' as const, attributes: {}, evidence: [] }));
    const edges = [['left', 'A', 'b1'], ['right', 'b2', 'C']].map(([id, source, target]) => ({ id: id!, source: source!, target: target!, kind: 'reads', label: id!, confidence: 'source' as const, views: ['data-flow' as const], evidence: [{ path: 'fixture.ts', start: 0, end: 1, line: 1, endLine: 1, description: id! }] }));
    const graph: SemanticGraph = { view: 'data-flow', nodes, edges }, original = JSON.stringify(graph);
    const positions = nodes.map((node, index) => ({ node, x: index * 2, y: 0, z: 0 }));
    const points = positions.map(point => ({ ...point, id: point.node.id, group: point.node.id.startsWith('b') ? { id: 'B', label: 'fixture.ts · values', minimumMembers: 2 } : undefined }));
    const groups = buildAggregationGroups(points), prepared = prepareAutoAggregation(points, groups);
    const options = { points, groups, prepared, projection: { width: 1000, height: 800, zoom: 1 } };
    const project = createSemanticFlowProjector(graph, positions);
    const on = projectAutoAggregation({ ...options, enabled: true }), first = project(on);
    expect(first.positions).toHaveLength(3); expect(first.relations.flatMap(edge => edge.originals)).toEqual(edges);
    expect(first.relations.map(edge => edge.originals[0]!.source)).toEqual(['A', 'b2']);
    const off = project(projectAutoAggregation({ ...options, enabled: false }));
    expect(off.positions.map(point => point.node.id)).toEqual(['A', 'b1', 'b2', 'C']);
    expect(project(projectAutoAggregation({ ...options, enabled: true }))).toBe(first);
    const query = stableAggregationRepresentation(projectAutoAggregation({ ...options, enabled: true, matchIds: new Set(['b1']) }), on), matched = project(query);
    expect(matched.relations).toBe(first.relations); expect(matched.graph.edges).toBe(first.graph.edges);
    expect(matched.positions.find(point => point.node.attributes.displayAggregate)?.node.attributes.matchingCount).toBe(1);
    expect(JSON.stringify(graph)).toBe(original);
    const nextProject = createSemanticFlowProjector({ ...graph, edges: [] }, positions);
    expect(nextProject(on).relations).toEqual([]);
  });
});
