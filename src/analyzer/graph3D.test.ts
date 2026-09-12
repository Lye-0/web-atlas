import { describe, expect, it } from 'vitest';
import { compatibleGraph3DCamera, layoutAnalyzerGraph3D } from './graph3D';
import type { AnalyzerViewModel, AnalyzerViewNode } from './types';

const node = (id: string): AnalyzerViewNode => ({ id, type: 'module', label: id, evidenceIds: [`e:${id}`], metadata: {} });
function fixture(): AnalyzerViewModel {
  const nodes = Array.from({ length: 36 }, (_, index) => node(`file:${index}`));
  return { view: 'module-dependency', nodes, edges: [{ id: 'import:1', sourceId: nodes[0]!.id, targetId: nodes[35]!.id, kind: 'imports', label: 'import', evidenceIds: ['source:1'], metadata: {} }], clusters: [], evidence: [], warnings: [], regions: [
    { id: 'root', entityKind: 'region', regionKind: 'directory', label: '.', childIds: nodes.slice(0, 12).map(n => n.id), ports: [], selectable: true, evidenceIds: [], metadata: {} },
    { id: 'a', entityKind: 'region', regionKind: 'directory', label: 'a', parentRegionId: 'root', childIds: nodes.slice(12, 24).map(n => n.id), ports: [], selectable: true, evidenceIds: [], metadata: {} },
    { id: 'b', entityKind: 'region', regionKind: 'directory', label: 'b', parentRegionId: 'root', childIds: nodes.slice(24).map(n => n.id), ports: [], selectable: true, evidenceIds: [], metadata: {} },
  ] };
}
describe('independent analyzer 3D layout', () => {
  it('retains original identities and evidence without mutating the logical model', () => {
    const source = fixture(), before = JSON.stringify(source), graph = layoutAnalyzerGraph3D(source);
    expect(JSON.stringify(source)).toBe(before);
    expect(graph.points).toHaveLength(source.nodes.length);
    expect(new Set(graph.points.map(point => point.id)).size).toBe(source.nodes.length);
    for (const point of graph.points) expect(point.original).toBe(source.nodes.find(node => node.id === point.id));
    expect(graph.edges[0]).toBe(source.edges[0]);
    expect(layoutAnalyzerGraph3D(source)).toBe(graph);
    expect(layoutAnalyzerGraph3D(fixture()).points.map(({ id, x, y, z }) => ({ id, x, y, z }))).toEqual(graph.points.map(({ id, x, y, z }) => ({ id, x, y, z })));
  });
  it('packs substantial XYZ depth, preserves parent containment and separates sibling boxes', () => {
    const graph = layoutAnalyzerGraph3D(fixture()), parent = graph.regions.find(r => r.original.id === 'root')!;
    for (const axis of ['x', 'y', 'z'] as const) expect(Math.max(...graph.points.map(p => p[axis])) - Math.min(...graph.points.map(p => p[axis]))).toBeGreaterThan(60);
    for (const region of graph.regions) {
      for (const point of graph.points.filter(p => region.memberIds.includes(p.id))) [point.x, point.y, point.z].forEach((value, axis) => expect(Math.abs(value - region.center[axis]!)).toBeLessThan(region.size[axis]! / 2));
      if (region !== parent) region.center.forEach((value, axis) => expect(Math.abs(value - parent.center[axis]!) + region.size[axis]! / 2).toBeLessThanOrEqual(parent.size[axis]! / 2));
    }
    const a = graph.regions.find(r => r.original.id === 'a')!, b = graph.regions.find(r => r.original.id === 'b')!;
    expect(a.center.some((value, axis) => Math.abs(value - b.center[axis]!) > (a.size[axis]! + b.size[axis]!) / 2)).toBe(true);
  });
  it('keeps all logical dependencies even when summaries start closed', () => {
    const source = fixture(); source.view = 'dependencies';
    source.nodes = [ { ...node('summary'), type: 'external-package', presentation: { role: 'summary', childNodeIds: ['external'] } },
      { ...node('external'), type: 'external-package', presentation: { role: 'detail', parentId: 'summary' } }, { ...node('internal'), type: 'workspace-package' } ];
    source.edges = [{ id: 'declaration', sourceId: 'internal', targetId: 'external', kind: 'depends-on', label: 'depends-on', evidenceIds: ['declaration-evidence'], metadata: { versionRange: '^1' }, presentation: { initiallyHidden: true } }];
    const graph = layoutAnalyzerGraph3D(source);
    expect(graph.points.map(p => p.id).sort()).toEqual(['external', 'internal']);
    expect(graph.points.every(p => p.primitive === 'point')).toBe(true);
    expect(graph.edges).toEqual(source.edges);
  });
  it('rejects old, foreign-input and nonfinite camera states', () => {
    const source = fixture();
    const camera = { schema: 1 as const, view: source.view, input: 'scan:1', position: [0, 0, 100] as [number, number, number], target: [0, 0, 0] as [number, number, number], zoom: 1 };
    expect(compatibleGraph3DCamera(undefined, source, 'scan:1')).toBe(false);
    expect(compatibleGraph3DCamera(camera, source, 'scan:1')).toBe(true);
    expect(compatibleGraph3DCamera(camera, source, 'scan:2')).toBe(false);
    expect(compatibleGraph3DCamera({ ...camera, zoom: Infinity }, source, 'scan:1')).toBe(false);
  });
});
