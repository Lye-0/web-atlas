// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { analyzeSemanticSources } from './analyze';
import { initializeTestParser, testLanguage, testParser } from './testRuntime';
import { projectSemanticView } from './project';
import { importExecutionTrace } from './traces';

beforeAll(initializeTestParser);
const analyze = (sources: Record<string, string>) => analyzeSemanticSources({ sources, imports: [], resources: [] }, testLanguage, undefined, testParser);

describe('independently reported Runtime / Call regressions', () => {
  it('leaves unknown object methods unresolved rather than matching unrelated local names (COR-002)', async () => {
    const analysis = await analyze({ 'src/receiver.ts': 'function run() {}\nexport function A(obj: unknown) { obj.run(); }\n' });
    const caller = analysis.nodes.find(node => node.label === 'A' && node.kind === 'function')!;
    const edge = analysis.edges.find(edge => edge.source === caller.id && edge.kind === 'calls')!;
    expect(edge.confidence).toBe('unresolved');
    expect(analysis.nodes.find(node => node.id === edge.target)).toMatchObject({ kind: 'external', label: 'obj.run' });
    expect(edge.target).not.toBe(analysis.nodes.find(node => node.label === 'run' && node.kind === 'function')?.id);
  });
  it('resolves nearest lexical declarations and explicit this methods separately from globals (COR-002)', async () => {
    const analysis = await analyze({ 'src/scope.ts': 'function same() {}\nfunction outer() { function same() {} same(); }\nfunction run() {}\nclass Tool { run() {} start() { this.run(); run(); } }' });
    const functions = analysis.nodes.filter(node => node.kind === 'function');
    const outer = functions.find(node => node.label === 'outer')!, inner = functions.find(node => node.label === 'same' && node.line === 2)!;
    expect(analysis.edges.find(edge => edge.source === outer.id && edge.kind === 'calls')).toMatchObject({ target: inner.id, confidence: 'source' });
    const start = functions.find(node => node.label === 'Tool.start')!, method = functions.find(node => node.label === 'Tool.run')!, global = functions.find(node => node.label === 'run')!;
    const calls = analysis.edges.filter(edge => edge.source === start.id && edge.kind === 'calls');
    expect(calls.find(edge => edge.label === 'this.run')).toMatchObject({ target: method.id, confidence: 'source' });
    expect(calls.find(edge => edge.label === 'run')).toMatchObject({ target: global.id, confidence: 'source' });
  });
  it('recognizes named callback arguments only under supported callback contracts (COR-003)', async () => {
    const analysis = await analyze({ 'src/callback.ts': 'function mapVehicle(value: unknown) { return value; }\nfunction mapCustomer(items: unknown[]) { return items.map(mapVehicle); }\nfunction setup(signal: AbortSignal) { const abort = () => {}; signal.addEventListener("abort", abort); accept(abort); }' });
    const fn = (name: string) => analysis.nodes.find(node => node.kind === 'function' && node.attributes.name === name)!;
    expect(analysis.edges.some(edge => edge.source === fn('mapCustomer').id && edge.target === fn('mapVehicle').id && edge.kind === 'callback' && edge.confidence === 'inferred')).toBe(true);
    const abortCallbacks = analysis.edges.filter(edge => edge.source === fn('setup').id && edge.target === fn('abort').id && edge.kind === 'callback');
    expect(abortCallbacks).toHaveLength(1); expect(abortCallbacks[0]!.label).toContain('addEventListener');
    expect(analysis.edges.some(edge => edge.kind === 'calls' && edge.target === fn('abort').id)).toBe(false);
  });
  it('keeps registration owner → event entry → handler, without claiming observed execution (COR-004)', async () => {
    const analysis = await analyze({ 'src/events.ts': 'function handler() {}\nexport function activate() { vscode.commands.registerCommand("open", handler); }\nfunction install(signal: AbortSignal) { signal.addEventListener("abort", handler); }\nclass Panel { constructor(webview: unknown) { webview.onDidReceiveMessage(handler); } }' });
    for (const [owner, registration] of [['activate', 'registerCommand'], ['install', 'addEventListener'], ['Panel.constructor', 'onDidReceiveMessage']]) {
      const caller = analysis.nodes.find(node => node.kind === 'function' && node.label === owner)!;
      const entry = analysis.nodes.find(node => node.kind === 'entry' && node.label.startsWith(registration!))!;
      expect(analysis.edges.find(edge => edge.source === caller.id && edge.target === entry.id)).toMatchObject({ kind: 'registers-event', confidence: 'source' });
      expect(analysis.edges.some(edge => edge.source === entry.id && edge.kind === 'handles' && edge.confidence === 'source')).toBe(true);
      expect(projectSemanticView(analysis, 'runtime-flow').edges.some(edge => edge.source === caller.id && edge.target === entry.id)).toBe(true);
    }
  });
  it('retains complete multiline Schema ranges and matching end lines (COR-005)', async () => {
    const sql = ['CREATE TABLE users (', ' id INTEGER PRIMARY KEY,', ' description_with_long_identifier_for_regression TEXT NOT NULL,', ' created_at_with_long_identifier_for_regression INTEGER NOT NULL,', ' updated_at_with_long_identifier_for_regression INTEGER NOT NULL', ');'].join('\n');
    const result = await analyze({ 'schema.sql': sql }); const model = result.nodes.find(node => node.kind === 'model')!;
    expect(sql.length).toBeGreaterThan(160); expect(model.evidence[0]).toMatchObject({ start: 0, end: sql.length, line: 1, endLine: 6 });
    expect(model.endLine).toBe(6);
  });
  it('keeps nanosecond clocks exact with units/provenance and only recorded parentage (COR-006)', () => {
    const trace = importExecutionTrace(JSON.stringify({ resourceSpans: [{ resource: { attributes: [{ key: 'service.name', value: { stringValue: 'review' } }] }, scopeSpans: [{ spans: [
      { traceId: 't', spanId: 'p', name: 'parent', startTimeUnixNano: '1788000000000000001', endTimeUnixNano: '1788000000020000001' },
      { traceId: 't', spanId: 'c', parentSpanId: 'p', name: 'child', startTimeUnixNano: '1788000000005000001', endTimeUnixNano: '1788000000009000001' },
    ] }] }] }), 'review-otlp.json');
    expect(trace.nodes[0]!.attributes).toMatchObject({ startTimeUnixNano: '1788000000000000001', endTimeUnixNano: '1788000000020000001', durationMs: 20, timeUnit: 'nanoseconds', timeOrigin: 'Unix epoch', recordFormat: 'OTLP', sourceFile: 'review-otlp.json' });
    expect(trace.nodes[1]!.attributes).toMatchObject({ startTimeUnixNano: '1788000000005000001', endTimeUnixNano: '1788000000009000001', durationMs: 4 });
    expect(trace.edges).toHaveLength(1); expect(trace.edges[0]).toMatchObject({ source: 'span:t:p', target: 'span:t:c', kind: 'observed-child' });
  });
  it('keeps Jaeger/Chrome/generic supplied clocks without synthesizing missing ends (COR-006)', () => {
    const jaeger = importExecutionTrace(JSON.stringify({ data: [{ spans: [{ traceID: 't', spanID: 'a', operationName: 'run', startTime: '1788000000000001', duration: 4000, logs: [{ timestamp: '1788000000001001', fields: [{ key: 'event', value: 'saved' }] }] }] }] }), 'jaeger.json');
    expect(jaeger.nodes[0]!.attributes).toMatchObject({ startTime: '1788000000000001', durationRaw: '4000', timeUnit: 'microseconds', recordFormat: 'Jaeger' });
    expect(jaeger.nodes[1]!.attributes.timestamp).toBe('1788000000001001'); expect(jaeger.nodes[0]!.attributes.endTime).toBeUndefined();
    const chrome = importExecutionTrace(JSON.stringify({ traceEvents: [{ ph: 'B', name: 'run', pid: 1, tid: 1, ts: '100.5' }, { ph: 'E', pid: 1, tid: 1, ts: '200.5' }] }), 'chrome.json');
    expect(chrome.nodes[0]!.attributes).toMatchObject({ ts: '100.5', endTs: '200.5', timeUnit: 'microseconds', timeOrigin: 'trace clock' });
    const generic = importExecutionTrace(JSON.stringify({ message: 'ready', timestamp: '2026-09-06T00:00:00.001Z' }), 'log.json');
    expect(generic.nodes[0]!.attributes.timestamp).toBe('2026-09-06T00:00:00.001Z'); expect(generic.edges).toEqual([]);
  });
  it('preserves both sides of Runtime branch convergence without fabricating a serial chain (COR-008)', async () => {
    const analysis = await analyze({ 'src/merge.ts': 'function A(){B();C()} function B(){X()} function C(){X()} function X(){D()} function D(){fetch("/api/check")} addEventListener("start",A)' });
    const runtime = projectSemanticView(analysis, 'runtime-flow');
    const fn = (name: string) => analysis.nodes.find(node => node.kind === 'function' && node.label === name)!;
    const original = analysis.edges.filter(edge => edge.kind === 'calls' && ['A', 'B', 'C', 'X'].some(name => edge.source === fn(name).id) && edge.confidence === 'source');
    const represented = runtime.edges.flatMap(edge => edge.provenance?.edges ?? [edge]);
    for (const edge of original) expect(represented.find(item => item.id === edge.id)).toMatchObject({ source: edge.source, target: edge.target, kind: edge.kind, confidence: edge.confidence, evidence: edge.evidence });
    expect(runtime.nodes.find(node => node.id === fn('X').id)?.attributes.runtimeJunction).toBe('合流');
    expect(runtime.edges.filter(edge => edge.source === fn('A').id && edge.target === fn('X').id)).toHaveLength(2);
  });
  it('keeps repeated diamonds and cyclic branches bounded while retaining all original calls (COR-008)', async () => {
    const diamonds = Array.from({ length: 16 }, (_, index) => `function A${index}(){L${index}();R${index}()} function L${index}(){A${index + 1}()} function R${index}(){A${index + 1}()}`).join('\n');
    for (const source of [`${diamonds}\nfunction A16(){fetch("/done")} addEventListener("start",A0)`, 'function A(){B();C()} function B(){X()} function C(){X()} function X(){B();D()} function D(){fetch("/done")} addEventListener("start",A)']) {
      const analysis = await analyze({ 'src/bounded.ts': source }), runtime = projectSemanticView(analysis, 'runtime-flow');
      const functionIds = new Set(analysis.nodes.filter(node => node.kind === 'function').map(node => node.id));
      const calls = analysis.edges.filter(edge => edge.kind === 'calls' && functionIds.has(edge.source) && functionIds.has(edge.target));
      const represented = new Set(runtime.edges.flatMap(edge => edge.provenance?.edges ?? [edge]).map(edge => edge.id));
      for (const call of calls) expect(represented.has(call.id)).toBe(true);
      expect(runtime.edges.length).toBeLessThanOrEqual(analysis.edges.length);
    }
  });
});
