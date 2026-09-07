// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { OrthographicCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { semanticFlowEdgePaths } from './flowPresentation';
import { resolveSemanticFlowHover, semanticFlowNodeRelationKinds, semanticFlowNodeRoles, semanticFlowRoleLabel } from './flowRelationInteraction';
import { buildSemanticExplorer } from './semanticExplorer';
import { buildUnresolvedFlowPresentation } from './flowUnresolvedPresentation';
import { semanticFlowRegions } from './flowRegions';
import { semanticFlowRegionWire } from '../../components/analyzer/semanticFlow3DGeometry';
import { semanticNodeDisplays } from '../../components/analyzer/semanticFlowDisplay';
import { projectSemanticFlowLabels } from '../../components/analyzer/semanticFlowLabels';
import { projectSemanticView } from './project';
import type { AnalyzerProjectStore } from '../types';
import { analyzerSessionReducer, createInitialAnalyzerSessionState } from '../session';
import type { SemanticAnalysis, SemanticEdge, SemanticGraph, SemanticNode } from './types';

const node = (id: string, path?: string): SemanticNode => ({ id, path, label: 'same', kind: 'function', group: 'Source', confidence: 'source', evidence: [], attributes: {} });
const edge = (id: string, source: string, target: string, kind = 'calls'): SemanticEdge => ({ id, source, target, kind, label: kind, confidence: 'source', evidence: [], views: ['runtime-flow', 'function-call-flow'] });
const roots = (process.env.WEB_ATLAS_VALIDATION_REPOS ?? '').split(';').filter(Boolean);
const enabled = roots.length > 0 && process.env.WEB_ATLAS_POLISH_REVIEW === '1';

