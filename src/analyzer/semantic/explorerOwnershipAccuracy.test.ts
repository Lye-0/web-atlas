// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AnalyzerProjectStore } from '../types';
import { projectSemanticView } from './project';
import { layoutSemanticFlow, semanticFlowEdgePaths } from './flowPresentation';
import { semanticFlowRegions } from './flowRegions';
import {
  buildSemanticExplorer, explorerBreadcrumbs, explorerChildren, explorerLocationForNode,
  explorerParentLocation, explorerProjectLocation, explorerRegionIdentity, explorerRelations, layoutExplorerRelations,
} from './semanticExplorer';
import type { SemanticAnalysis, SemanticEdge, SemanticGraph, SemanticNode } from './types';

const fn = (id: string, path?: string, attributes: SemanticNode['attributes'] = {}): SemanticNode => ({
  id, label: id, kind: 'function', path, line: 1, endLine: 1, group: 'API', confidence: 'source', attributes, evidence: [],
});
const relation = (id: string, source: string, target: string, kind = 'calls', line = 1): SemanticEdge => ({
  id, source, target, kind, label: kind, confidence: 'source', views: ['runtime-flow', 'function-call-flow'],
  evidence: [{ path: 'src/local.ts', start: line * 10, end: line * 10 + 5, line, endLine: line, description: id }],
});
const runtime = (id: string, entryPath: string): SemanticNode => ({
  ...fn(id, `${id}/wrangler.jsonc`, { resourceType: 'runtime', entryPath }), kind: 'resource',
});

