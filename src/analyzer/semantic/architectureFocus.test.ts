// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildArchitectureModel } from './architecture';
import { architectureScopeGraph, prepareArchitectureScope } from './architectureProjection';
import { architectureRelationCounts, architectureRelationLabel } from './architectureRelations';
import { projectAggregatedSemanticFlow } from './flowAutoAggregation';
import { searchSemanticNodes } from './search';
import { semanticNodeDisplays } from '../../components/analyzer/semanticFlowDisplay';
import type { SemanticEdge, SemanticGraph, SemanticNode } from './types';

const evidence = (line: number) => [{ path: 'source.ts', start: line * 10, end: line * 10 + 5, line, endLine: line, description: 'independent source site' }];
const node = (id: string, parentId?: string, kind: NonNullable<SemanticNode['architecture']>['kind'] = parentId ? 'component' : 'application'): SemanticNode => ({
  id, label: id, kind: 'subsystem', group: parentId ?? 'project', confidence: 'source', evidence: evidence(1), attributes: {},
  architecture: { kind, parentId, files: [], memberIds: [], roles: [], entryPaths: [], context: [], environments: [], technologyNames: [], auxiliary: false },
});
const edge = (id: string, source: string, target: string, kind = 'calls', line = 1): SemanticEdge => ({ id, source, target, kind, label: 'openGraph', confidence: 'source', evidence: evidence(line), views: ['architecture-map'] });
const originalIds = (edges: SemanticEdge[]) => [...new Set(edges.flatMap(e => (e.provenance?.edges ?? [e]).map(e => e.id)))].sort();
const model = (edges: SemanticEdge[] = []): SemanticGraph => ({ view: 'architecture-map', nodes: [node('A'), node('a', 'A'), node('a2', 'A'), node('B'), node('b', 'B'), node('b2', 'B'), node('C'), node('c', 'C'), node('service', undefined, 'external-service')], edges });
const build = (sources: Record<string, string>, nodes: SemanticNode[] = []) => buildArchitectureModel({ sources, imports: [], resources: [] }, { nodes, edges: [] });

