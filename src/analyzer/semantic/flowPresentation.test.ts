import { describe, expect, it } from 'vitest';
import { analyzerDirectionColors } from '../edgeDirection';
import { matchAnalyzerSearch, moduleSearchDocument } from '../search';
import { searchSemanticNodes } from './search';
import { layoutSemanticFlow, presentSemanticFlow, sampleFlowPath, semanticFlowEdgePaths } from './flowPresentation';
import { semanticOverviewId, summarizeSemanticGraph } from './presentation';
import type { SemanticGraph, SemanticNode } from './types';

const node = (id: string, label = id, path = `src/${id}.ts`): SemanticNode => ({ id, label, path, kind: 'function', group: 'Source', confidence: 'source', evidence: [], attributes: {} });
const evidence = (start: number) => ({ path: 'src/run.ts', start, end: start + 10, line: start + 1, endLine: start + 1, description: `call ${start}` });
const graph: SemanticGraph = { view: 'function-call-flow', nodes: [node('a'), node('b')], edges: [
  { id: 'direct', source: 'a', target: 'b', kind: 'calls', label: 'b()', confidence: 'source', evidence: [evidence(0), evidence(1)], views: ['function-call-flow'] },
  { id: 'callback', source: 'a', target: 'b', kind: 'callback', label: 'map callback', confidence: 'inferred', evidence: [evidence(2)], views: ['function-call-flow'] },
  { id: 'back', source: 'b', target: 'a', kind: 'calls', label: 'a()', confidence: 'source', evidence: [evidence(3)], views: ['function-call-flow'] },
  { id: 'self', source: 'a', target: 'a', kind: 'calls', label: 'a()', confidence: 'source', evidence: [evidence(4)], views: ['function-call-flow'] },
] };

