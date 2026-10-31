// @vitest-environment node
import { expect, it } from 'vitest';
import { createDataCompiler } from './dataCompiler';
import { refineDataFlow } from './dataFlow';
import type { SemanticAnalysis, SemanticNode } from './types';
function analyze(source: string) {
  const analysis: SemanticAnalysis = { nodes: [], edges: [], coverage: [], warnings: [], stats: { files: 1, functions: 1, models: 0, unresolved: 0, elapsedMs: 0 } };
  refineDataFlow(analysis, createDataCompiler({ sources: { 'input.ts': source }, imports: [], resources: [] }), { declarations: new Map(), symbols: new Map() });
  return analysis;
}
const origins = (analysis: SemanticAnalysis, target: SemanticNode) => analysis.edges.filter(e => e.kind === 'origin' && e.target === target.id).map(e => analysis.nodes.find(n => n.id === e.source)!.data!.expression);
it.each(['&&', '||', '??', '&&=', '||=', '??='])('preserves skipped and evaluated states for %s', operator => {
  const expression = operator.endsWith('=') ? `x ${operator} 1` : `flag ${operator} (x = 1)`;
  const analysis = analyze(`function f(flag: unknown) { let x = 0; ${expression}; return x; }`);
  const use = analysis.nodes.find(n => n.data?.role === 'use' && n.label === 'x' && n.evidence[0]!.start > analysis.nodes.find(n => n.data?.role === 'assignment')!.evidence[0]!.start)!;
  expect(origins(analysis, use)).toEqual(expect.arrayContaining(['x = 0', operator.endsWith('=') ? expression : 'x = 1']));
  expect(analysis.nodes.find(n => n.data?.role === 'assignment')!.data?.conditional).toBe(true);
  expect(analysis.edges.filter(e => e.kind === 'origin' && e.target === use.id).every(e => e.confidence === 'inferred')).toBe(true);
});
it('retains both ternary assignments and the expression result without evaluating one branch after the other', () => {
  const analysis = analyze('function f(flag: boolean) { let x = 0; const y = flag ? (x = 1) : (x = 2); return x + y; }');
  const use = analysis.nodes.filter(n => n.data?.role === 'use' && n.label === 'x').at(-1)!;
  expect(origins(analysis, use).sort()).toEqual(['x = 1', 'x = 2']);
  expect(analysis.nodes.filter(n => n.data?.role === 'assignment').every(n => n.data?.conditional)).toBe(true);
});
it('does not leak a property write into the opposite branch; joins both writes after the if', () => {
  const analysis = analyze('function f(flag: boolean, obj: {x: number}) { if (flag) { obj.x = 1; } else { consume(obj.x); obj.x = 2; } return obj.x; }');
  const reads = analysis.nodes.filter(n => n.data?.role === 'property-read' && n.data.expression === 'obj.x');
  expect(origins(analysis, reads[0]!)).toEqual([]);
  expect(origins(analysis, reads[1]!)).toHaveLength(2);
  const writeIds = analysis.nodes.filter(n => n.data?.role === 'property-write').map(n => n.id);
  expect(analysis.edges.filter(e => e.kind === 'origin' && e.target === reads[1]!.id).map(e => e.source).sort()).toEqual(writeIds.sort());
});
it('isolates property writes in nested ternaries and short-circuit expressions', () => {
  const analysis = analyze('function f(a: boolean, b: boolean, obj: {x: number}) { a ? (b && (obj.x = 1)) : consume(obj.x); return obj.x; }');
  const reads = analysis.nodes.filter(n => n.data?.role === 'property-read');
  expect(origins(analysis, reads[0]!)).toEqual([]); expect(origins(analysis, reads[1]!)).toHaveLength(1);
});
it('retains unique edges on a large straight-line function', () => {
  const analysis = analyze(`function f() { ${Array.from({length: 2000}, (_, i) => `const v${i} = ${i ? `v${i-1} + 1` : '0'};`).join('')} return v1999; }`);
  expect(analysis.edges.length).toBeGreaterThan(7000); expect(new Set(analysis.edges.map(e => e.id)).size).toBe(analysis.edges.length);
});

it('drops overwritten property origins only on paths that execute the write', () => {
  const analysis = analyze('function f(flag: boolean, obj: {x: number}) { obj.x = 0; if (flag) { obj.x = 1; consume(obj.x); } else { obj.x = 2; } return obj.x; }');
  const writes = analysis.nodes.filter(n => n.data?.role === 'property-write'), reads = analysis.nodes.filter(n => n.data?.role === 'property-read');
  expect(analysis.edges.filter(e => e.kind === 'origin' && e.target === reads[0]!.id).map(e => e.source)).toEqual([writes[1]!.id]);
  expect(analysis.edges.filter(e => e.kind === 'origin' && e.target === reads[1]!.id).map(e => e.source).sort()).toEqual([writes[1]!.id, writes[2]!.id].sort());
});

it.each(['x++','++x','x--','--x'])('links the updated value after %s', expression => {
  const analysis = analyze(`function f() { let x = 0; ${expression}; return x; }`);
  const assignment = analysis.nodes.find(n => n.data?.role === 'assignment' && n.data.expression === expression)!;
  expect(assignment).toBeDefined();
  const use = analysis.nodes.filter(n => n.data?.role === 'use' && n.label === 'x').at(-1)!;
  expect(analysis.edges.filter(e => e.kind === 'origin' && e.target === use.id).map(e => e.source)).toEqual([assignment.id]);
  expect(analysis.edges.some(e => e.kind === 'assign' && e.target === assignment.id)).toBe(true);
});
it.each(['x++','++x','x--','--x'])('distinguishes the expression result from the later value for %s', expression => {
  const analysis = analyze(`function f() { let x = 0; const y = ${expression}; return x + y; }`);
  const y = analysis.nodes.find(n => n.data?.role === 'declaration' && n.label === 'y')!;
  const incoming = analysis.edges.find(e => e.kind === 'assign' && e.target === y.id)!;
  const result = analysis.nodes.find(n => n.id === incoming.source)!;
  expect(result.data?.role).toBe(expression.startsWith('x') ? 'use' : 'assignment');
});
it('updates a property using one receiver evaluation and preserves conditional alternatives', () => {
  const analysis = analyze('function f(flag: boolean, obj: {count:number}) { obj.count = 0; if (flag) obj.count++; return obj.count; } function g() { getObject().count++; }');
  const read = analysis.nodes.filter(n => n.data?.role === 'property-read' && n.data.expression === 'obj.count').at(-1)!;
  expect(origins(analysis, read)).toHaveLength(2);
  const operations = analysis.nodes.filter(n => n.data?.role === 'operation' && n.data.expression === 'getObject()');
  expect(operations).toHaveLength(1);
  const calls = analysis.nodes.filter(n => n.data?.role === 'call-result' && n.data.expression === 'getObject()');
  expect(calls).toHaveLength(1);
});