describe('Architecture focus/context independent contracts', () => {
  it('T01 keeps collapsed child relations internal and exposes them at their actual grain', () => {
    const source = model([edge('ab', 'a', 'a2')]), root = architectureScopeGraph(source), inside = architectureScopeGraph(source, 'A');
    expect(root.edges).toEqual([]);
    expect(originalIds(root.architectureView!.internalRelations)).toEqual(['ab']);
    expect(root.nodes.find(n => n.id === 'A')?.attributes.architectureInternalCount).toBe(1);
    expect(inside.edges.map(e => [e.source, e.target])).toEqual([['a', 'a2']]);
  });
  it('T02 distinguishes a real current-grain self relation, child recursion and mutual relations', () => {
    const recursion = { ...edge('recursion', 'a', 'a'), provenance: { edges: [edge('function-recursion', 'fn', 'fn')] } };
    const graph = architectureScopeGraph(model([edge('self', 'A', 'A', 'declaration-dependency'), recursion, edge('ab', 'a', 'b'), edge('ba', 'b', 'a')]));
    expect(graph.edges.map(e => [e.source, e.target]).sort()).toEqual([['A', 'A'], ['A', 'B'], ['B', 'A']]);
    expect(originalIds(graph.architectureView!.internalRelations)).toEqual(['function-recursion']);
    expect(graph.edges.find(e => e.source === e.target)?.details?.architectureRelation).toBe('self');
  });
  it('T03 keeps kind, environment, confidence, original IDs and source sites', () => {
    const edges = [edge('code', 'a', 'b', 'code-reference', 1), edge('http', 'a', 'b', 'http-request', 2),
      { ...edge('setting', 'A', 'B', 'deployment-config', 3), details: { environment: 'production' } },
      { ...edge('inferred', 'a', 'b', 'http-request', 4), confidence: 'inferred' as const }];
    const graph = architectureScopeGraph(model(edges));
    expect(graph.edges).toHaveLength(4); expect(originalIds(graph.edges)).toEqual(['code', 'http', 'inferred', 'setting']);
    expect(architectureRelationCounts(graph.edges)).toEqual({ records: 4, sites: 4 });
    expect(graph.edges.map(architectureRelationLabel)).not.toContain('openGraph');
    expect(graph.edges.find(e => e.kind === 'deployment-config')?.provenance?.edges[0]?.details?.environment).toBe('production');
  });
  it('T04 keeps distinct unknown requests underneath an explicitly marked display group', () => {
    const source = 'fetch(urlOne); fetch(urlTwo);';
    const requests = [0, 15].map((start, i) => ({ ...node(`request-${i}`), architecture: undefined, kind: 'request' as const, path: 'main.ts', evidence: [{ ...evidence(i + 1)[0]!, start }], attributes: {} }));
    const graph = build({ 'package.json': '{"name":"web","scripts":{"dev":"vite"}}', 'main.ts': source }, requests);
    const unknown = graph.nodes.filter(n => n.architecture?.kind === 'unresolved');
    expect(unknown).toHaveLength(2); expect(new Set(unknown.map(n => n.id)).size).toBe(2);
    expect(searchSemanticNodes(unknown, 'urlOne').map(row => row.id)).toEqual([unknown[0]!.id]);
    expect(searchSemanticNodes(unknown, 'urlTwo').map(row => row.id)).toEqual([unknown[1]!.id]);
    expect(new Set([...semanticNodeDisplays(unknown).values()].map(display => display.disambiguation)).size).toBe(2);
    const root = architectureScopeGraph(graph), group = root.nodes.find(n => n.attributes.architectureRequestGroup)!;
    expect(group.attributes.requestIds).toHaveLength(2); expect(group.label).toContain('2対象');
    expect(root.architectureView!.representedNodeIds).toHaveLength(2 + 1);
    const selected = architectureScopeGraph(graph, undefined, '', false, { selectedNodeId: unknown[0]!.id });
    expect(selected.nodes.some(n => n.id === unknown[0]!.id)).toBe(true);
    expect(new Set(selected.architectureView!.representedNodeIds).size).toBe(selected.architectureView!.representedNodeIds.length);
  });
  it('T03b preserves environments and marks new density-created loops as internal summaries', () => {
    const nodes = [node('A'), node('B'), node('C')];
    const edges = [
      { ...edge('dev', 'A', 'B', 'deployment-config'), details: { environment: 'development' } },
      { ...edge('prod', 'A', 'B', 'deployment-config'), details: { environment: 'production' } },
      edge('inside', 'B', 'C', 'code-reference'),
    ];
    const graph = { view: 'architecture-map' as const, nodes, edges };
    const projected = projectAggregatedSemanticFlow(graph, nodes.map((node, x) => ({ node, x, y: 0, z: 0 })), {
      ownerById: new Map([['A', 'A'], ['B', 'group'], ['C', 'group']]), individualIds: new Set(['A']),
      aggregates: [{ id: 'group', groupId: 'group', label: '表示集合', memberIds: ['B', 'C'], x: 1, y: 0, z: 0, matchingCount: 0, mode: 'automatic' }],
    });
    expect(projected.graph.edges).toHaveLength(3);
    expect(new Set(projected.graph.edges.map(e => e.id)).size).toBe(3);
    expect(projected.graph.edges.filter(e => e.source === 'A').map(e => e.details?.environment).sort()).toEqual(['development', 'production']);
    expect(projected.graph.edges.find(e => e.source === e.target)?.details?.architectureRelation).toBe('internal');
  });
  it('T05 unifies proven same identifiers but retains configuration occurrences and environments', () => {
    const shared = { database_name: 'same', database_id: 'db-identity', binding: 'DB' };
    const graph = build({ 'wrangler.jsonc': JSON.stringify({ main: 'main.ts', name: 'worker', env: {
      development: { d1_databases: [shared] }, production: { d1_databases: [{ ...shared, binding: 'PROD_DB' }, { ...shared, database_id: 'different' }] },
    } }) });
    const resources = graph.nodes.filter(n => n.architecture?.kind === 'resource'); expect(resources).toHaveLength(2);
    const same = resources.find(n => n.architecture?.identity?.identifier === 'db-identity')!;
    expect(same.architecture?.environments.sort()).toEqual(['development', 'production']);
    expect(same.architecture?.identity?.configurations.map(c => c.binding).sort()).toEqual(['DB', 'PROD_DB']);
    expect(graph.edges.filter(e => e.target === same.id)).toHaveLength(2);
    expect(architectureScopeGraph(graph, undefined, 'development').nodes.filter(n => n.architecture?.kind === 'resource').map(n => n.id)).toEqual([same.id]);
  });
  it('T04b retains full nested process arguments and never treats constructor creation alone as a start', () => {
    const graph = build({ 'run.cs': 'var config = new ProcessStartInfo(path); Process.Start(new ProcessStartInfo(settings.Path));' });
    const requests = graph.nodes.filter(node => node.architecture?.request?.kind === 'process');
    expect(requests).toHaveLength(1);
    expect(requests[0]?.architecture?.request?.expression).toBe('new ProcessStartInfo(settings.Path)');
    expect(requests[0]?.label).toBe('外部プログラムへの起動要求');
    expect(graph.edges.filter(edge => edge.kind === 'process-start')).toHaveLength(1);
  });
  it('T05b never merges same names without identifiers or remote services with emulators', () => {
    const graph = build({ 'wrangler.jsonc': JSON.stringify({ main: 'main.ts', d1_databases: [{ database_name: 'same', binding: 'DB' }], vars: { FIREBASE_PROJECT_ID: 'same' }, env: { development: {
      d1_databases: [{ database_name: 'same', binding: 'DB' }], vars: { FIREBASE_PROJECT_ID: 'same', FIREBASE_AUTH_EMULATOR: true },
    } } }) });
    expect(graph.nodes.filter(n => n.architecture?.kind === 'resource')).toHaveLength(2);
    expect(graph.nodes.filter(n => n.architecture?.kind === 'resource').every(n => n.architecture?.identity?.status === 'unconfirmed')).toBe(true);
    expect(graph.nodes.filter(n => n.architecture?.context.includes('Firebase Auth'))).toHaveLength(2);
  });
  it('T06 separates manifest existence, declared use and source-backed sharing', () => {
    const sources = { 'unused/package.json': '{"name":"unused"}', 'declared/package.json': '{"name":"declared"}', 'used/package.json': '{"name":"used","exports":"./index.ts"}',
      'web/package.json': '{"name":"web","scripts":{"dev":"vite"},"dependencies":{"declared":"*","used":"*"}}', 'web/main.ts': 'import {value} from "used"; console.log(value);' };
    const graph = build(sources);
    expect(graph.nodes.find(n => n.label === 'unused')?.architecture).toMatchObject({ kind: 'code-package', codeUsage: { status: 'unconfirmed' } });
    expect(graph.nodes.find(n => n.label === 'declared')?.architecture).toMatchObject({ kind: 'code-package', codeUsage: { status: 'declared' } });
    expect(graph.nodes.find(n => n.label === 'used')?.architecture).toMatchObject({ kind: 'shared-code', codeUsage: { status: 'source' } });
  });
  it('T07 projects a real child-to-child boundary to the outer root without losing the actual endpoint', () => {
    const graph = architectureScopeGraph(model([edge('actual', 'a', 'b')]), 'A', '', false, { mode: '3d' });
    expect(graph.edges.map(e => [e.source, e.target])).toEqual([['a', 'B']]);
    expect(graph.edges[0]?.provenance?.edges[0]?.target).toBe('b');
    expect(graph.nodes.some(n => n.id === 'b' || n.id === 'A')).toBe(false);
  });
  it('T08 keeps a root-only connection in a boundary list without attaching an arbitrary child', () => {
    const graph = architectureScopeGraph(model([edge('boundary', 'A', 'B')]), 'A', '', false, { mode: '3d' });
    expect(graph.edges).toEqual([]);
    expect(graph.architectureView!.boundaryRelations.map(e => [e.source, e.target])).toEqual([['A', 'B']]);
    expect(graph.nodes.some(n => n.id === 'B')).toBe(true);
  });
  it('T09 and T10 show only current connections, keeping other roots collapsed without implying a continuous path', () => {
    const source = model([edge('ab', 'a', 'b'), edge('bc', 'b2', 'c')]);
    const graph = architectureScopeGraph(source, 'A', '', false, { mode: '3d' });
    expect(graph.nodes.map(n => n.id).sort()).toEqual(['B', 'C', 'a', 'a2', 'service']);
    expect(originalIds(graph.edges)).toEqual(['ab']);
    const selected = architectureScopeGraph(source, 'A', '', false, { mode: '3d', selectedNodeId: 'B' });
    expect(originalIds(selected.edges)).toEqual(['ab', 'bc']);
    expect(source.edges.map(e => e.id)).toEqual(['ab', 'bc']);
  });
  it('T12 retains selected outside objects and direct neighbors when surroundings are hidden, with stable coordinates', () => {
    const source = model([edge('ab', 'a', 'b'), edge('bc', 'b2', 'c')]);
    const on = architectureScopeGraph(source, 'A', '', false, { mode: '3d' });
    const off = architectureScopeGraph(source, 'A', '', false, { mode: '3d', surroundings: false });
    expect(off.nodes.map(n => n.id).sort()).toEqual(['B', 'a', 'a2']);
    for (const node of off.nodes) expect(off.architectureView!.positions.get(node.id)).toEqual(on.architectureView!.positions.get(node.id));
    const protectedGraph = architectureScopeGraph(source, 'A', '', false, { mode: '3d', surroundings: false, selectedNodeId: 'C' });
    expect(protectedGraph.nodes.some(n => n.id === 'C')).toBe(true);
    expect(prepareArchitectureScope(source, 'A')).toBe(prepareArchitectureScope(source, 'A'));
  });
  it('T13 honors environmental, auxiliary and kind filters in the surrounding projection', () => {
    const source = model(); source.nodes.find(n => n.id === 'B')!.architecture!.auxiliary = true;
    source.nodes.find(n => n.id === 'service')!.architecture!.environments = ['production'];
    const graph = architectureScopeGraph(source, 'A', 'development', false, { mode: '3d', allowedIds: new Set(['A', 'a', 'a2', 'B', 'b', 'service']) });
    expect(graph.nodes.map(n => n.id).sort()).toEqual(['a', 'a2']);
  });
  it('T12b keeps a selected outer request-group relation after clearing its source selection and hiding surroundings', () => {
    const source = model();
    for (const id of ['r1', 'r2']) {
      const request = node(id, undefined, 'unresolved'); request.architecture!.request = { kind: 'http', ownerId: 'B', expression: id, sourceId: id };
      source.nodes.push(request); source.edges.push(edge(id, 'b', id, 'http-request'));
    }
    const selectedNode = architectureScopeGraph(source, 'A', '', false, { mode: '3d', selectedNodeId: 'B' });
    const relation = selectedNode.edges.find(edge => edge.source === 'B')!;
    const selectedEdge = architectureScopeGraph(source, 'A', '', false, { mode: '3d', surroundings: false, selectedEdgeId: relation.id });
    expect(selectedEdge.edges.find(edge => edge.id === relation.id)?.provenance?.edges.map(edge => edge.id)).toEqual(['r1', 'r2']);
    expect(selectedEdge.nodes.some(node => node.id === relation.target)).toBe(true);
    expect(selectedEdge.nodes.some(node => node.id === 'B')).toBe(true);
  });
  it('T15 keeps shared-package declarations separate from each execution context source usage', () => {
    const graph = build({ 'package.json': JSON.stringify({ name: 'extension', engines: { vscode: '*' }, main: 'extension.ts', dependencies: { react: '*', 'react-dom': '*' }, devDependencies: { typescript: '*' } }),
      'extension.ts': 'import * as vscode from "vscode"; export function activate(){}',
      'webview/main.ts': 'import React from "react"; const api=acquireVsCodeApi();' });
    const host = graph.nodes.find(n => n.architecture?.context.includes('Extension Host'))!, webview = graph.nodes.find(n => n.architecture?.context.includes('Webview / ブラウザ'))!;
    expect(host.architecture?.technologies?.find(t => t.name === 'react')?.usage).toBe('declared');
    expect(webview.architecture?.technologies?.find(t => t.name === 'react')?.usage).toBe('source');
    expect(host.architecture?.technologies?.find(t => t.name === 'typescript')?.usage).toBe('declared');
  });
  it('T16 retains unrelated roots and leaf services without inventing children or duplicate top-level nodes', () => {
    const source = model(); const root = architectureScopeGraph(source, undefined, '', false, { mode: '3d' });
    expect(root.nodes.map(n => n.id).sort()).toEqual(['A', 'B', 'C', 'service']);
    const inside = architectureScopeGraph(source, 'A', '', false, { mode: '3d' });
    expect(inside.architectureView!.detailCount).toBe(2); expect(inside.architectureView!.contextCount).toBe(3);
    expect(source.nodes.filter(n => n.architecture?.parentId === 'service')).toEqual([]);
  });
});
