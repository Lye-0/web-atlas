import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isAnalyzerSourcePath, isAnalyzerUsageSourcePath, isExcludedDirectory } from './fileDiscovery';
import { ANALYZER_MODULE_NODE_WIDTH, layoutAnalyzerView } from './layout';
import { projectAnalyzerView, projectModuleDependency } from './projectors';
import { scanProjectFiles } from './scan';
import { collectSpatialEdgeSet } from './spatialGraph';
import type { AnalyzerSourceFile, AnalyzerViewModel } from './types';

function verifyAtlas(view: AnalyzerViewModel) {
  const start = performance.now();
  const layout = layoutAnalyzerView(view);
  const layoutMs = performance.now() - start;
  const regions = new Map(layout.regions?.map((region) => [region.region.id, region]));
  const contains = (outer: { x: number; y: number; width: number; height: number }, inner: typeof outer) => {
    expect(inner.x).toBeGreaterThanOrEqual(outer.x);
    expect(inner.y).toBeGreaterThanOrEqual(outer.y);
    expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width + 0.001);
    expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height + 0.001);
  };
  expect(layout.nodes).toHaveLength(view.nodes.length);
  for (const positioned of layout.nodes) {
    const path = positioned.node.metadata.regionPath as string[];
    const parent = regions.get(path.at(-1)!);
    expect(parent).toBeDefined();
    contains(parent!, { ...positioned, width: ANALYZER_MODULE_NODE_WIDTH });
  }
  for (const region of regions.values()) {
    if (region.region.parentRegionId) contains(regions.get(region.region.parentRegionId)!, region);
  }
  const nodeIds = new Set(view.nodes.map((node) => node.id));
  view.edges.forEach((edge) => {
    expect(nodeIds.has(edge.sourceId)).toBe(true);
    expect(nodeIds.has(edge.targetId)).toBe(true);
  });
  const regionById = new Map(view.regions?.map((region) => [region.id, region]));
  const selected = view.nodes.reduce((best, node) => Number(node.metadata.incomingCount) > Number(best.metadata.incomingCount) ? node : best, view.nodes[0]!);
  const edgeStart = performance.now();
  const edges = collectSpatialEdgeSet(view, layout.nodes, layout.regions ?? [], regionById, new Set(), 'near', selected.id);
  const edgeMs = performance.now() - edgeStart;
  const expected = view.edges.filter((edge) => edge.sourceId === selected.id || edge.targetId === selected.id).map((edge) => edge.id).sort();
  expect(edges.edges.flatMap((edge) => edge.edgeIds).sort()).toEqual(expected);
  return { modules: view.nodes.length, relations: view.edges.length, regions: regions.size, layoutMs: Math.round(layoutMs), edgeMs: Math.round(edgeMs), width: layout.width, height: layout.height };
}

describe('spatial atlas repository contracts', () => {
  it('keeps a 1200-module hierarchy complete and high-degree incidents exact', async () => {
    const sources: AnalyzerSourceFile[] = Array.from({ length: 1200 }, (_, i) => {
      const relativePath = `source/group-${i % 12}/module-${i}.ts`;
      const source = i === 0 ? 'export const value = 1;' : `import '../group-0/module-0';`;
      return { relativePath, name: basename(relativePath), extension: '.ts', size: source.length, readText: async () => source };
    });
    const view = projectModuleDependency(await scanProjectFiles(sources));
    const result = verifyAtlas(view);
    expect(result.modules).toBe(1200);
    expect(result.relations).toBe(1199);
    expect(result.width / result.height).toBeGreaterThan(0.5);
    expect(result.width / result.height).toBeLessThan(3);
    const layout = layoutAnalyzerView(view);
    const exact = collectSpatialEdgeSet(view, layout.nodes, layout.regions ?? [], new Map(view.regions?.map(region => [region.id, region])), new Set(), 'far', view.nodes.find(node => node.label === 'module-0.ts')!.id, undefined, undefined, false);
    expect(exact.edges).toHaveLength(1199);
    expect(exact.edges.every(edge => !edge.aggregated)).toBe(true);
  });

  // Explicit opt-in: no developer-specific paths or source snapshots in fixtures.
  const roots = (process.env.WEB_ATLAS_VALIDATION_REPOS ?? '').split(';').filter(Boolean);
  it.skipIf(roots.length === 0)('validates local repository inputs and every existing projection', async () => {
    for (const root of roots) {
      const files: AnalyzerSourceFile[] = [];
      const visit = async (directory: string, prefix = '') => {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
          if (entry.isSymbolicLink()) continue;
          const relativePath = prefix + entry.name;
          const absolute = join(directory, entry.name);
          if (entry.isDirectory()) {
            if (!isExcludedDirectory(entry.name)) await visit(absolute, `${relativePath}/`);
          } else if (isAnalyzerSourcePath(relativePath) || isAnalyzerUsageSourcePath(relativePath)) {
            const size = (await stat(absolute)).size;
            if (size <= 1024 * 1024) files.push({ relativePath, name: entry.name, extension: extname(entry.name), size, readText: () => readFile(absolute, 'utf8') });
          }
        }
      };
      await visit(root);
      const store = await scanProjectFiles(files);
      const view = projectModuleDependency(store);
      const result = verifyAtlas(view);
      for (const id of ['architecture', 'workspace', 'command', 'dependencies'] as const) {
        const projection = projectAnalyzerView(store, id);
        const layout = layoutAnalyzerView(projection);
        expect(Number.isFinite(layout.width) && Number.isFinite(layout.height)).toBe(true);
      }
      console.info('[atlas validation]', basename(root), JSON.stringify(result));
    }
  }, 60000);
});
