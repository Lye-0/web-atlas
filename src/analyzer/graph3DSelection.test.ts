import { describe, expect, it } from 'vitest';
import { graph3DRelationColor, graph3DSelectionContext } from './graph3DSelection';
import { layoutAnalyzerGraph3D } from './graph3D';
import { analyzerDirectionColors } from './edgeDirection';
import type { AnalyzerViewModel, AnalyzerViewNode } from './types';
import { spatialRelationCurve } from './spatialRelationPath';

const node = (id: string, type: AnalyzerViewNode['type'] = 'module'): AnalyzerViewNode => ({ id, type, label: id, evidenceIds: [], metadata: {} });
const edge = (id: string, sourceId: string, targetId: string, kind: AnalyzerViewModel['edges'][number]['kind'] = 'imports') => ({ id, sourceId, targetId, kind, label: kind, evidenceIds: ['evidence'], metadata: {} });
const base = (view: AnalyzerViewModel['view']): AnalyzerViewModel => ({ view, nodes: [], edges: [], regions: [], clusters: [], evidence: [], warnings: [] });
describe('canonical 3D selection color', () => {
  it('colors existing Scope contains for Region and nested Stack Usage selection without adding uses', () => {
    const model = base('architecture'); model.nodes = [node('project', 'project'), node('usage', 'stack-usage')];
    model.regions = [{ id: 'scope', entityKind: 'region', regionKind: 'scope', label: 'scope', childIds: [], ports: [], selectable: true, evidenceIds: [], metadata: {} },
      { id: 'nested', parentRegionId: 'scope', entityKind: 'region', regionKind: 'scope', label: 'nested', childIds: ['usage'], ports: [], selectable: true, evidenceIds: [], metadata: {} }];
    model.edges = [edge('contains', 'project', 'scope', 'contains')];
    const graph = layoutAnalyzerGraph3D(model);
    for (const selection of [{ selectedRegionId: 'scope' }, { selectedRegionId: 'nested' }, { selectedNodeId: 'usage' }]) {
      const context = graph3DSelectionContext(graph, selection);
      expect(context.edges).toEqual(model.edges);
      expect(graph3DRelationColor('project', 'scope', context.ids)).toBe(analyzerDirectionColors.incoming);
    }
    expect(graph3DRelationColor('project', 'scope', graph3DSelectionContext(graph, { selectedNodeId: 'project' }).ids)).toBe(analyzerDirectionColors.outgoing);
    expect(graph.edges).toEqual(model.edges);
  });
  it('highlights canonical edges represented by a closed Command branch', () => {
    const model = base('command'); model.nodes = [node('parent', 'command'), node('child', 'command'), { ...node('summary', 'command'), presentation: { role: 'summary', childNodeIds: ['child'] } }];
    model.edges = [edge('call', 'parent', 'child', 'expands-to')];
    const context = graph3DSelectionContext(layoutAnalyzerGraph3D(model), { selectedNodeId: 'summary' });
    expect(context.edges.map(edge => edge.id)).toEqual(['call']);
    expect(graph3DRelationColor('parent', 'child', context.ids)).toBe(analyzerDirectionColors.incoming);
  });
  it('keeps Module region internal imports out and uses the same incoming/outgoing palette', () => {
    const model = base('module-dependency'); model.nodes = [node('a'), node('b'), node('outside')];
    model.regions = [{ id: 'directory', entityKind: 'region', regionKind: 'directory', label: 'directory', childIds: ['a', 'b'], ports: [], selectable: true, evidenceIds: [], metadata: {} }];
    model.edges = [edge('internal', 'a', 'b'), edge('out', 'a', 'outside'), edge('in', 'outside', 'b')];
    const context = graph3DSelectionContext(layoutAnalyzerGraph3D(model), { selectedRegionId: 'directory' });
    expect(context.edges.map(edge => edge.id)).toEqual(['out', 'in']);
    expect(graph3DRelationColor('a', 'outside', context.ids)).toBe(analyzerDirectionColors.outgoing);
    expect(graph3DRelationColor('outside', 'b', context.ids)).toBe(analyzerDirectionColors.incoming);
    expect(graph3DRelationColor('a', 'b', new Set(), true)).toBe(analyzerDirectionColors.outgoing);
  });
});
it('uses the existing 3D curve samples for lines, arrow tangents and particles', () => {
  const a = { x: 0, y: 0, z: 0 }, b = { x: 300, y: 0, z: 90 }, curve = spatialRelationCurve(a, b, undefined, '3d');
  expect(curve.points).toHaveLength(49); expect(curve.points[0]).toEqual(a); expect(curve.points.at(-1)).toEqual(b);
  expect(curve.points[24]!.y).toBeCloseTo(38);
  const reverse = spatialRelationCurve(b, a, undefined, '3d');
  expect(reverse.points[24]!.y).toBeCloseTo(-38);
});