describe('independent polish presentation review', () => {
  it('keeps the shared bounds preference across tab changes without replacing any view, selection, query or camera state', () => {
    const initial = createInitialAnalyzerSessionState();
    expect(initial.showFlowGroupBounds).toBe(true);
    const before = JSON.stringify(initial.views);
    const off = analyzerSessionReducer(initial, { type: 'setFlowGroupBounds', visible: false });
    expect(off.views).toBe(initial.views); expect(off.store).toBe(initial.store);
    expect(JSON.stringify(off.views)).toBe(before);
    const runtime = analyzerSessionReducer(off, { type: 'setActiveView', view: 'runtime-flow' });
    const calls = analyzerSessionReducer(runtime, { type: 'setActiveView', view: 'function-call-flow' });
    expect(calls.showFlowGroupBounds).toBe(false); expect(calls.views).toBe(initial.views);
    const on = analyzerSessionReducer(calls, { type: 'setFlowGroupBounds', visible: true });
    expect(on.showFlowGroupBounds).toBe(true); expect(on.views).toBe(initial.views);
  });

  it('retains reciprocal, parallel, self and mixed Runtime relations by ID, even with duplicate names', () => {
    const graph: SemanticGraph = { view: 'runtime-flow', nodes: ['a', 'b', 'c', 'unrelated'].map(id => node(id)), edges: [
      edge('out', 'a', 'b', 'registers-event'), edge('parallel', 'a', 'b', 'handles'), edge('in', 'b', 'a', 'reads'),
      edge('other', 'a', 'c', 'executes'), edge('self', 'a', 'a'), edge('background', 'c', 'unrelated'),
    ] };
    const original = JSON.stringify(graph), selection = new Set(['a']);
    const roles = semanticFlowNodeRoles(graph, selection);
    expect(roles.get('a')).toBe('selected'); expect(roles.get('b')).toBe('both'); expect(roles.get('c')).toBe('outgoing');
    expect(roles.has('unrelated')).toBe(false);
    expect(semanticFlowRoleLabel('both', 'runtime-flow')).toBe('入る・出る関係');
    expect(semanticFlowRoleLabel('both', 'function-call-flow', new Set(['calls']))).toBe('呼び出し元・先');
    expect(semanticFlowRoleLabel('both', 'function-call-flow', new Set(['callback']))).toBe('コールバック元・先');
    const kinds = semanticFlowNodeRelationKinds(graph, selection);
    expect([...kinds.get('b')!].sort()).toEqual(['handles', 'reads', 'registers-event']);
    expect(semanticFlowRoleLabel('both', 'runtime-flow', kinds.get('b'))).toBe('入る・出る関係');
    expect([...resolveSemanticFlowHover(graph, selection, undefined, { kind: 'node', id: 'b' }).edgeIds].sort()).toEqual(['in', 'out', 'parallel']);
    expect([...resolveSemanticFlowHover(graph, selection, undefined, { kind: 'edge', id: 'parallel' }).edgeIds]).toEqual(['parallel']);
    expect(resolveSemanticFlowHover(graph, selection, undefined, { kind: 'node', id: 'same' }).edgeIds.size).toBe(0);
    expect(resolveSemanticFlowHover(graph, selection, undefined, { kind: 'node', id: 'unrelated' }).edgeIds.size).toBe(0);
    expect(resolveSemanticFlowHover(graph, selection, undefined).edgeIds.size).toBe(0);
    const filtered = { ...graph, nodes: graph.nodes.filter(item => item.id !== 'b') };
    expect(resolveSemanticFlowHover(filtered, selection, undefined, { kind: 'edge', id: 'parallel' }).edgeIds.size).toBe(0);
    expect([...semanticFlowNodeRoles(graph, new Set(), 'out')]).toEqual([['a', 'source'], ['b', 'target']]);
    expect([...semanticFlowNodeRoles(graph, new Set(), 'self')]).toEqual([['a', 'source-target']]);
    expect([...resolveSemanticFlowHover(graph, new Set(), 'out', { kind: 'node', id: 'b' }).edgeIds]).toEqual(['out']);
    expect(JSON.stringify(graph)).toBe(original);
  });

  it('resolves a compressed Runtime relation through its recorded provenance without inventing an intermediate point', () => {
    const first = edge('first', 'a', 'middle'), last = edge('last', 'middle', 'b', 'executes');
    const compressed = { ...edge('path', 'a', 'b', 'processing-path'), provenance: { edges: [first, last], intermediateNodeIds: ['middle'] } };
    const graph: SemanticGraph = { view: 'runtime-flow', nodes: [node('a'), node('b')], edges: [compressed] };
    expect([...semanticFlowNodeRoles(graph, new Set(['a']))]).toEqual([['b', 'outgoing'], ['a', 'selected']]);
    expect([...semanticFlowNodeRoles(graph, new Set(), 'last')]).toEqual([['a', 'source'], ['b', 'target']]);
    const hover = resolveSemanticFlowHover(graph, new Set(['a']), undefined, { kind: 'edge', id: 'last' });
    expect([...hover.edgeIds]).toEqual(['path']); expect([...hover.nodeIds]).toEqual(['a', 'b']);
  });

  it('keeps each 3D curve and self-loop endpoint at the point center under camera rotation, zoom and viewport changes', () => {
    const graph: SemanticGraph = { view: 'function-call-flow', nodes: [node('a'), node('b')], edges: [edge('out', 'a', 'b'), edge('in', 'b', 'a'), edge('self', 'a', 'a')] };
    const positions = graph.nodes.map((item, index) => ({ node: item, x: index * 82.3, y: index * -33.7, z: index * 161.1 }));
    const paths = semanticFlowEdgePaths(graph, positions, new Set(['a']), undefined, '3d');
    for (const [width, height, zoom, dpr] of [[1440, 900, .3, 1], [920, 640, 1, 1.25], [700, 700, 3, 2]]) {
      const camera = new OrthographicCamera(-width! / 2, width! / 2, height! / 2, -height! / 2, .1, 10000);
      camera.position.set(813, 529, 1740); camera.lookAt(21, -47, 30); camera.zoom = zoom!; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      const screen = (p: { x: number; y: number; z: number }) => new Vector3(p.x, p.y, p.z).project(camera).multiply(new Vector3(width! * dpr!, height! * dpr!, 1)).toArray();
      for (const path of paths) {
        const start = positions.find(point => point.node.id === path.edge.source)!, end = positions.find(point => point.node.id === path.edge.target)!;
        expect(screen(path.points[0]!)).toEqual(screen(start)); expect(screen(path.points.at(-1)!)).toEqual(screen(end));
      }
    }
  });

  it('derives only wire corners from existing ownership without adopting geometrically enclosed unrelated points', () => {
    const nodes = [node('a', 'src/a.ts'), node('b', 'src/a.ts'), node('other', 'elsewhere/b.ts')];
    const graph: SemanticGraph = { view: 'function-call-flow', nodes, edges: [] };
    const explorer = buildSemanticExplorer(graph, new Set(['src/a.ts', 'elsewhere/b.ts']));
    const positions = nodes.map((item, index) => ({ node: item, x: index === 1 ? 40 : 20, y: 0, z: 0 }));
    const original = JSON.stringify(positions), regions = semanticFlowRegions(positions, '3d', explorer);
    const group = regions.find(region => region.nodeIds.includes('a'))!;
    expect(group.nodeIds.sort()).toEqual(['a', 'b']); expect(group.nodeIds).not.toContain('other');
    expect(semanticFlowRegionWire(group)).toHaveLength(24);
    expect(JSON.stringify(positions)).toBe(original);
  });

  it('identifies an unresolved boundary as display aggregation with actual explorer-generated group IDs', () => {
    const external: SemanticNode = { ...node('unknown', 'src/caller.ts'), kind: 'external', confidence: 'unresolved' };
    const graph: SemanticGraph = { view: 'function-call-flow', nodes: [external], edges: [] };
    const explorer = buildSemanticExplorer(graph, new Set(['src/caller.ts']));
    const positions = [{ node: external, x: 0, y: 0, z: 0 }], regions = semanticFlowRegions(positions, '3d', explorer);
    expect(regions[0]!.id).toBe('group:["","unresolved-calls"]');
    const camera = new OrthographicCamera(-500, 500, 400, -400, .1, 10000); camera.position.set(0, 0, 1000); camera.lookAt(0, 0, 0);
    const labels = projectSemanticFlowLabels(camera, { width: 1000, height: 800 }, .5, positions, new Set(), new Set(), { regions });
    const label = labels.find(item => item.region);
    expect(label).toBeDefined(); expect(label!.path).toContain('表示上の集約');
  });

  it('disambiguates same-name files, paths, ranges and source-less identities using only recorded information', () => {
    const withRange = (id: string, path: string, start: number, end: number): SemanticNode => ({ ...node(id, path), line: 163,
      evidence: [{ path, start, end, line: 163, endLine: 163, description: 'recorded' }] });
    const nodes = [withRange('first', 'src/first/Panel.tsx', 50, 70), withRange('second', 'src/second/Panel.tsx', 50, 70),
      withRange('range-one', 'src/GraphSvg.tsx', 12419, 12451), withRange('range-two', 'src/GraphSvg.tsx', 12457, 13031),
      { ...node('source-less-one'), kind: 'span' as const, confidence: 'observed' as const, group: 'service' },
      { ...node('source-less-two'), kind: 'span' as const, confidence: 'observed' as const, group: 'service' },
    ];
    const original = JSON.stringify(nodes), displays = semanticNodeDisplays(nodes);
    expect(displays.get('first')?.disambiguation).toContain('first/Panel.tsx');
    expect(displays.get('second')?.disambiguation).toContain('second/Panel.tsx');
    expect(displays.get('range-one')?.disambiguation).toContain('12419');
    expect(displays.get('range-two')?.disambiguation).toContain('12457');
    expect(displays.get('source-less-one')?.disambiguation).toContain('Span');
    expect(displays.get('source-less-one')?.disambiguation).not.toMatch(/\.tsx|範囲/);
    expect(new Set([...displays.values()].map(display => display.disambiguation)).size).toBe(nodes.length);
    for (const item of nodes) {
      expect(displays.get(item.id)?.tooltip).toContain(`ID: ${item.id}`);
      if (item.path) expect(displays.get(item.id)?.tooltip).toContain(item.path);
    }
    expect(semanticNodeDisplays([{ ...node('unique'), label: 'unique' }]).get('unique')?.disambiguation).toBeUndefined();
    expect(JSON.stringify(nodes)).toBe(original);
  });

  it.skipIf(!enabled)('checks actual GraphPanel/GraphSvg and busy Runtime pairs against original edge identities and distinct callback ranges', async () => {
    for (const root of roots) {
      const snapshot = `.cache/semantic-validation/${basename(root)}`;
      const store = JSON.parse(await readFile(`${snapshot}.json`, 'utf8')) as AnalyzerProjectStore;
      const analysis = JSON.parse(await readFile(`${snapshot}-analysis.json`, 'utf8')) as SemanticAnalysis;
      for (const view of ['runtime-flow', 'function-call-flow'] as const) {
        const graph = projectSemanticView(analysis, view), original = JSON.stringify(graph);
        const explorer = buildSemanticExplorer(graph, new Set(store.files.map(file => file.relativePath))), cloud = buildUnresolvedFlowPresentation(graph, explorer);
        const positions = [...cloud.regular, ...cloud.individual], byId = new Map(positions.map(point => [point.node.id, point]));
        const selected = graph.nodes.filter(item => ['GraphPanel.load', 'GraphPanel.send', 'GraphSvg'].includes(item.label));
        if (!selected.length) {
          const degrees = new Map<string, number>();
          for (const relation of graph.edges) for (const id of [relation.source, relation.target]) degrees.set(id, (degrees.get(id) ?? 0) + 1);
          selected.push([...graph.nodes].sort((a, b) => (degrees.get(b.id) ?? 0) - (degrees.get(a.id) ?? 0))[0]!);
        }
        for (const item of selected) {
          const ids = new Set([item.id]), paths = semanticFlowEdgePaths(graph, positions, ids, undefined, '3d', true);
          const shown: SemanticGraph = { ...graph, edges: paths.map(path => path.edge) };
          for (const path of paths) {
            const start = byId.get(path.edge.source)!, end = byId.get(path.edge.target)!;
            expect(path.points[0]).toEqual({ x: start.x, y: start.y, z: start.z });
            expect(path.points.at(-1)).toEqual({ x: end.x, y: end.y, z: end.z });
            const counterpart = path.edge.source === item.id ? path.edge.target : path.edge.source;
            const expected = shown.edges.filter(edge => edge.source === item.id && edge.target === counterpart || edge.target === item.id && edge.source === counterpart).map(edge => edge.id).sort();
            expect([...resolveSemanticFlowHover(shown, ids, undefined, { kind: 'node', id: counterpart }).edgeIds].sort()).toEqual(expected);
            expect([...resolveSemanticFlowHover(shown, ids, undefined, { kind: 'edge', id: path.edge.id }).edgeIds]).toEqual([path.edge.id]);
          }
        }
        const duplicates = graph.nodes.filter(item => item.label === 'callback L163');
        const displays = semanticNodeDisplays(duplicates);
        expect(displays.size).toBe(duplicates.length);
        expect(new Set([...displays.values()].map(display => display.location)).size).toBe(duplicates.length);
        expect(new Set([...displays.values()].map(display => display.disambiguation)).size).toBe(duplicates.length);
        if (basename(root) === 'git-lines' && view === 'function-call-flow') {
          const graphSvg = selected.find(item => item.label === 'GraphSvg')!;
          const kinds = semanticFlowNodeRelationKinds(graph, new Set([graphSvg.id]));
          for (const duplicate of duplicates.filter(item => item.path?.includes('GraphSvg'))) {
            expect([...kinds.get(duplicate.id)!]).toEqual(['callback']);
            expect(semanticFlowRoleLabel('outgoing', view, kinds.get(duplicate.id))).toBe('コールバック先');
          }
        }
        expect(JSON.stringify(graph)).toBe(original);
      }
    }
  }, 120000);
});
