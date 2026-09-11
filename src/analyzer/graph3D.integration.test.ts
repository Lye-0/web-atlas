import { describe, expect, it } from 'vitest';
import { scanProjectFiles } from './scan';
import { projectAnalyzerView } from './projectors';
import { layoutAnalyzerGraph3D } from './graph3D';
import { prepareAutoAggregation, projectAutoAggregation, projectAggregationRelations } from './autoAggregation';
import { analyzerSessionReducer, createInitialAnalyzerSessionState, restoreAnalyzerViewSession } from './session';
import type { AnalyzerViewId } from './types';

const sources: Record<string, string> = {
  'package.json': JSON.stringify({ name: 'fixture', scripts: { dev: 'concurrently "pnpm --filter a run dev" "pnpm --filter b run dev"', check: 'pnpm run cycle', cycle: 'pnpm run check', long: 'node script.js --message "one two" && node next.js --flag' }, dependencies: { react: '^19', 'fixture-shared-library': '^1' } }),
  'pnpm-workspace.yaml': 'packages:\n  - packages/*\n  - packages/a\n  - missing/*\n',
  'packages/a/package.json': JSON.stringify({ name: 'a', scripts: { dev: 'vite --port 4001' }, dependencies: { react: '^19', 'fixture-shared-library': '^2', b: 'workspace:*', 'fixture-missing': 'workspace:*' } }),
  'packages/b/package.json': JSON.stringify({ name: 'b', scripts: { dev: 'vite --port 4002' }, peerDependencies: { 'fixture-shared-library': '>=1' } }),
  'packages/a/src/index.ts': 'import { b } from "../../b/src/index"; import "./deep/one/two/three/file"; import "./missing"; export const a = b;',
  'packages/b/src/index.ts': 'export const b = 1;',
  'packages/a/src/deep/one/two/three/file.ts': 'export const deep = true;',
  ...Object.fromEntries(Array.from({ length: 32 }, (_, index) => [`packages/a/src/direct-${index}.ts`, `export const value${index} = ${index};`])),
};
const scan = () => scanProjectFiles(Object.entries(sources).map(([relativePath, text]) => ({ relativePath, name: relativePath.split('/').at(-1)!, extension: relativePath.slice(relativePath.lastIndexOf('.')), size: text.length, readText: async () => text })));