describe('flow search and presentation contracts', () => {
  it('ranks explicit name/path fields, combines terms with AND, and excludes internal metadata', () => {
    const nodes = [node('internal-abort', 'unrelated', 'src/other.ts'), node('path', 'runner', 'src/abort.ts'), node('part', 'preAbortNow'), node('prefix', 'abortNow'), node('exact', 'abort'), node('qualified', 'GitRunner.abort')];
    nodes[0]!.attributes.evidenceId = 'abort'; nodes[0]!.attributes.hiddenFlag = 'abort';
    expect(searchSemanticNodes(nodes, ' ABORT ').map(result => result.id)).toEqual(['exact', 'prefix', 'qualified', 'part', 'path']);
    expect(searchSemanticNodes(nodes, 'src\\abort runner').map(result => result.id)).toEqual(['path']);
    expect(searchSemanticNodes(nodes, 'abort no-match')).toEqual([]);
    expect(searchSemanticNodes(nodes, '[.*]')).toEqual([]);
    expect(searchSemanticNodes([node('jp', '保存する')], '保存').map(result => result.id)).toEqual(['jp']);
    expect(searchSemanticNodes(nodes, 'src/abort')[0]?.match.reason).toBe('パスで一致');
  });
  it('keeps all 100 results and separate same-name symbols', () => {
    const nodes = Array.from({ length: 100 }, (_, index) => node(String(index).padStart(3, '0'), 'callback'));
    expect(searchSemanticNodes(nodes, 'callback').map(result => result.id)).toEqual(Array.from({ length: 100 }, (_, index) => String(index).padStart(3, '0')));
    const doc = moduleSearchDocument({ id: 'secret-abort', label: 'file.ts', type: 'module', evidenceIds: [], metadata: { modulePath: 'src/file.ts', packageName: 'service', layout: 'abort' } });
    expect(matchAnalyzerSearch(doc, 'abort')).toBeUndefined(); expect(matchAnalyzerSearch(doc, 'SERVICE src\\file')).toBeDefined();
  });
  it('preserves each original kind/confidence/evidence in summaries, including internal/self relations', () => {
    const before = JSON.stringify(graph); const summary = summarizeSemanticGraph(graph);
    expect(summary.edges.flatMap(edge => edge.provenance!.edges.map(original => original.id)).sort()).toEqual(['back', 'callback', 'direct', 'self']);
    expect(summary.edges.find(edge => edge.kind === 'callback')?.confidence).toBe('inferred');
    expect(summary.edges.flatMap(edge => edge.evidence).map(item => item.start).sort()).toEqual([0, 1, 2, 3, 4]);
    expect(JSON.stringify(graph)).toBe(before);
  });
  it('changes only display endpoints when collapsing, retaining all canonical relation IDs and evidence', () => {
    const large: SemanticGraph = { ...graph, nodes: [...graph.nodes, ...Array.from({ length: 121 }, (_, i) => node(`extra-${i}`, `extra-${i}`, 'src/domain/shared.ts'))] };
    const collapsed = presentSemanticFlow(large, new Set(), true);
    expect(collapsed.nodes.length).toBeLessThan(large.nodes.length);
    expect(collapsed.edges.map(edge => edge.id)).toEqual(large.edges.map(edge => edge.id));
    expect(collapsed.edges.map(edge => edge.evidence)).toEqual(large.edges.map(edge => edge.evidence));
    const opened = presentSemanticFlow(large, new Set([semanticOverviewId(large.nodes[0]!)]), true);
    expect(opened.nodes.some(item => item.id === 'a')).toBe(true);
  });
  it.each(['2d', '3d'] as const)('retains caller direction, reciprocal paths and self loops in %s', mode => {
    const positions = layoutSemanticFlow(graph, mode);
    const fromA = semanticFlowEdgePaths(graph, positions, new Set(['a']), undefined, mode);
    const fromB = semanticFlowEdgePaths(graph, positions, new Set(['b']), undefined, mode);
    expect(fromA.find(path => path.edge.id === 'direct')?.color).toBe(analyzerDirectionColors.outgoing);
    expect(fromB.find(path => path.edge.id === 'direct')?.color).toBe(analyzerDirectionColors.incoming);
    expect(fromA.find(path => path.edge.id === 'direct')?.points).toEqual(fromB.find(path => path.edge.id === 'direct')?.points);
    expect(fromA.find(path => path.edge.id === 'direct')?.points).not.toEqual(fromA.find(path => path.edge.id === 'back')?.points.slice().reverse());
    expect(new Set(fromA.find(path => path.edge.id === 'self')!.points.map(point => JSON.stringify(point))).size).toBeGreaterThan(10);
    if (mode === '2d') {
      const self = fromA.find(path => path.edge.id === 'self')!.points, a = positions.find(point => point.node.id === 'a')!;
      expect(self[0]!.x - a.x).toBe(110); expect(Math.abs(self.at(-1)!.y - a.y)).toBe(34);
      expect(Math.abs(self.at(-1)!.x - a.x)).toBeLessThan(106);
      expect(Math.abs(self.at(-2)!.y - a.y)).toBeGreaterThan(Math.abs(self.at(-1)!.y - a.y));
    }
    expect(semanticFlowEdgePaths(graph, positions, new Set(), undefined, mode).every(path => !path.selected)).toBe(true);
  });
  it('samples particles from the recorded source toward target at increasing time', () => {
    const points = [{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }];
    expect(sampleFlowPath(points, .2).x).toBeCloseTo(20); expect(sampleFlowPath(points, .7).x).toBeCloseTo(70);
  });
  it('bounds the total curve spread for many canonical relations between display groups', () => {
    const repeated: SemanticGraph = { ...graph, edges: Array.from({ length: 130 }, (_, i) => ({ ...graph.edges[0]!, id: `call-${i}` })) };
    const positions = layoutSemanticFlow(repeated, '2d'), paths = semanticFlowEdgePaths(repeated, positions, new Set(), undefined, '2d');
    expect(paths).toHaveLength(130);
    const ys = paths.flatMap(path => path.points.map(point => point.y));
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(144.01);
  });
  it('separates reciprocal and distinct-kind 3D paths along the Z axis', () => {
    const pair: SemanticGraph = { ...graph, edges: graph.edges.filter(edge => edge.id !== 'self') };
    const positions = [{ node: graph.nodes[0]!, x: 0, y: 0, z: 0 }, { node: graph.nodes[1]!, x: 0, y: 0, z: 100 }];
    const paths = semanticFlowEdgePaths(pair, positions, new Set(['a']), undefined, '3d');
    const direct = paths.find(path => path.edge.id === 'direct')!.points, back = paths.find(path => path.edge.id === 'back')!.points;
    expect(direct).not.toEqual(back.slice().reverse());
    expect(direct).not.toEqual(paths.find(path => path.edge.id === 'callback')!.points);
    expect(direct.some(point => Math.abs(point.x) > 1)).toBe(true);
    expect(direct[0]!.z).toBeLessThan(direct.at(-1)!.z); expect(back[0]!.z).toBeGreaterThan(back.at(-1)!.z);
  });
});
