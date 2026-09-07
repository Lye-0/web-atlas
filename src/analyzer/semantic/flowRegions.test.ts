import { describe, expect, it } from 'vitest';
import { layoutSemanticFlow, presentSemanticFlow, semanticFlowEdgePaths, semanticMemberIds } from './flowPresentation';
import { semanticFlowRegions, semanticMapBounds, semanticRegionIdentity, semanticVisibleRegions, type SemanticFlowRegion, type SemanticMapRect } from './flowRegions';
import { semanticOverviewId } from './presentation';
import type { SemanticEdge, SemanticGraph, SemanticNode } from './types';

const makeNode = (id: string, path?: string, group = 'API'): SemanticNode => ({ id, label: 'run', kind: 'function', path, group, confidence: 'source',
  evidence: [{ path: path ?? 'trace.json', start: 0, end: 20, line: 1, endLine: 2, description: `${id} declaration` }], attributes: {} });
const directories = ['apps/admin/src', 'apps/shop/src', 'packages/shared/src', 'src/runtime', 'src/shared', 'test'];

function fixture(): SemanticGraph {
  const nodes = directories.flatMap((directory, lane) => Array.from({ length: 24 }, (_, index) => ({
    ...makeNode(`node-${lane}-${index}`, `${directory}/file-${index}.ts`, index % 2 ? 'UI' : 'Persistence'), line: index + 1,
  })));
  const edges: SemanticEdge[] = [];
  const connect = (id: string, source: string, target: string, callback = false) => edges.push({ id, source, target, kind: callback ? 'callback' : 'calls',
    label: callback ? 'then callback' : 'run()', views: ['function-call-flow'], confidence: callback ? 'inferred' : 'source',
    evidence: [{ path: nodes.find(node => node.id === source)!.path!, start: edges.length * 20, end: edges.length * 20 + 12, line: 5, endLine: 5, description: `${id} call` }] });
  for (let lane = 0; lane < directories.length; lane++) {
    for (let index = 0; index < 20; index++) connect(`call-${lane}-${index}`, `node-${lane}-${index}`, `node-${lane}-${index + 1}`);
    connect(`cycle-${lane}`, `node-${lane}-2`, `node-${lane}-0`);
    connect(`callback-${lane}`, `node-${lane}-0`, `node-${lane}-1`, true);
    connect(`self-${lane}`, `node-${lane}-23`, `node-${lane}-23`);
    if (lane < directories.length - 1) connect(`cross-${lane}`, `node-${lane}-4`, `node-${lane + 1}-7`);
  }
  const originals = edges.slice(0, 2);
  edges.push({ ...originals[0]!, id: 'compressed-path', target: originals[1]!.target, kind: 'processing-path', label: '2段階の静的関係',
    evidence: originals.flatMap(edge => edge.evidence), provenance: { edges: originals, intermediateNodeIds: [originals[0]!.target] } });
  return { view: 'function-call-flow', nodes, edges };
}

const contains = (rect: SemanticMapRect, x: number, y: number) => x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
const overlaps = (a: SemanticMapRect, b: SemanticMapRect) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

