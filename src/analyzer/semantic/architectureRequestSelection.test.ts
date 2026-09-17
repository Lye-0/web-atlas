// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { architectureScopeGraph } from './architectureProjection';
import { architectureContentRange } from './architectureContent';
import type { SemanticGraph, SemanticNode } from './types';
import { architectureProviderExplanation, architectureRequestPartition, architectureRequestTitle } from '../../components/analyzer/architectureRequestPresentation';
import { semanticNodeDisplay } from '../../components/analyzer/semanticFlowDisplay';

const request = (i: number, ownerId = 'owner', environments: string[] = []): SemanticNode => ({ id: `r${i}`, label: '未特定', kind: 'external', group: 'project', confidence: 'unresolved', evidence: [], attributes: {}, architecture: {
  kind: 'unresolved', files: [], memberIds: [], roles: [], entryPaths: [], context: [], environments, technologyNames: [], auxiliary: false,
  request: { ownerId, kind: 'http', expression: 'url', sourceId: `source${i}` },
} });
const fixture = (count: number): SemanticGraph => ({ view: 'architecture-map', nodes: Array.from({ length: count }, (_, i) => request(i)), edges: [] });
const graph = (model: SemanticGraph, selectedNodeId?: string, expandedRequestGroupIds?: string[]) => architectureScopeGraph(model, undefined, '', false, { selectedNodeId, expandedRequestGroupIds });

describe('request display partition and stable identity', () => {
  it('keeps every request searchable and partition counts stable inside a runtime content slice',()=>{
    const model=fixture(24),owner={...request(99),id:'owner',architecture:{...request(99).architecture!,kind:'application' as const,request:undefined}};
    model.nodes.push(owner);model.edges=model.nodes.filter(n=>n.id!=='owner').map(n=>({id:`edge-${n.id}`,source:'owner',target:n.id,kind:'http-request',label:'request',confidence:'unresolved' as const,evidence:[],views:['architecture-map']}));
    const slice=architectureContentRange(model,'path:runtime')!.graph,base=graph(slice),group=base.architectureView!.requestGroups[0]!;
    expect(slice.nodes.filter(n=>n.architecture?.request)).toHaveLength(24);
    expect(group.memberIds).toHaveLength(24);
    const selected=graph(slice,'r0'),partition=architectureRequestPartition(group.memberIds,selected);
    expect(partition.individualIds).toEqual(['r0']);expect(partition.groupedIds).toHaveLength(23);
    const expanded=graph(slice,group.id,[group.id]);expect(expanded.nodes.filter(n=>n.architecture?.request)).toHaveLength(24);
    expect(graph(slice)).toBe(base);expect(slice.nodes.every(n=>model.nodes.includes(n))).toBe(true);
  });
  it.each([0, 1, 2, 24])('preserves all %i original IDs through selection, replacement, expansion and return', count => {
    const model = fixture(count), original = JSON.stringify(model), base = graph(model), group = base.architectureView!.requestGroups[0];
    if (count < 2) { expect(group).toBeUndefined(); expect(base.nodes).toHaveLength(count); return; }
    for (const selectedId of ['r0', 'r1', group!.id, undefined, 'r0']) {
      const selected = graph(model, selectedId), partition = architectureRequestPartition(group!.memberIds, selected);
      expect(partition.originalIds).toHaveLength(count);
      expect(new Set([...partition.groupedIds, ...partition.individualIds]).size).toBe(count);
      expect(partition.groupedIds.some(id => partition.individualIds.includes(id))).toBe(false);
      expect(partition.individualIds).toEqual(selectedId?.startsWith('r') ? [selectedId] : []);
      for (const node of selected.nodes) expect(selected.architectureView!.positions2d!.get(node.id)).toEqual(base.architectureView!.positions2d!.get(node.id));
      const shownGroup = selected.nodes.find(node => node.id === group!.id);
      expect(shownGroup?.attributes.requestCount).toBe(count - partition.individualIds.length);
    }
    const expanded = graph(model, group!.id, [group!.id]);
    expect(expanded.nodes.map(n => n.id)).toEqual(model.nodes.map(n => n.id));
    expect(expanded.nodes.some(n => n.attributes.architectureRequestGroup)).toBe(false);
    expect(expanded.architectureView!.requestGroups[0]).toEqual(group);
    expect(graph(model, undefined, [group!.id]).nodes).toEqual(expanded.nodes);
    for (const n of expanded.nodes) expect(expanded.architectureView!.positions2d!.get(n.id)).toEqual(base.architectureView!.positions2d!.get(n.id));
    expect(graph(model)).toBe(base);
    expect(JSON.stringify(model)).toBe(original);
  });
  it('keeps owner and environment partitions separate', () => {
    const model = fixture(2); model.nodes.push(request(2, 'other'), request(3, 'other'), request(4, 'owner', ['local']), request(5, 'owner', ['local']));
    const groups = graph(model).architectureView!.requestGroups;
    expect(groups.map(group => group.memberIds)).toEqual([['r0', 'r1'], ['r2', 'r3'], ['r4', 'r5']]);
  });
  it('presents recorded expressions without evaluating URLs or changing IDs', () => {
    const node = request(0), original = JSON.stringify(node);
    expect(architectureRequestTitle(node)).toBe('HTTP要求：url');
    expect(semanticNodeDisplay(node).dataRole).toBe('接続先未特定');
    expect(JSON.stringify(node)).toBe(original);
    node.architecture!.request!.expression = 'https://a.test/path?token=private';
    expect(architectureRequestTitle(node)).not.toContain('private');
  });
  it('keeps scope role and service kind independent and explains metadata rather than names', () => {
    const node = request(0); node.architecture!.request = undefined; node.architecture!.kind = 'external-service'; node.attributes.architectureScopeRole = 'inside';
    node.label = 'Firebase Local Emulator Suite · 接続設定';
    expect(architectureProviderExplanation(node)).toBeUndefined();
    node.attributes.provider = 'firebase-emulator-suite';
    node.architecture!.identity = { type: 'firebase-emulator-suite', status: 'unconfirmed', reason: 'occurrence', configurations: [{ id: 'config', path: 'client.ts', environment: 'local', evidence: [] }] };
    expect(architectureProviderExplanation(node)).toContain('サービス参照');
    expect(architectureProviderExplanation(node)).toContain('同一性は未確認');
    expect(semanticNodeDisplay(node).dataRole).toBe('内部 · 種類：外部サービス');
    node.architecture!.identity.configurations[0]!.path = 'firebase.json';
    expect(architectureProviderExplanation(node)).toContain('emulators宣言');
  });
});
