// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { analyzeSemanticSources } from './analyze';
import { initializeTestParser, testLanguage, testParser } from './testRuntime';
import { projectSemanticView } from './project';
beforeAll(initializeTestParser);
const analyze = (sources: Record<string, string>) => analyzeSemanticSources({ sources, imports: [], resources: [] }, testLanguage, undefined, testParser);

describe('data-specific refinement invariants', () => {
  it('preserves Runtime field presentation while Data Model reads refined column structure', async () => {
    const result = await analyze({ 'schema.sql': "CREATE TABLE customers (id TEXT NOT NULL, memo TEXT DEFAULT 'draft');", 'app.ts': 'function read() { return database.select().from(customers); }' });
    const runtimeModel = projectSemanticView(result, 'runtime-flow').nodes.find(node => node.kind === 'model' && node.label === 'customers')!;
    const dataModel = projectSemanticView(result, 'data-model').nodes.find(node => node.id === runtimeModel.id)!;
    expect(runtimeModel.fields?.map(field => field.type)).toEqual(['TEXT NOT NULL', "TEXT DEFAULT 'draft'"]);
    expect(dataModel.fields?.map(field => field.type)).toEqual(['TEXT', 'TEXT']);
    expect(dataModel.fields?.find(field => field.name === 'memo')).toMatchObject({ default: "'draft'", defaultSource: 'database' });
    expect(runtimeModel.fields).toEqual(result.flowFieldsByNode?.[runtimeModel.id]);
    expect(dataModel.fields).not.toBe(runtimeModel.fields);
    expect(result.nodes.find(node => node.id === runtimeModel.id)?.fields).toEqual(dataModel.fields);
  });
  it('resolves an explicit property write followed by read, but does not attach a different object with the same field name', async () => {
    const result = await analyze({ 'fields.ts': 'function fields(a: { price: number }, b: { price: number }, c: { price: number }) { b.price = a.price; const read = b.price; const other = c.price; return read; }' });
    const write = result.nodes.find(node => node.data?.role === 'property-write')!;
    const reads = result.nodes.filter(node => node.data?.role === 'property-read');
    const same = reads.find(node => node.data?.expression === 'b.price')!, different = reads.find(node => node.data?.expression === 'c.price')!;
    expect(result.edges.some(edge => edge.source === write.id && edge.target === same.id && edge.kind === 'origin')).toBe(true);
    expect(result.edges.some(edge => edge.source === write.id && edge.target === different.id)).toBe(false);
    expect(same.data?.objectId).toBe(write.data?.objectId); expect(different.data?.objectId).not.toBe(write.data?.objectId);
  });
  it('keeps an array construction between its elements and the actual argument slot', async () => {
    const result = await analyze({ 'array.ts': 'function f(graph: string) { useMemo(() => graph, [graph]); return [graph.slice(1)].filter(Boolean).join(","); }' });
    const graph = projectSemanticView(result, 'data-flow');
    const second = graph.nodes.find(node => node.data?.role === 'argument' && node.data.argumentIndex === 1 && node.data.expression === '[graph]')!;
    const incoming = graph.edges.filter(edge => edge.target === second.id && edge.kind === 'argument');
    expect(incoming).toHaveLength(1); expect(graph.nodes.find(node => node.id === incoming[0]!.source)?.label).toBe('配列を作る');
    const filter = graph.nodes.find(node => node.data?.role === 'operation' && String(node.attributes.callee).endsWith('.filter'))!;
    expect(graph.edges.some(edge => edge.target === filter.id && graph.nodes.find(node => node.id === edge.source)?.data?.expression === '[graph.slice(1)]')).toBe(true);
  });
  it('keeps namespace/default import shadows out of validation schemas', async () => {
    const result = await analyze({ 'namespace.ts': "import * as z from 'zod'; function f(z: any) { const Fake = z.object({ n: z.number() }); } const Real = z.object({ id: z.string() });", 'default.ts': "import z from 'zod'; function f(z: any) { const Fake = z.object({ n: z.number() }); }" });
    const models = projectSemanticView(result, 'data-model').nodes;
    expect(models.some(node => node.label === 'Fake')).toBe(false); expect(models.some(node => node.label === 'Real' && node.model?.domain === 'validation')).toBe(true);
  });
  it('distinguishes genuinely empty structures, failed definitions and circular aliases', async () => {
    const result = await analyze({ 'empty.ts': 'interface Empty {}', 'bad.ts': 'interface Bad { value: ;', 'cycle.ts': 'type A = B; type B = A;' });
    expect(result.nodes.find(node => node.label === 'Empty')?.model?.expansion).toBe('expanded');
    expect(result.nodes.find(node => node.label === 'Bad')?.model?.expansion).toBe('failed');
    expect(result.nodes.filter(node => node.path === 'cycle.ts' && node.kind === 'model').every(node => node.model?.expansion === 'unexpanded' && node.model.reasons.length)).toBe(true);
  });
  it('keeps default-parameter input only for a call that omitted the argument', async () => {
    const result = await analyze({ 'default.ts': 'function f(value = "fallback") { return value; } const first = f(); const second = f("supplied");' });
    const calls = result.nodes.filter(node => node.data?.role === 'operation' && node.attributes.callee === 'f');
    const defaults = result.edges.filter(edge => edge.kind === 'parameter-default' && edge.details?.contextId);
    expect(defaults.some(edge => edge.details?.contextId === calls.find(node => node.data?.expression === 'f()')?.id)).toBe(true);
    expect(defaults.some(edge => edge.details?.contextId === calls.find(node => node.data?.expression === 'f("supplied")')?.id)).toBe(false);
  });
  it('retains both shared-field definition and spread incorporation evidence and discloses ALTER-only migration scope', async () => {
    const code = "import {sqliteTable,text} from 'drizzle-orm/sqlite-core'; const common = { createdAt: text('created_at') }; const Table = sqliteTable('table', {...common});";
    const result = await analyze({ 'schema.ts': code, 'migration.sql': 'ALTER TABLE table ADD COLUMN extra TEXT;' });
    const field = result.nodes.find(node => node.label === 'Table' && node.kind === 'model')!.fields![0]!;
    expect(field.evidence?.map(ev => code.slice(ev.start, ev.end))).toEqual(expect.arrayContaining(["createdAt: text('created_at')", '...common'])); expect(field.origin).toContain('common');
    expect(result.coverage.find(item => item.path === 'migration.sql')).toMatchObject({ status: 'partial', message: expect.stringContaining('ALTER TABLE') });
  });
  it('makes same-line model use links distinguishable before selection', async () => {
    const result = await analyze({ 'links.ts': 'interface Interval { start: number; end: number } function normalize(value: Interval) { return { start: value.start, end: value.end }; }' });
    const links = result.nodes.find(node => node.label === 'Interval' && node.kind === 'model')!.links!.filter(link => !link.fieldId);
    expect(new Set(links.map(link => link.reason)).size).toBe(links.length);
    expect(links.every(link => /links\.ts:1:\d+/.test(link.reason))).toBe(true);
  });
});
