// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { analyzeSemanticSources } from './analyze';
import { projectSemanticView } from './project';
import { scanProjectFiles } from '../scan';
import { semanticInput } from './client';
import { initializeTestParser, testLanguage, testParser } from './testRuntime';
import { tabs89IndependentSources as sources, tabs89IndependentImports as imports, tabs89IndependentExpected as expected } from './tabs89IndependentFixtures';
import type { SemanticAnalysis, SemanticNode } from './types';

// Safe fixture gate is self-contained; actual repository/cache checks are separately opt-in.
let result: SemanticAnalysis;
beforeAll(async () => {
  await initializeTestParser(); result = await analyzeSemanticSources({ sources, imports, resources: [] }, testLanguage, undefined, testParser);
  if (process.env.WEB_ATLAS_TABS89_ACCURACY === '1') await writeFile('.cache/tabs-8-9-refactor-20260908/accuracy/fixture-analysis.json', JSON.stringify(result));
});
const model = (label: string, path = 'models.ts') => {
  const node = result.nodes.find(n => n.kind === 'model' && n.label === label && n.path === path);
  expect(node, `${path}:${label}`).toBeDefined(); return node!;
};
const field = (node: SemanticNode, name: string) => { const found = node.fields?.find(f => f.name === name); expect(found, `${node.label}.${name}`).toBeDefined(); return found!; };
function at(anchor: string, role?: string, path = 'flow.ts') {
  const start = sources[path]!.indexOf(anchor); expect(start, anchor).toBeGreaterThanOrEqual(0);
  const line = sources[path]!.slice(0, start).split('\n').length;
  return result.nodes.filter(n => n.path === path && (!role || n.data?.role === role) && n.evidence.some(e => e.path === path && e.line <= line && e.endLine >= line));
}
function value(anchor: string, name: string, role = 'declaration', path = 'flow.ts') {
  const found = at(anchor, role, path).find(n => n.label === name || n.data?.expression === name);
  expect(found, `${anchor}: ${name} ${role ?? ''}`).toBeDefined(); return found!;
}
function hasPath(source: SemanticNode, target: SemanticNode) {
  const seen = new Set([source.id]), queue = [source.id];
  for (let i = 0; i < queue.length; i++) for (const e of result.edges) if (e.views.includes('data-flow') && e.source === queue[i] && !seen.has(e.target)) { seen.add(e.target); queue.push(e.target); }
  return seen.has(target.id);
}
const connected = (a: SemanticNode, b: SemanticNode) => expect(hasPath(a, b), `${a.label} → ${b.label}`).toBe(true);
const noPath = (a: SemanticNode, b: SemanticNode) => expect(hasPath(a, b), `forbidden ${a.label} → ${b.label}`).toBe(false);
const dataEdges = () => result.edges.filter(e => e.views.includes('data-flow'));

