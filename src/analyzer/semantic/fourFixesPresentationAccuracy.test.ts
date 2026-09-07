// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { describe, expect, it } from 'vitest';
import { semanticNodeDisplay, semanticNodeDisplays } from '../../components/analyzer/semanticFlowDisplay';
import type { AnalyzerProjectStore } from '../types';
import { semanticFlowEdgePaths } from './flowPresentation';
import { buildUnresolvedFlowPresentation, visibleUnresolvedFlowPositions } from './flowUnresolvedPresentation';
import { projectSemanticView } from './project';
import { searchSemanticNodes } from './search';
import { buildSemanticExplorer } from './semanticExplorer';
import type { SemanticAnalysis, SemanticEdge, SemanticGraph, SemanticNode } from './types';

const node = (id: string, path = 'src/main.ts', attributes: SemanticNode['attributes'] = {}): SemanticNode => ({
  id, path, label: id, kind: 'function', confidence: 'source', group: 'Source', line: 5, endLine: 5, attributes,
  evidence: [{ path, line: 5, endLine: 5, start: 50, end: 70, description: id }],
});
const edge = (id: string, source: string, target: string, start: number, kind = 'calls'): SemanticEdge => ({
  id, source, target, label: 'Math.abs', kind, confidence: 'unresolved', views: ['function-call-flow'],
  evidence: [{ path: 'src/main.ts', start, end: start + 12, line: 5, endLine: 5, description: id }],
});
const external = (id: string, path = 'src/main.ts'): SemanticNode => ({ ...node(id, path, { callee: 'Math.abs' }), label: 'Math.abs', kind: 'external', confidence: 'unresolved' });
const sha256 = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sorted = (ids: Iterable<string>) => [...ids].sort();