describe('independent explorer ownership and relation accuracy', () => {
  it('uses recorded files, separates same-name IDs, and does not use external callsite paths as definitions', () => {
    const local = { ...fn('local', 'src/local.ts'), label: 'same' }, remote = { ...fn('remote', 'src/remote/file.ts'), label: 'same' };
    const external = { ...fn('external', 'src/local.ts'), kind: 'external' as const, confidence: 'unresolved' as const };
    const missing = fn('missing', 'src/missing.ts');
    const graph: SemanticGraph = { view: 'function-call-flow', nodes: [local, remote, external, missing], edges: [] };
    const model = buildSemanticExplorer(graph, new Set(['src/local.ts', 'src/remote/file.ts']));
    const sourceDirectory = explorerChildren(model, explorerProjectLocation).find(child => child.label === 'src')!;
    expect(explorerChildren(model, { ...explorerProjectLocation, scopeId: sourceDirectory.id }).map(child => child.label).sort()).toEqual(['local.ts', 'remote']);
    const localLocation = explorerLocationForNode(model, local.id), remoteLocation = explorerLocationForNode(model, remote.id);
    expect(explorerBreadcrumbs(model, localLocation).map(scope => scope.label)).toEqual(['プロジェクト', 'src', 'local.ts']);
    expect(explorerBreadcrumbs(model, remoteLocation).map(scope => scope.label)).toEqual(['プロジェクト', 'src', 'remote', 'file.ts']);
    expect(explorerChildren(model, explorerParentLocation(model, localLocation)).map(child => child.id)).toEqual(['local']);
    expect(localLocation.scopeId).not.toBe(remoteLocation.scopeId);
    for (const node of [external, missing]) expect(model.owners.get(node.id)).toMatchObject({ filePath: undefined, definitionAvailable: false });
    expect(explorerRegionIdentity(model, external.id).label).toBe('定義先が未特定の呼び出し');
    expect(explorerRegionIdentity(model, external.id).id).not.toBe(explorerRegionIdentity(model, local.id).id);
  });

  it('keeps runtime unknown, exact entry membership, and multiple runtime candidates distinct', () => {
    const first = runtime('runtime-one', 'src/entry.ts'), second = runtime('runtime-two', 'src/shared-entry.ts');
    const entry = fn('entry', 'src/entry.ts'), shared = fn('shared', 'src/shared-entry.ts'), helper = fn('helper', 'apps/web/helper.ts');
    const direct = fn('direct', 'src/other.ts');
    const graph: SemanticGraph = { view: 'runtime-flow', nodes: [first, second, entry, shared, helper, direct], edges: [
      relation('ambiguous-runtime', first.id, shared.id, 'runtime-entry'), relation('explicit-runtime', first.id, direct.id, 'runtime-entry'),
      relation('not-runtime-propagation', entry.id, helper.id),
    ] };
    const model = buildSemanticExplorer(graph, new Set(graph.nodes.flatMap(node => node.path ? [node.path] : [])));
    expect(model.runtimeMode).toBe('mixed');
    for (const node of [entry, direct]) expect(model.owners.get(node.id)).toMatchObject({ contextId: `context:runtime:${first.id}`, runtimeCandidateIds: [first.id] });
    expect(model.owners.get(shared.id)?.runtimeCandidateIds.sort()).toEqual([first.id, second.id]);
    for (const node of [shared, helper]) expect(model.owners.get(node.id)?.contextId).toBe('context:unclassified');
    expect(model.scopes.get('context:unclassified')?.label).toBe('実行環境未判定・所属別表示');
    expect(explorerRegionIdentity(model, helper.id)).toMatchObject({ label: 'apps/web', kind: 'directory' });
  });

  it('grounds recorded service names only for observed nodes', () => {
    const observed = { ...fn('span', undefined, { 'service.name': 'recorded-service' }), kind: 'span' as const, confidence: 'observed' as const };
    const source = fn('source', 'src/local.ts', { 'service.name': 'recorded-service' });
    const model = buildSemanticExplorer({ view: 'runtime-flow', nodes: [observed, source], edges: [] }, new Set(['src/local.ts']));
    expect(explorerRegionIdentity(model, observed.id)).toMatchObject({ label: '実測サービス: recorded-service' });
    expect(model.owners.get(source.id)?.contextId).toBe('context:unclassified');
  });

  it('preserves direct cross-file relations, repeated callsites, callback and self-cycle evidence in both directions', () => {
    const center = fn('center', 'src/local.ts'), incoming = fn('incoming', 'src/remote/a.ts'), outgoing = fn('outgoing', 'src/remote/b.ts'), secondHop = fn('second-hop', 'src/last.ts');
    const edges = [relation('in', incoming.id, center.id), relation('out-a', center.id, outgoing.id, 'calls', 2), relation('out-b', center.id, outgoing.id, 'calls', 3),
      relation('self', center.id, center.id, 'calls', 4), relation('callback', center.id, outgoing.id, 'callback', 5), relation('next', outgoing.id, secondHop.id)];
    const graph: SemanticGraph = { view: 'function-call-flow', nodes: [center, incoming, outgoing, secondHop], edges };
    const before = JSON.stringify(graph), local = explorerRelations(graph, center.id);
    expect(local.nodes.map(node => node.id).sort()).toEqual(['center', 'incoming', 'outgoing']);
    expect(local.edges.map(edge => edge.id)).toEqual(['in', 'out-a', 'out-b', 'self', 'callback']);
    for (const edge of local.edges) expect(edge).toBe(edges.find(original => original.id === edge.id));
    const positions = new Map(layoutExplorerRelations(local, center.id).map(position => [position.node.id, position]));
    expect(positions.get('incoming')!.x).toBeLessThan(positions.get('center')!.x);
    expect(positions.get('outgoing')!.x).toBeGreaterThan(positions.get('center')!.x);
    expect(explorerRelations(graph, center.id, 1, 'incoming').edges.map(edge => edge.id)).toEqual(['in', 'self']);
    expect(explorerRelations(graph, center.id, 1, 'outgoing').edges.map(edge => edge.id)).toEqual(['out-a', 'out-b', 'self', 'callback']);
    expect(explorerRelations(graph, center.id, 2).edges).toContain(edges[5]);
    expect(JSON.stringify(graph)).toBe(before);
  });
});

interface SourceFactReport { projects: { name: string; nodes: { id: string; path: string; label: string; expectedLine: number }[]; relations: { sourceId: string; targetId: string; edgeId: string; path: string; line: number }[] }[] }
const roots = (process.env.WEB_ATLAS_VALIDATION_REPOS ?? '').split(';').filter(Boolean);
const factsPath = process.env.WEB_ATLAS_EXPLORER_ACCURACY_FACTS ?? '';

