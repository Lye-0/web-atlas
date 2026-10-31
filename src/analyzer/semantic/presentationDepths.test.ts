// @vitest-environment node
import { expect, it } from 'vitest';
import { semanticDepths } from './presentation';
import type { SemanticGraph, SemanticEdge, SemanticNode } from './types';
const node = (id: string): SemanticNode => ({ id, kind: 'function', label: id, group: 'test', confidence: 'source', attributes: {}, evidence: [] });
const edge = (source: string, target: string): SemanticEdge => ({ id: `${source}-${target}`, source, target, kind: 'calls', label: 'calls', confidence: 'source', evidence: [], views: ['architecture-map'] });
it('assigns depths to a 50000-node chain without recursive stack growth', () => {
  const nodes = Array.from({ length: 50000 }, (_, i) => node(String(i))), edges = nodes.slice(1).map((n, i) => edge(String(i), n.id));
  const depths = semanticDepths({ view: 'architecture-map', nodes, edges });
  expect(depths.size).toBe(50000); expect(depths.get('0')).toBe(0); expect(depths.get('49999')).toBe(49999);
});
it('retains cycles, diamonds, self-links, disconnected nodes and longest-path depth', () => {
  const graph: SemanticGraph = { view: 'architecture-map', nodes: ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(node), edges: [['a','b'],['b','c'],['c','b'],['a','d'],['d','e'],['c','e'],['e','f'],['g','g'],['missing','a']].map(([a,b]) => edge(a!,b!)) };
  expect(Object.fromEntries(semanticDepths(graph))).toEqual({ a: 0, b: 1, c: 1, d: 1, e: 2, f: 3, g: 0 });
});