describe('independent four-fix presentation accuracy', () => {
  it('conserves repeated callsites and same-name distinct targets without treating synthetic display as a source object', () => {
    const caller = node('caller'), sameA = external('scope-a'), sameB = external('scope-b', 'src/other.ts');
    const observed = { ...external('observed'), confidence: 'observed' as const };
    const collision = node('flow-display:unresolved-calls');
    const graph: SemanticGraph = { view: 'function-call-flow', nodes: [caller, sameA, sameB, observed, collision], edges: [
      edge('call-a-first', caller.id, sameA.id, 40), edge('call-a-second', caller.id, sameA.id, 80),
      edge('call-b', caller.id, sameB.id, 120), edge('callback-b', caller.id, sameB.id, 120, 'callback'),
    ] };
    const before = JSON.stringify(graph), model = buildUnresolvedFlowPresentation(graph);
    expect(model.graph).toBe(graph);
    expect(sorted(model.memberIds)).toEqual(['scope-a', 'scope-b']);
    expect(model.members.find(item => item.id === sameA.id)).toBe(sameA);
    expect(model.relationCount).toBe(4); expect(model.callSiteCount).toBe(3);
    expect(model.aggregate?.node).toMatchObject({ group: '表示上の集約', attributes: { displayAggregate: true, targetCount: 2 }, evidence: [] });
    expect(model.aggregate?.node.id).not.toBe(collision.id);
    expect(model.aggregate?.node.path).toBeUndefined();
    expect(graph.nodes).not.toContain(model.aggregate!.node);
    expect(sorted(visibleUnresolvedFlowPositions(model, new Set()).map(item => item.node.id))).toEqual(sorted([caller.id, observed.id, collision.id, model.aggregate!.node.id]));
    const expanded = visibleUnresolvedFlowPositions(model, new Set(), undefined, true);
    expect(sorted(expanded.filter(item => item !== model.aggregate).map(item => item.node.id))).toEqual(sorted(graph.nodes.map(item => item.id)));
    expect(visibleUnresolvedFlowPositions(model, new Set(), 'call-b').find(item => item.node.id === sameB.id)?.node).toBe(sameB);
    expect(visibleUnresolvedFlowPositions(model, new Set(), 'call-b').some(item => item.node.id === sameA.id)).toBe(false);
    for (const target of [sameA, sameB]) {
      expect(visibleUnresolvedFlowPositions(model, new Set([target.id])).find(item => item.node.id === target.id)?.node).toBe(target);
      expect(searchSemanticNodes(graph.nodes, 'Math.abs').some(item => item.node === target)).toBe(true);
    }
    const selected = visibleUnresolvedFlowPositions(model, new Set([caller.id]));
    for (const target of [sameA, sameB]) expect(selected.find(item => item.node.id === target.id)?.node).toBe(target);
    expect(JSON.stringify(graph)).toBe(before);
  });

  it('counts callsites within the supplied graph without inventing missing relations from a node evidence sample', () => {
    const target = external('filtered-target');
    const filtered: SemanticGraph = { view: 'function-call-flow', nodes: [target], edges: [] };
    const model = buildUnresolvedFlowPresentation(filtered);
    expect(model.members).toEqual([target]);
    expect(model.relationCount).toBe(0); expect(model.callSiteCount).toBe(0);
    expect(visibleUnresolvedFlowPositions(model, new Set([target.id])).find(item => item.node.id === target.id)?.node.evidence).toBe(target.evidence);
  });

  it('renames only semantic initializers and shortens recorded callees while retaining source distinctions and originals', () => {
    const initializer = { ...node('initializer', 'scripts/build.mjs', { initializer: true }), label: '<module>' };
    const spellingOnly = { ...node('normal'), label: '<module>' };
    const otherKind = { ...initializer, id: 'other-kind', kind: 'external' as const };
    const first = { ...external('first'), attributes: { callee: 'records.filter((item) => { return item.active; }).map' }, label: 'original long source expression A' };
    const second = { ...first, id: 'second', label: 'original long source expression B', evidence: first.evidence.map(item => ({ ...item, start: 80, end: 120 })) };
    const all = [initializer, spellingOnly, otherKind, first, second], before = JSON.stringify(all);
    const displays = semanticNodeDisplays(all);
    expect(semanticNodeDisplay(initializer).title).toBe('ファイル直下の処理');
    expect(semanticNodeDisplay(spellingOnly).title).toBe('<module>');
    expect(semanticNodeDisplay(otherKind).title).toBe('<module>');
    expect(displays.get(first.id)?.title).toBe('records.filter(...).map(...)');
    expect(displays.get(first.id)?.location).not.toBe(displays.get(second.id)?.location);
    for (const item of [first, second]) {
      expect(displays.get(item.id)?.tooltip).toContain(item.label);
      expect(displays.get(item.id)?.tooltip).toContain(item.attributes.callee);
    }
    expect(JSON.stringify(all)).toBe(before);
  });
});