describe('independent reviewer source-first Data Flow minimum', () => {
  it('DF-01 direct copy and source direction', () => {
    const a = value('const a = input;', 'a'), b = value('const b = a;', 'b');
    connected(a, b); noPath(b, a);
    expect(dataEdges().some(e => e.kind === 'assign' && e.target === b.id), expected['DF-01']).toBe(true);
  });
  it('DF-02 expression operation between original and result', () => {
    const a = value('const a = input;', 'a'), c = value('const c = a + 1;', 'c');
    const op = at('const c = a + 1;', 'operation').find(n => n.data?.expression === 'a + 1');
    expect(op, expected['DF-02']).toBeDefined(); connected(a, op!); connected(op!, c);
    expect(dataEdges().some(e => e.source === a.id && e.target === c.id && e.kind === 'assign')).toBe(false);
  });
  it('DF-03 property read and write retain different objects', () => {
    const read = at('out.price = input.price;', 'property-read').find(n => n.data?.expression === 'input.price');
    const write = at('out.price = input.price;', 'property-write').find(n => n.data?.expression === 'out.price');
    expect(read).toBeDefined(); expect(write).toBeDefined(); connected(read!, write!);
    expect(read!.data?.objectId).toBeTruthy(); expect(write!.data?.objectId).toBeTruthy();
    expect(read!.data?.objectId).not.toBe(write!.data?.objectId);
    expect(read!.data?.propertyPath).toEqual(['price']); expect(write!.data?.propertyPath).toEqual(['price']);
  });
  it('DF-04 same names preserve lexical declaration identity', () => {
    const same = result.nodes.filter(n => n.data?.role === 'declaration' && n.label === 'same');
    expect(same.length, expected['DF-04']).toBeGreaterThanOrEqual(3);
    const canonical = same.filter(n => !n.data?.contextId); expect(new Set(canonical.map(n => n.id)).size).toBe(3);
    for (const a of canonical) for (const b of canonical) if (a !== b) noPath(a, b);
  });
  it('DF-05 reassignment must not flow backwards', () => {
    const before = value('const before = x;', 'before'), after = value('const after = x;', 'after');
    const initial = value('let x = 1;', 'x'), update = value('x = 2;', 'x', 'assignment');
    connected(initial, before); connected(update, after); noPath(update, before); noPath(initial, after);
  });
  it('DF-06 conditional versions retain possible origins', () => {
    const maybe = value('const maybe = x;', 'maybe'), update = value('x = 2;', 'x', 'assignment'), conditional = value('if (condition) x = 3;', 'x', 'assignment');
    connected(update, maybe); connected(conditional, maybe);
    expect(conditional.data?.conditional, expected['DF-06']).toBe(true);
    // The uncertainty belongs to reaching-definition → use; use → initializer can itself be a confirmed copy.
    for (const origin of [update, conditional]) expect(dataEdges().filter(e => e.source === origin.id).some(e => {
      const target = result.nodes.find(n => n.id === e.target)!;
      return (e.confidence === 'inferred' || e.details?.conditional) && hasPath(target, maybe);
    })).toBe(true);
  });
  it('DF-07 resolvable call maps argument, contextual parameter, return and result', () => {
    const left = value('const left = identity(first);', 'left');
    const arg = at('const left = identity(first);', 'argument').find(n => n.data?.argumentIndex === 0);
    expect(arg, expected['DF-07']).toBeDefined(); expect(arg!.data?.callSiteId).toBeTruthy();
    const parameters = result.nodes.filter(n => n.data?.role === 'parameter' && n.data?.callSiteId === arg!.data?.callSiteId);
    expect(parameters.length).toBeGreaterThan(0); expect(parameters.some(p => hasPath(arg!, p) && hasPath(p, left))).toBe(true);
    expect(dataEdges().some(e => e.kind === 'returns' && e.details?.callSiteId === arg!.data?.callSiteId)).toBe(true);
  });
  it('DF-08 repeated call contexts cannot exchange actual inputs', () => {
    const left = value('const left = identity(first);', 'left'), right = value('const right = identity(second);', 'right');
    const first = at('const left = identity(first);', 'argument').find(n => n.data?.argumentIndex === 0)!, second = at('const right = identity(second);', 'argument').find(n => n.data?.argumentIndex === 0)!;
    expect(first).toBeDefined(); expect(second).toBeDefined(); expect(first.data?.callSiteId).not.toBe(second.data?.callSiteId);
    connected(first, left); connected(second, right); noPath(first, right); noPath(second, left);
  });
  it('DF-09 bare return is not a value propagation endpoint', () => {
    const termination = at('if (!selected) return;', 'termination'); expect(termination.length, expected['DF-09']).toBe(1);
    expect(dataEdges().filter(e => e.target === termination[0]!.id)).toHaveLength(0);
    const returned = at('return selected;', 'return'); expect(returned.length).toBeGreaterThan(0);
    expect(returned.some(n => dataEdges().some(e => e.target === n.id))).toBe(true);
  });
  it('DF-10 chained call result feeds next receiver', () => {
    const edges = dataEdges().filter(e => e.kind === 'receiver-result' && e.evidence.some(e => e.path === 'flow.ts' && sources['flow.ts']!.slice(e.start, e.end).includes('items.slice')));
    expect(edges.length, expected['DF-10']).toBeGreaterThanOrEqual(2);
    for (const edge of edges) expect(result.nodes.find(n => n.id === edge.source)?.data?.role).toBe('call-result');
  });
  it('DF-11 passing callback does not assert its execution', () => {
    const args = at('external(cb);', 'argument'); expect(args.some(n => n.data?.expression === 'cb')).toBe(true);
    const cb = args.find(n => n.data?.expression === 'cb')!;
    expect(dataEdges().filter(e => e.source === cb.id).every(e => !['invokes-callback', 'observed-call'].includes(e.kind))).toBe(true);
    expect(at('external(cb);').filter(n => n.confidence === 'observed')).toHaveLength(0);
  });
  it('DF-12 unsupported dynamic boundary is explicit', () => {
    const unknown = at('const unknown = external(input[key]);').filter(n => n.data?.resolution === 'unresolved' || n.data?.resolution === 'partial');
    expect(unknown.some(n => n.data?.reasons?.length), expected['DF-12']).toBe(true);
    expect(at('const unknown = external(input[key]);', 'property-read').some(n => n.data?.propertyPath?.includes('key') && n.data?.resolution === 'resolved')).toBe(false);
  });
  it('DF-FIX numeric literal indexes are explicit fields; shorthand uses resolve', () => {
    const reads = at('export function indexed', 'property-read');
    expect(reads.filter(n => n.data?.resolution === 'resolved').map(n => n.data?.propertyPath)).toEqual([['0'], ['1']]);
    const unknown = at('export function indexed', 'unknown'); expect(unknown.some(n => ['first', 'second'].includes(n.label))).toBe(false);
    expect(at('return { left, right };', 'unknown').some(n => ['left', 'right'].includes(n.label))).toBe(false);
  });
});