describe('independent opted-in explorer source comparison', () => {
  it.skipIf(!roots.length || !factsPath)('retains real-project source ownership and every selected canonical relation', async () => {
    const facts = JSON.parse(await readFile(factsPath, 'utf8')) as SourceFactReport;
    for (const root of roots) {
      const name = basename(root), selected = facts.projects.find(project => project.name === name)!;
      const analysis = JSON.parse(await readFile(`.cache/semantic-validation/${name}-analysis.json`, 'utf8')) as SemanticAnalysis;
      const store = JSON.parse(await readFile(`.cache/semantic-validation/${name}.json`, 'utf8')) as AnalyzerProjectStore;
      const files = new Set(store.files.map(file => file.relativePath)), call = projectSemanticView(analysis, 'function-call-flow');
      const model = buildSemanticExplorer(call, files);
      expect(model.owners.size).toBe(call.nodes.length);
      expect(model.scopes.get('project')?.memberIds.sort()).toEqual(call.nodes.map(node => node.id).sort());
      for (const node of selected.nodes) {
        const original = await readFile(join(root, node.path), 'utf8');
        expect(original).toBe(store.semanticSources?.[node.path] ?? store.sources[node.path]);
        expect(model.nodes.get(node.id)).toMatchObject({ path: node.path, label: node.label, line: node.expectedLine });
        expect(model.owners.get(node.id)).toMatchObject({ filePath: node.path, definitionAvailable: true });
        const location = explorerLocationForNode(model, node.id);
        expect(location.centerId).toBe(node.id);
        expect(explorerBreadcrumbs(model, location).at(-1)?.path).toBe(node.path);
        expect(explorerChildren(model, explorerParentLocation(model, location)).some(child => child.id === node.id)).toBe(true);
      }
      for (const expected of selected.relations) {
        const local = explorerRelations(call, expected.sourceId);
        const edge = local.edges.find(edge => edge.id === expected.edgeId)!;
        expect(edge).toMatchObject({ source: expected.sourceId, target: expected.targetId });
        expect(edge).toBe(call.edges.find(edge => edge.id === expected.edgeId));
        expect(edge.evidence.some(evidence => evidence.path === expected.path && evidence.line === expected.line)).toBe(true);
        const paths = semanticFlowEdgePaths(local, layoutExplorerRelations(local, expected.sourceId), new Set([expected.sourceId]), undefined, '2d');
        expect(paths.find(path => path.edge.id === expected.edgeId)?.edge).toBe(edge);
      }
      for (const node of call.nodes.filter(node => node.kind === 'external')) expect(model.owners.get(node.id)).toMatchObject({ filePath: undefined, definitionAvailable: false });
      const runtimeGraph = projectSemanticView(analysis, 'runtime-flow'), runtimeModel = buildSemanticExplorer(runtimeGraph, files);
      expect(runtimeModel.runtimeMode).toBe(name === 'git-lines' ? 'fallback' : 'mixed');
      for (const node of runtimeGraph.nodes) {
        const owner = runtimeModel.owners.get(node.id)!;
        if (owner.contextId !== 'context:unclassified') expect(owner.runtimeCandidateIds).toHaveLength(1);
        else expect(owner.runtimeCandidateIds).not.toHaveLength(1);
      }
      for (const [graph, explorer] of [[call, model], [runtimeGraph, runtimeModel]] as const) {
        const positions = layoutSemanticFlow(graph, '3d', explorer), regions = semanticFlowRegions(positions, '3d', explorer);
        const positionById = new Map(positions.map(position => [position.node.id, position]));
        expect(positionById.size).toBe(graph.nodes.length);
        for (const node of graph.nodes) expect(positionById.get(node.id)?.node).toBe(node);
        const regionByNode = new Map(regions.flatMap(region => region.nodeIds.map(id => [id, region] as const)));
        expect(regionByNode.size).toBe(graph.nodes.length);
        for (const node of graph.nodes) expect(regionByNode.get(node.id)?.id).toBe(explorerRegionIdentity(explorer, node.id).id);
        for (const expected of selected.relations) {
          if (!positionById.has(expected.sourceId)) continue;
          const local = explorerRelations(graph, expected.sourceId);
          const edge = local.edges.find(edge => edge.id === expected.edgeId);
          if (!edge) continue; // Runtime may represent an original call through a processing-path.
          const paths = semanticFlowEdgePaths(local, positions, new Set([expected.sourceId]), undefined, '3d');
          expect(paths.find(path => path.edge.id === expected.edgeId)?.edge).toBe(edge);
        }
      }
    }
  });
});