const roots = (process.env.WEB_ATLAS_VALIDATION_REPOS ?? '').split(';').filter(Boolean);
const reviewEnabled = roots.length > 0 && process.env.WEB_ATLAS_FOUR_FIXES_REVIEW === '1';
describe('independent four-fix real-snapshot presentation conservation', () => {
  it.skipIf(!reviewEnabled)('retains every original object and relation across aggregate, expansion, selection, search and display formatting', async () => {
    const reports = [];
    for (const root of roots) {
      const name = basename(root), analysis = JSON.parse(await readFile(`.cache/semantic-validation/${name}-analysis.json`, 'utf8')) as SemanticAnalysis;
      const store = JSON.parse(await readFile(`.cache/semantic-validation/${name}.json`, 'utf8')) as AnalyzerProjectStore;
      for (const view of ['runtime-flow', 'function-call-flow'] as const) {
        const graph = projectSemanticView(analysis, view), before = sha256(graph);
        const canonical = new Map(graph.nodes.map(item => [item.id, item]));
        const explorer = buildSemanticExplorer(graph, new Set(store.files.map(file => file.relativePath)));
        const model = buildUnresolvedFlowPresentation(graph, explorer);
        expect(model.graph).toBe(graph);
        const overview = visibleUnresolvedFlowPositions(model, new Set());
        const expanded = visibleUnresolvedFlowPositions(model, new Set(), undefined, true);
        expect(sorted(expanded.filter(item => !item.node.attributes.displayAggregate).map(item => item.node.id))).toEqual(sorted(canonical.keys()));
        for (const item of expanded) if (!item.node.attributes.displayAggregate) expect(item.node).toBe(canonical.get(item.node.id));
        expect(sorted(model.memberIds)).toEqual(sorted(graph.nodes.filter(item => item.kind === 'external' && item.confidence === 'unresolved').map(item => item.id)));
        const unresolvedEdges = graph.edges.filter(item => model.memberIds.has(item.source) || model.memberIds.has(item.target));
        expect(model.relationCount).toBe(unresolvedEdges.length);
        expect(model.callSiteCount).toBe(new Set(unresolvedEdges.filter(item => item.kind === 'calls').flatMap(item => item.evidence.map(evidence => JSON.stringify([evidence.path, evidence.start, evidence.end])))).size);
        // Each external object has an original source identity and a reachable expanded point;
        // no display location is treated as its missing definition.
        for (const item of model.members) expect(explorer.owners.get(item.id)).toMatchObject({ filePath: undefined, definitionAvailable: false });
        const sampleIds = new Set(model.members.filter((_, index) => index % Math.max(1, Math.floor(model.members.length / 24)) === 0).map(item => item.id));
        const circular = graph.nodes.find(item => item.label === 'circularDistance' && item.kind === 'function');
        if (circular) sampleIds.add(circular.id);
        for (const selected of sampleIds) {
          const visible = visibleUnresolvedFlowPositions(model, new Set([selected]));
          const visibleIds = new Set(visible.map(item => item.node.id));
          expect(visibleIds.has(selected)).toBe(true);
          const incidents = graph.edges.filter(item => item.source === selected || item.target === selected);
          const paths = semanticFlowEdgePaths(graph, visible, new Set([selected]), undefined, '3d', true);
          for (const relation of incidents) {
            expect(visibleIds.has(relation.source)).toBe(true); expect(visibleIds.has(relation.target)).toBe(true);
            expect(paths.find(path => path.edge.id === relation.id)?.edge).toBe(relation);
          }
          const source = canonical.get(selected)!;
          expect(searchSemanticNodes(graph.nodes, source.label).some(item => item.id === selected)).toBe(true);
        }
        const displays = semanticNodeDisplays(graph.nodes);
        expect(new Set([...displays.values()].map(display => JSON.stringify([display.title, display.location]))).size).toBe(graph.nodes.length);
        for (const item of graph.nodes) {
          if (item.kind === 'function' && item.attributes.initializer === true) expect(displays.get(item.id)?.title).toBe('ファイル直下の処理');
          if (typeof item.attributes.callee === 'string' && (item.kind === 'external' || item.kind === 'operation')) {
            const display = displays.get(item.id)!;
            expect(display.title.length).toBeLessThanOrEqual(64);
            expect(display.tooltip).toContain(item.label);
            if (item.attributes.callee !== item.label) expect(display.tooltip).toContain(item.attributes.callee);
          }
        }
        const after = sha256(graph); expect(after).toBe(before);
        reports.push({ name, view, canonicalNodes: graph.nodes.length, canonicalEdges: graph.edges.length, canonicalSha256: before,
          overviewPoints: overview.length, expandedPoints: expanded.length, syntheticPoints: model.aggregate ? 1 : 0, unresolvedTargets: model.memberIds.size,
          unresolvedRelations: model.relationCount, unresolvedCallsites: model.callSiteCount, directSelectionSamples: sampleIds.size, unchangedAfterAllOperations: after === before });
      }
    }
    await mkdir('.cache/tabs-6-7-four-fixes/accuracy', { recursive: true });
    await writeFile('.cache/tabs-6-7-four-fixes/accuracy/presentation-report.json', JSON.stringify(reports, null, 2));
    console.info('[four-fix presentation accuracy]', JSON.stringify(reports));
  }, 120000);
});