describe('independent reviewer source-first Data Model minimum', () => {
  it('DM-01 optional/null/undefined/readonly are separate', () => {
    const a = model('A'); expect(a.fields).toHaveLength(5);
    expect(field(a, 'note')).toMatchObject({ optional: true, nullable: false });
    expect(field(a, 'value')).toMatchObject({ optional: false, nullable: true });
    expect(field(a, 'n')).toMatchObject({ readonly: true });
    expect(field(a, 'explicitUndefined')).toMatchObject({ optional: false, nullable: false, allowsUndefined: true });
    for (const f of a.fields!) expect(f.evidence?.length).toBeGreaterThan(0);
  });
  it('DM-02 nested array and import field references preserve reasons', () => {
    const nested = model('Nested'), a = model('A'), remote = model('Remote', 'peer.ts');
    expect(field(nested, 'records')).toMatchObject({ type: 'A[]', array: true });
    expect(field(nested, 'remote').referenceIds).toContain(remote.id);
    expect(field(nested, 'records').referenceIds).toContain(a.id);
    expect(nested.fields?.map(f => f.name)).toEqual(['records', 'remote', 'child']);
    expect(result.edges.some(e => e.source === nested.id && e.target === remote.id && e.kind === 'field-type' && e.details?.reason?.includes('remote'))).toBe(true);
  });
  it('DM-03 literal choices', () => {
    const choice = model('Choice'); expect(choice.model?.kind).toBe('literal-union');
    expect(choice.model?.choices?.map(c => c.label.replace(/^['"]|['"]$/g, ''))).toEqual(['a', 'b', 'c']);
  });
  it('DM-04 object variants never become unconditional combined fields', () => {
    const candidate = model('Candidate'); expect(candidate.model?.kind).toBe('union'); expect(candidate.model?.choices).toHaveLength(2);
    expect(candidate.fields?.map(f => f.name) ?? []).not.toEqual(expect.arrayContaining(['first', 'second']));
    expect(candidate.model?.choices?.map(c => c.fields?.map(f => f.name))).toEqual([['kind', 'first'], ['kind', 'second']]);
  });
  it('DM-05 constructor property and method visibility', () => {
    const discovery = model('Discovery'); expect(discovery.model?.kind).toBe('class');
    expect(field(discovery, 'runner')).toMatchObject({ type: 'Runner', access: 'private', readonly: true });
    expect(field(discovery, 'count').access).toBe('public');
    expect(discovery.model?.methods?.some(m => m.name === 'reset' && m.signature.includes('protected'))).toBe(true);
  });
  it('DM-06 extends and simple alias resolve with expansion evidence', () => {
    const a = model('A'), ext = model('Extended'), alias = model('Alias');
    expect(result.edges.some(e => e.source === ext.id && e.target === a.id && e.kind === 'extends')).toBe(true);
    expect(alias.model?.expansion).toBe('expanded'); expect(alias.fields?.map(f => f.name)).toEqual(a.fields?.map(f => f.name));
    expect(result.edges.some(e => e.source === alias.id && e.target === a.id && e.kind === 'derived-from')).toBe(true);
  });
  it('DM-07 Extract predicate must not leak into result fields', () => {
    const detail = model('Detail'), message = model('Message');
    expect(detail.model?.definition).toContain("Extract<Message, { type: 'detail' }>['detail']");
    expect(detail.fields?.some(f => f.name === 'type')).not.toBe(true);
    if (detail.model?.expansion === 'expanded') { expect(detail.fields?.map(f => f.name)).toEqual(['oid', 'title']); expect(field(detail, 'title').optional).toBe(true); }
    else { expect(['partial', 'unexpanded']).toContain(detail.model?.expansion); expect(detail.model?.reasons.length).toBeGreaterThan(0); }
    expect(result.edges.some(e => e.source === detail.id && e.target === message.id)).toBe(true);
  });
  it('DM-08 unresolved and generic conditional not zero-field success', () => {
    for (const name of ['Unknown', 'Complex']) { const node = model(name); expect(['partial', 'unexpanded']).toContain(node.model?.expansion); expect(node.model?.reasons.length).toBeGreaterThan(0); }
    expect(model('Complex').fields?.some(f => f.name === 'text' || f.name === 'other')).not.toBe(true);
  });
  it('DM-09 recursive self relation survives bounded expansion', () => {
    const recursive = model('Recursive'); expect(field(recursive, 'next').referenceIds).toContain(recursive.id);
    expect(result.edges.some(e => e.source === recursive.id && e.target === recursive.id && e.kind === 'field-type')).toBe(true);
  });
  it('DM-10 same names cannot resolve across wrong file', () => {
    const local = model('Same'), peer = model('Same', 'peer.ts'), usesLocal = model('UsesLocal'), usesPeer = model('UsesPeer', 'peer.ts');
    expect(field(usesLocal, 'same').referenceIds).toEqual([local.id]); expect(field(usesPeer, 'same').referenceIds).toEqual([peer.id]); expect(local.id).not.toBe(peer.id);
  });
  it('DM-11 schema import identity, constraints and actual parse usage', () => {
    const schema = model('Homonym', 'validation.ts'); expect(schema.model?.domain).toBe('validation');
    expect(field(schema, 'note').optional).toBe(true); expect(field(schema, 'nullable')).toMatchObject({ nullable: true, optional: false });
    expect(field(schema, 'count')).toMatchObject({ default: '1', defaultSource: 'validation' });
    expect(field(schema, 'count').constraints?.some(c => c.includes('min') && c.includes('0'))).toBe(true);
    expect(result.nodes.some(n => n.path === 'fake-validation.ts' && n.model?.domain === 'validation')).toBe(false);
    expect(projectSemanticView(result, 'data-model').nodes.some(n => n.path === 'fake-validation.ts')).toBe(false);
    const usage = result.edges.filter(e => /validat/.test(e.kind)); expect(usage.some(e => e.source === schema.id || e.target === schema.id)).toBe(true);
    const unused = model('Unused', 'validation.ts'); expect(usage.some(e => e.source === unused.id || e.target === unused.id)).toBe(false);
  });
  it('DM-12 ORM relation is distinct from DB foreign key', () => {
    const soft = model('Soft', 'storage.ts'), child = model('Child', 'storage.ts');
    expect(soft.model?.constraints?.some(c => c.kind === 'foreign-key')).not.toBe(true);
    expect(result.nodes.some(n => n.path === 'storage.ts' && n.model?.constraints?.some(c => c.kind === 'orm-relation'))).toBe(true);
    expect(child.model?.constraints?.some(c => c.kind === 'foreign-key' && c.columns.includes('parentId') && c.expression.includes('cascade'))).toBe(true);
  });
  it('DM-13 compound constraints, spreads and declaration provenance', () => {
    const parent = model('Parent', 'storage.ts'), sqlChild = model('child', 'history.sql');
    expect(parent.model?.constraints?.find(c => c.kind === 'primary-key')?.columns).toEqual(['tenant', 'id']);
    expect(field(parent, 'createdAt').evidence?.length).toBeGreaterThan(0);
    const fk = sqlChild.model?.constraints?.find(c => c.kind === 'foreign-key'); expect(fk?.columns).toEqual(['tenant', 'parent_id']); expect(fk?.targetColumns).toEqual(['tenant', 'id']);
    expect(fk?.expression.toLowerCase()).toContain('cascade'); expect(fk?.evidence.length).toBeGreaterThan(0);
  });
  it('DM-14 same-name code/schema/ORM/SQL are separate', () => {
    const names = [model('Homonym'), model('Homonym', 'validation.ts'), model('Homonym', 'storage.ts'), model('Homonym', 'history.sql')];
    const ids = new Set(names.map(n => n.id)); expect(ids.size).toBe(4);
    expect(result.edges.filter(e => ids.has(e.source) && ids.has(e.target))).toHaveLength(0);
  });
  it('DM-FIX nested union property references are not direct union members', () => {
    const candidate = model('NestedCandidate'), targets = new Set([model('A').id, model('Remote', 'peer.ts').id]);
    expect(result.edges.filter(e => e.source === candidate.id && targets.has(e.target) && e.kind === 'union-member')).toHaveLength(0);
    expect(result.edges.filter(e => e.source === candidate.id && targets.has(e.target) && e.kind === 'field-type')).toHaveLength(2);
  });
  it('SCHEMA-LEGACY advertised basic Prisma and GraphQL declarations remain', () => {
    expect(field(model('LegacyParent', 'legacy.prisma'), 'id').key).toBe('primary');
    expect(field(model('LegacyChild', 'legacy.prisma'), 'parent').type).toContain('LegacyParent');
    const user = model('LegacyUser', 'legacy.graphql'); expect(field(user, 'id')).toMatchObject({ type: 'ID!', optional: false });
    expect(field(user, 'name')).toMatchObject({ type: 'String', optional: true }); expect(field(user, 'friends').type).toBe('[LegacyUser!]!');
  });
  it('SCHEMA-LEGACY advertised import-grounded Mongoose and Sequelize definitions remain accessible', () => {
    const graph = projectSemanticView(result, 'data-model');
    for (const [path, label] of [['legacy-mongoose.ts', 'PersonSchema'], ['legacy-mongoose.ts', 'Person'], ['legacy-sequelize.ts', 'Account']]) {
      const node = model(label!, path!); expect(graph.nodes.some(n => n.id === node.id), `${label} disappeared from Data Model`).toBe(true);
      expect(node.model?.definition).toBeTruthy(); expect(node.evidence.length).toBeGreaterThan(0);
    }
    expect(model('PersonSchema', 'legacy-mongoose.ts').fields?.map(f => f.name)).toEqual(['name', 'age']);
    expect(model('Account', 'legacy-sequelize.ts').fields?.map(f => f.name)).toEqual(['name', 'age']);
    const schema = model('PersonSchema', 'legacy-mongoose.ts'), person = model('Person', 'legacy-mongoose.ts');
    expect(graph.edges.some(e => e.source === person.id && e.target === schema.id && e.evidence.length > 0)).toBe(true);
  });
  it('LINK resolved annotated value links; homonymous variable does not', () => {
    const a = model('A'); const payload = at('export function linked(payload: A)', 'parameter').find(n => n.label === 'payload');
    expect(payload).toBeDefined(); expect(payload!.links?.some(l => l.targetId === a.id && l.view === 'data-model')).toBe(true);
    const falseMatch = at('export function notLinked(A: string)', 'parameter').find(n => n.label === 'A'); expect(falseMatch).toBeDefined(); expect(falseMatch!.links?.some(l => l.targetId === a.id)).not.toBe(true);
    expect(a.links?.some(l => l.targetId === payload!.id && l.view === 'data-flow')).toBe(true);
    const property = at('export function linked(payload: A)', 'property-read').find(n => n.data?.expression === 'payload.id');
    expect(property).toBeDefined(); expect(property!.links?.some(l => l.targetId === a.id && l.fieldId === field(a, 'id').id)).toBe(true);
    expect(a.links?.some(l => l.targetId === property!.id && l.fieldId === field(a, 'id').id)).toBe(true);
  });
  it('all emitted evidence belongs to exact fixture text', () => {
    for (const node of result.nodes) for (const e of [...node.evidence, ...(node.fields?.flatMap(f => f.evidence ?? []) ?? []), ...(node.model?.constraints?.flatMap(c => c.evidence) ?? [])]) {
      expect(sources[e.path], e.path).toBeDefined(); expect(e.start).toBeGreaterThanOrEqual(0); expect(e.end).toBeLessThanOrEqual(sources[e.path]!.length); expect(e.end).toBeGreaterThanOrEqual(e.start);
      expect(sources[e.path]!.slice(0, e.start).split('\n').length).toBe(e.line);
    }
  });
  it('INPUT empty and malformed sources remain distinguishable', async () => {
    const empty = await analyzeSemanticSources({ sources: {}, imports: [], resources: [] }, testLanguage, undefined, testParser);
    expect(empty.nodes).toHaveLength(0); expect(empty.edges).toHaveLength(0);
    const malformed = await analyzeSemanticSources({ sources: { 'broken.ts': 'export interface Broken { id: ;' }, imports: [], resources: [] }, testLanguage, undefined, testParser);
    expect(malformed.coverage.some(c => c.path === 'broken.ts' && c.status !== 'parsed')).toBe(true);
  });
  it('INPUT recursive calls and circular type aliases terminate with bounded explanation', async () => {
    const recursive = await analyzeSemanticSources({ sources: { 'recursive.ts': 'type Left = Right; type Right = Left; export function repeat(value: number): number { if (value < 1) return 0; return repeat(value - 1); }' }, imports: [], resources: [] }, testLanguage, undefined, testParser);
    expect(recursive.nodes.length).toBeLessThan(500);
    expect(recursive.nodes.some(n => n.data?.resolution === 'partial' && n.data.reasons?.length)).toBe(true);
    expect(recursive.nodes.filter(n => n.kind === 'model').every(n => n.model?.expansion !== 'expanded' && n.model?.reasons.length)).toBe(true);
  });
  it('SAFETY input configuration text is never imported or evaluated', async () => {
    const files = {
      'package.json': '{"name":"static-review-fixture","dependencies":{"vite":"1.0.0","drizzle-orm":"0.45.2"}}',
      'vite.config.ts': 'throw new Error("INPUT CONFIGURATION MUST NOT EXECUTE"); export default { server: { port: 9999 } };',
      'drizzle.config.ts': 'throw new Error("INPUT CONFIGURATION MUST NOT EXECUTE"); export default { schema: "./schema.ts" };',
      'schema.ts': 'export interface StaticOnly { id: string }',
    };
    const store = await scanProjectFiles(Object.entries(files).map(([relativePath, source]) => ({ relativePath, name: relativePath, extension: relativePath.endsWith('.json') ? '.json' : '.ts', size: source.length, readText: async () => source })));
    const analyzed = await analyzeSemanticSources(semanticInput(store), testLanguage, undefined, testParser);
    expect(analyzed.nodes.some(n => n.kind === 'model' && n.label === 'StaticOnly')).toBe(true);
  });
});