describe('Directory lanes and viewport location', () => {
  it.each(['2d', '3d'] as const)('keeps 144 canonical nodes, edge evidence and their recorded Directory membership in %s', mode => {
    const graph = fixture(), before = JSON.stringify(graph);
    const positions = layoutSemanticFlow(graph, mode), regions = semanticFlowRegions(positions, mode);
    expect(positions).toHaveLength(144);
    expect(new Set(positions.map(point => point.node.id))).toEqual(new Set(graph.nodes.map(node => node.id)));
    expect(regions).toHaveLength(6);
    expect(regions.map(region => region.label).sort()).toEqual([...directories].sort());
    expect(regions.reduce((sum, region) => sum + region.count, 0)).toBe(144);
    for (const point of positions) {
      expect(point.node).toBe(graph.nodes.find(node => node.id === point.node.id));
      expect([point.x, point.y, point.z].every(Number.isFinite)).toBe(true);
      const expectedDirectory = point.node.path!.slice(0, point.node.path!.lastIndexOf('/'));
      const enclosing = regions.filter(region => contains(region, point.x, point.y) && (mode === '2d' || point.z >= region.z && point.z <= region.z + (region.depth ?? 0)));
      expect(enclosing.map(region => region.label)).toEqual([expectedDirectory]);
      const own = enclosing[0]!, halfWidth = mode === '2d' ? 106 : 7, halfHeight = mode === '2d' ? 30 : 7;
      expect(contains(own, point.x - halfWidth, point.y - halfHeight)).toBe(true);
      expect(contains(own, point.x + halfWidth, point.y + halfHeight)).toBe(true);
    }
    for (const [index, region] of regions.entries()) {
      expect(region.count).toBe(24);
      expect(region.nodeIds).toHaveLength(24);
      for (const other of regions.slice(index + 1)) expect(overlaps(region, other) && (mode === '2d' || region.z < other.z + other.depth! && region.z + region.depth! > other.z)).toBe(false);
    }
    const paths = semanticFlowEdgePaths(graph, positions, new Set(), undefined, mode);
    expect(paths).toHaveLength(graph.edges.length);
    expect(paths.map(path => path.edge)).toEqual(graph.edges);
    expect(JSON.stringify(graph)).toBe(before);
  });

  it('normalizes Windows separators and keeps full Directory identity, project root, and pathless groups distinct', () => {
    expect(semanticRegionIdentity(makeNode('a', 'src\\feature\\run.ts'))).toEqual({ id: 'directory:src/feature', label: 'src/feature', kind: 'directory' });
    expect(semanticRegionIdentity(makeNode('b', '.\\src\\feature\\save.ts'))).toEqual(semanticRegionIdentity(makeNode('c', './src/feature/save.ts')));
    expect(semanticRegionIdentity(makeNode('d', 'C:\\work\\app\\src\\run.ts'))).toEqual({ id: 'directory:C:/work/app/src', label: 'C:/work/app/src', kind: 'directory' });
    expect(semanticRegionIdentity(makeNode('root', 'entry.ts'))).toEqual({ id: 'directory:.', label: 'プロジェクト直下', kind: 'directory' });
    expect(semanticRegionIdentity(makeNode('admin', 'apps/admin/src/run.ts')).id).not.toBe(semanticRegionIdentity(makeNode('shop', 'apps/shop/src/run.ts')).id);
    expect(semanticRegionIdentity(makeNode('trace', undefined, 'Checkout'))).toEqual({ id: 'group:Checkout', label: 'Checkout', kind: 'group' });
    expect(semanticRegionIdentity(makeNode('none', undefined, ''))).toEqual({ id: 'group:', label: '所属情報なし', kind: 'group' });
    expect(semanticRegionIdentity(makeNode('named-group', undefined, 'src/feature')).id).not.toBe(semanticRegionIdentity(makeNode('file', 'src/feature/file.ts')).id);
  });

  it('uses the complete shared Directory of overview files without matching partial path components', () => {
    const overview = (files: string[]): SemanticNode => ({ ...makeNode('overview', undefined, 'Runtime'), attributes: { overview: true, files, members: ['a', 'b'] } });
    expect(semanticRegionIdentity(overview(['src/feature/run.ts', 'src/feature/internal/save.ts']))).toEqual({ id: 'directory:src/feature', label: 'src/feature', kind: 'directory' });
    expect(semanticRegionIdentity(overview(['src\\feature\\run.ts', '.\\src\\feature\\internal\\save.ts']))).toEqual({ id: 'directory:src/feature', label: 'src/feature', kind: 'directory' });
    expect(semanticRegionIdentity(overview(['entry.ts', 'index.ts']))).toEqual({ id: 'directory:.', label: 'プロジェクト直下', kind: 'directory' });
    expect(semanticRegionIdentity(overview(['src/a.ts', 'src2/b.ts'])).id).not.toBe('directory:src');
    expect(semanticRegionIdentity(overview([]))).toEqual({ id: 'group:Runtime', label: 'Runtime', kind: 'group' });
  });

  it.each(['2d', '3d'] as const)('preserves original counts and every relation through collapsed and partially expanded %s overviews', mode => {
    const graph = fixture(), before = JSON.stringify(graph);
    for (const expanded of [new Set<string>(), new Set([semanticOverviewId(graph.nodes[0]!)])]) {
      const shown = presentSemanticFlow(graph, expanded, true);
      expect(shown.nodes.length).toBeLessThan(graph.nodes.length);
      expect(new Set(shown.nodes.flatMap(semanticMemberIds))).toEqual(new Set(graph.nodes.map(node => node.id)));
      const positions = layoutSemanticFlow(shown, mode), regions = semanticFlowRegions(positions, mode);
      expect(regions.map(region => region.label).sort()).toEqual([...directories].sort());
      expect(regions.every(region => region.count === 24)).toBe(true);
      expect(regions.reduce((sum, region) => sum + region.count, 0)).toBe(144);
      expect(regions.flatMap(region => region.nodeIds).sort()).toEqual(shown.nodes.map(node => node.id).sort());
      expect(shown.edges).toHaveLength(graph.edges.length);
      for (const [index, edge] of shown.edges.entries()) {
        const original = graph.edges[index]!;
        expect({ id: edge.id, kind: edge.kind, label: edge.label, confidence: edge.confidence, evidence: edge.evidence, views: edge.views })
          .toEqual({ id: original.id, kind: original.kind, label: original.label, confidence: original.confidence, evidence: original.evidence, views: original.views });
        expect(edge.provenance).toEqual(original.provenance ?? { edges: [original] });
        expect(shown.nodes.some(node => node.id === edge.source && semanticMemberIds(node).includes(original.source))).toBe(true);
        expect(shown.nodes.some(node => node.id === edge.target && semanticMemberIds(node).includes(original.target))).toBe(true);
      }
      expect(semanticFlowEdgePaths(shown, positions, new Set(), undefined, mode)).toHaveLength(graph.edges.length);
      for (const [index, region] of regions.entries()) for (const other of regions.slice(index + 1)) expect(overlaps(region, other) && (mode === '2d' || region.z < other.z + other.depth! && region.z + region.depth! > other.z)).toBe(false);
    }
    expect(JSON.stringify(graph)).toBe(before);
  });

  it('reports whole, partial, and outside viewports using actual overlap area and stable tie ordering', () => {
    const region = (id: string, x: number, y: number): SemanticFlowRegion => ({ id, label: id.toUpperCase(), kind: 'directory', x, y, width: 100, height: 100, z: 0, count: 1, nodeIds: [id] });
    const regions = [region('c', 0, 160), region('b', 160, 0), region('a', 0, 0)];
    const bounds = semanticMapBounds(regions);
    expect(bounds).toEqual({ x: 0, y: 0, width: 260, height: 260 });
    expect(semanticVisibleRegions(regions, bounds)).toEqual({ label: '全体 · 3領域', ids: ['a', 'b', 'c'] });
    expect(semanticVisibleRegions(regions, { x: 50, y: 0, width: 100, height: 100 })).toEqual({ label: 'A', ids: ['a'] });
    expect(semanticVisibleRegions(regions, { x: 0, y: 0, width: 200, height: 100 })).toEqual({ label: 'A / B', ids: ['a', 'b'] });
    expect(semanticVisibleRegions(regions, { x: 10, y: 10, width: 210, height: 210 })).toEqual({ label: 'A ほか2領域', ids: ['a', 'b', 'c'] });
    expect(semanticVisibleRegions(regions, { x: 260, y: 0, width: 100, height: 100 })).toEqual({ label: '領域の外', ids: [] });
    expect(semanticVisibleRegions(regions, { x: -200, y: -200, width: 50, height: 50 })).toEqual({ label: '領域の外', ids: [] });
    expect(semanticVisibleRegions(regions, { x: 0, y: 0, width: 0, height: 100 })).toEqual({ label: '領域の外', ids: [] });
  });

  it('returns finite empty-map bounds and handles negative world coordinates', () => {
    expect(semanticFlowRegions([], '2d')).toEqual([]);
    expect(semanticMapBounds([])).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    expect(semanticVisibleRegions([], semanticMapBounds([]))).toEqual({ label: '領域の外', ids: [] });
    expect(semanticMapBounds([{ x: -30, y: -50, width: 20, height: 10 }, { x: -100, y: 10, width: 10, height: 60 }]))
      .toEqual({ x: -100, y: -50, width: 90, height: 120 });
  });
});