describe('3D preserves scanned analyzer contracts', () => {
  it('keeps empty and overlapping workspace patterns and canonical target IDs', async () => {
    const store = await scan(), model = projectAnalyzerView(store, 'workspace'), graph = layoutAnalyzerGraph3D(model);
    const zero = model.nodes.find(node => node.type === 'workspace-pattern' && node.label.includes('missing'))!;
    expect(zero).toBeDefined(); expect(graph.points.some(point => point.id === zero.id)).toBe(true);
    expect(graph.edges.filter(edge => edge.sourceId === zero.id && edge.kind === 'matches')).toHaveLength(0);
    const a = model.nodes.find(node => node.type === 'workspace-package' && node.label === 'a')!;
    expect(graph.points.filter(point => point.id === a.id)).toHaveLength(1);
    expect(graph.edges.filter(edge => edge.targetId === a.id && edge.kind === 'matches')).toHaveLength(2);
    expect(graph.edges).toEqual(model.edges);
  });
  it('retains scope usages, declaration evidence, and all dependency versions', async () => {
    const store = await scan(), before = JSON.stringify({ facts: store.facts, relations: store.relations, evidence: store.evidence });
    for (const view of ['architecture', 'workspace', 'command', 'dependencies', 'module-dependency'] as const) {
      const model = projectAnalyzerView(store, view), graph = layoutAnalyzerGraph3D(model);
      expect(graph.edges.every(edge => model.edges.includes(edge))).toBe(true);
      expect(graph.points.every(point => model.nodes.includes(point.original))).toBe(true);
      expect(new Set(graph.points.map(point => point.id)).size).toBe(graph.points.length);
      if (view === 'architecture') { expect(graph.edges.some(edge => edge.kind === 'uses')).toBe(false); expect(graph.edges).toEqual(model.edges); }
    }
    const dependency = layoutAnalyzerGraph3D(projectAnalyzerView(store, 'dependencies'));
    const shared = dependency.points.find(point => point.original.label === 'fixture-shared-library')!;
    expect(shared).toBeDefined(); expect(dependency.points.filter(point => point.id === shared.id)).toHaveLength(1);
    expect(dependency.edges.filter(edge => edge.targetId === shared.id)).toHaveLength(3);
    const original = store.facts.find(fact => fact.id === shared.original.factId);
    expect(original?.kind).toBe('external-package');
    if (original?.kind === 'external-package') expect([...original.versionRanges].sort()).toEqual(['>=1', '^1', '^2']);
    expect(JSON.stringify({ facts: store.facts, relations: store.relations, evidence: store.evidence })).toBe(before);
  });
  it('partitions manual/automatic owners exactly, protects selected endpoints, and retains declaration provenance', async () => {
    const graph = layoutAnalyzerGraph3D(projectAnalyzerView(await scan(), 'module-dependency'));
    const points = graph.points, groups = graph.groups, prepared = prepareAutoAggregation(points, groups);
    const relation = graph.edges[0]!, protectedIds = new Set([relation.sourceId, relation.targetId]);
    const root = [...groups].sort((a, b) => b.memberIds.length - a.memberIds.length)[0]!;
    const result = projectAutoAggregation({ points, groups, prepared, enabled: false, protectedIds, manualGroups: [root], projection: { width: 100, height: 100, zoom: .001 } });
    expect(result.metrics.size).toBe(0); expect(result.counts.automaticMembers).toBe(0);
    expect(result.counts.manualMembers).toBeGreaterThan(0);
    const represented = [...result.individualIds, ...result.aggregates.flatMap(group => group.memberIds)];
    expect(represented.length).toBe(points.length); expect(new Set(represented)).toEqual(new Set(points.map(point => point.id)));
    for (const id of protectedIds) expect(result.ownerById.get(id)).toBe(id);
    const originals = graph.edges.map(original => ({ id: original.id, source: original.sourceId, target: original.targetId, kind: original.kind, confidence: '', original }));
    const displayed = projectAggregationRelations(originals, result.ownerById);
    expect(displayed.flatMap(edge => edge.originals).map(edge => edge.id).sort()).toEqual(graph.edges.map(edge => edge.id).sort());
    for (const edge of displayed) for (const original of edge.originals) { expect(edge.source).toBe(result.ownerById.get(original.source)); expect(edge.target).toBe(result.ownerById.get(original.target)); }
  });
  it('keeps new camera/manual state separate and resets it on project replacement', async () => {
    const store = await scan(); let session = analyzerSessionReducer(createInitialAnalyzerSessionState(), { type: 'replaceProject', store });
    const view: AnalyzerViewId = 'module-dependency', model = projectAnalyzerView(store, view);
    const camera = { x: 17, y: 23, scale: .7 }, manual = new Set(model.regions!.map(region => region.id));
    session = analyzerSessionReducer(session, { type: 'updateView', view, update: { camera, expandedPresentationIds: manual, graphMode: '3d', graph3DCamera: { schema: 1, view, input: 'test', position: [10, 20, 30], target: [1, 2, 3], zoom: 2 }, graph3DAggregation: { expandedGroupIds: [], collapsedGroupIds: ['test-group'] } } });
    const restored = restoreAnalyzerViewSession(session.views[view], model);
    expect(restored.camera).toBe(camera); expect(restored.expandedPresentationIds).toBe(manual); expect(restored.graph3DAggregation?.collapsedGroupIds).toEqual(['test-group']);
    session = analyzerSessionReducer(session, { type: 'replaceProject', store: { ...store, scannedAt: 'new' } });
    expect(session.views[view].graphMode).toBeUndefined(); expect(session.views[view].graph3DCamera).toBeUndefined(); expect(session.views[view].graph3DAggregation).toBeUndefined();
  });
});
