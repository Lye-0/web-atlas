import { describe, expect, it } from 'vitest';
import { layoutSemanticFlow, semanticFlowEdgePaths } from './flowPresentation';
import type { SemanticGraph, SemanticNode } from './types';
import { buildSemanticExplorer, explorerRegionIdentity } from './semanticExplorer';
import { semanticFlowRegions } from './flowRegions';

const node = (id: string, path: string): SemanticNode => ({ id, label: 'callback', path, line: Number(id.split('-').at(-1)) + 1,
  kind: 'function', group: 'Source', evidence: [], confidence: 'source', attributes: {} });
const fixture = (): SemanticGraph => ({ view: 'function-call-flow', nodes: Array.from({ length: 6 }, (_, group) =>
  Array.from({ length: 40 }, (_, i) => node(`node-${group}-${i}`, `src/area-${group}/file-${Math.floor(i / 10)}.ts`))).flat(), edges: [] });

describe('membership point cloud', () => {
  it('uses a volume inside one file and stable, distinct IDs for identically named callbacks', () => {
    const graph = { ...fixture(), nodes: Array.from({ length: 80 }, (_, i) => node(`node-0-${i}`, 'src/one.ts')) };
    const points = layoutSemanticFlow(graph, '3d');
    for (const axis of ['x', 'y', 'z'] as const) expect(Math.max(...points.map(p => p[axis])) - Math.min(...points.map(p => p[axis]))).toBeGreaterThan(90);
    expect(new Set(points.map(p => `${p.x}:${p.y}:${p.z}`)).size).toBe(80);
    for (let i = 0; i < points.length; i++) for (const other of points.slice(i + 1)) {
      const point = points[i]!;
      expect(Math.hypot(point.x - other.x, point.y - other.y, point.z - other.z)).toBeGreaterThan(30);
    }
  });

  it('is independent of input order and relationship/selection changes, retaining evidence objects', () => {
    const graph = fixture(), before = JSON.stringify(graph), baseline = layoutSemanticFlow(graph, '3d');
    const relation = { id: 'cross-file', source: graph.nodes[0]!.id, target: graph.nodes.at(-1)!.id, kind: 'calls', label: 'callback()', confidence: 'source' as const,
      views: ['function-call-flow' as const], evidence: [{ path: 'src/area-0/file-0.ts', line: 4, endLine: 4, start: 20, end: 30, description: 'call' }] };
    const linked = { ...graph, nodes: [...graph.nodes].reverse(), edges: [relation] };
    expect(layoutSemanticFlow(linked, '3d')).toEqual(baseline);
    expect(semanticFlowEdgePaths(linked, baseline, new Set([relation.source]), undefined, '3d')[0]!.edge).toBe(relation);
    expect(JSON.stringify(graph)).toBe(before);
  });

  it('shares explorer ownership and keeps unresolved call-site paths outside definition clouds', () => {
    const graph: SemanticGraph = { view: 'runtime-flow', nodes: [
      { ...node('worker-0', 'wrangler.jsonc'), kind: 'resource', label: 'Worker', attributes: { resourceType: 'runtime', entryPath: 'src/entry.ts' } },
      node('entry-0', 'src/entry.ts'), node('helper-0', 'src/shared.ts'),
      { ...node('external-0', 'src/entry.ts'), kind: 'external', confidence: 'unresolved' },
    ], edges: [] };
    const model = buildSemanticExplorer(graph, new Set(['wrangler.jsonc', 'src/entry.ts', 'src/shared.ts']));
    const before = JSON.stringify(graph), points = layoutSemanticFlow(graph, '3d', model), regions = semanticFlowRegions(points, '3d', model);
    for (const point of points) {
      const region = regions.find(region => region.nodeIds.includes(point.node.id))!;
      expect(region.id).toBe(explorerRegionIdentity(model, point.node.id).id);
    }
    expect(regions.find(region => region.nodeIds.includes('entry-0'))?.nodeIds).toEqual(expect.arrayContaining(['worker-0']));
    expect(regions.find(region => region.nodeIds.includes('external-0'))?.nodeIds).not.toContain('entry-0');
    expect(JSON.stringify(graph)).toBe(before);
  });
});
