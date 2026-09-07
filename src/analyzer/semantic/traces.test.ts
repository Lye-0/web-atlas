import { describe, expect, it } from 'vitest';
import { importExecutionTrace } from './traces';
import { projectSemanticView, semanticNeighbours } from './project';
import { layoutSemanticGraph, summarizeSemanticGraph } from './presentation';
import type { SemanticAnalysis } from './types';
const source: SemanticAnalysis = { nodes: [
  { id: 'run', label: 'run', kind: 'function', path: 'src/main.ts', line: 2, endLine: 12, group: 'API', confidence: 'source', evidence: [{ path: 'src/main.ts', line: 2, endLine: 2, start: 1, end: 10, description: 'function' }], attributes: { name: 'run', entry: true } },
  { id: 'save', label: 'save', kind: 'function', path: 'src/service.ts', group: 'Persistence', confidence: 'source', evidence: [], attributes: {} },
  { id: 'User', label: 'User', kind: 'model', path: 'src/model.ts', group: 'Data models', confidence: 'source', evidence: [], attributes: {}, fields: [{ name: 'id', type: 'string', optional: false }] },
], edges: [{ id: 'call', source: 'run', target: 'save', kind: 'calls', label: 'save()', confidence: 'source', evidence: [], views: ['runtime-flow', 'function-call-flow'] }], coverage: [], stats: { files: 3, functions: 2, models: 1, unresolved: 0, elapsedMs: 0 }, warnings: [] };

describe('execution data and semantic projections', () => {
  it('reads OTLP spans and logs, preserving parent IDs and exact duration', () => {
    const trace = importExecutionTrace(JSON.stringify({
      resourceSpans: [{ resource: { attributes: [{ key: 'service.name', value: { stringValue: 'api' } }] }, scopeSpans: [{ spans: [
        { name: 'request', traceId: 't', spanId: 'a', startTimeUnixNano: '1788000000000000000', endTimeUnixNano: '1788000000001250000', attributes: [{ key: 'code.file.path', value: { stringValue: '/repo/src/main.ts' } }, { key: 'code.line.number', value: { intValue: '5' } }, { key: 'authorization', value: { stringValue: 'private-token' } }] },
        { name: 'db insert', traceId: 't', spanId: 'b', parentSpanId: 'a' },
      ] }] }],
      resourceLogs: [{ scopeLogs: [{ logRecords: [{ body: { stringValue: 'saved' }, traceId: 't', spanId: 'b', severityText: 'INFO' }] }] }],
    }), 'otlp.json', source);
    expect(trace.spans).toBe(2); expect(trace.logs).toBe(1); expect(trace.nodes.find(node => node.label === 'request')?.attributes.durationMs).toBe(1.25);
    expect(trace.nodes.find(node => node.label === 'request')?.attributes.authorization).toBe('••••');
    expect(trace.edges.some(edge => edge.source === 'span:t:a' && edge.target === 'span:t:b')).toBe(true);
    expect(trace.edges.some(edge => edge.kind === 'log-event')).toBe(true);
    expect(trace.edges.some(edge => edge.kind === 'observed-at' && edge.target === 'run')).toBe(true);
  });
  it('treats structured logs with span IDs as logs and never invents chronological edges', () => {
    const trace = importExecutionTrace(' {"message":"begin","spanId":"a","traceId":"t"}\n{"message":"end","spanId":"b","traceId":"t"}', 'app.jsonl');
    expect(trace.logs).toBe(2); expect(trace.spans).toBe(0); expect(trace.edges).toHaveLength(0); expect(trace.warnings).toHaveLength(2);
  });
  it('reads Jaeger and Chrome complete events without assuming nesting from time', () => {
    const jaeger = importExecutionTrace(JSON.stringify({ data: [{ processes: { p: { serviceName: 'worker' } }, spans: [
      { traceID: 't', spanID: 'a', operationName: 'root', processID: 'p', duration: 2000 },
      { traceID: 't', spanID: 'b', operationName: 'child', processID: 'p', references: [{ refType: 'CHILD_OF', spanID: 'a' }] },
    ] }] }), 'jaeger.json');
    expect(jaeger.edges).toHaveLength(1); expect(jaeger.nodes[0]?.group).toBe('worker'); expect(jaeger.nodes[0]?.attributes.durationMs).toBe(2);
    const chrome = importExecutionTrace(JSON.stringify({ traceEvents: [{ ph: 'X', name: 'a', ts: 1, dur: 2000 }, { ph: 'X', name: 'b', ts: 2, dur: 100 }] }), 'chrome.json');
    expect(chrome.spans).toBe(2); expect(chrome.edges).toHaveLength(0);
  });
  it('shows observed data lineage only when explicitly recorded', () => {
    const trace = importExecutionTrace(JSON.stringify({ spans: [{ name: 'transform', spanId: 'a', attributes: { 'data.input.name': 'Draft', 'data.output.name': 'Record' } }] }), 'data.json');
    const graph = projectSemanticView(source, 'data-flow', trace, 'observed');
    expect(graph.nodes.map(node => node.label).sort()).toEqual(['Draft', 'Record', 'transform']);
    expect(graph.edges.map(edge => `${graph.nodes.find(node => node.id === edge.source)?.label} → ${graph.nodes.find(node => node.id === edge.target)?.label}`)).toEqual(['Draft → transform', 'transform → Record']);
    expect(projectSemanticView(source, 'data-model', trace, 'observed').nodes).toHaveLength(0);
    expect(projectSemanticView(source, 'data-model', trace, 'combined').nodes.map(node => node.label)).toEqual(['User']);
  });
  it('rejects malformed inputs and duplicate spans remain consistent', () => {
    expect(() => importExecutionTrace('{bad', 'bad.json')).toThrow(/JSON/);
    expect(() => importExecutionTrace('{}', 'empty.json')).toThrow(/レコード/);
    const trace = importExecutionTrace(JSON.stringify([{ name: 'a', spanId: '1' }, { name: 'a', spanId: '1' }]), 'duplicates.json');
    expect(trace.nodes).toHaveLength(1); expect(trace.spans).toBe(1); expect(trace.warnings).toHaveLength(1);
  });
  it('keeps views distinct and evidence immutable when aggregating architecture', () => {
    const before = JSON.stringify(source); const call = projectSemanticView(source, 'function-call-flow'); const model = projectSemanticView(source, 'data-model'); const architecture = projectSemanticView(source, 'architecture-map');
    expect(call.nodes.some(node => node.kind === 'model')).toBe(false); expect(model.nodes.every(node => node.kind === 'model')).toBe(true);
    expect(architecture.nodes.every(node => node.kind === 'subsystem')).toBe(true); expect(architecture.edges).toHaveLength(1);
    projectSemanticView(source, 'architecture-map'); expect(JSON.stringify(source)).toBe(before);
    expect([...semanticNeighbours(call, 'save', 1, 'incoming')].sort()).toEqual(['run', 'save']); expect([...semanticNeighbours(call, 'save', 1, 'outgoing')]).toEqual(['save']);
  });
  it('retains every object in summaries and places cycles on a shared orbit depth', () => {
    const graph = projectSemanticView(source, 'function-call-flow');
    const next = { ...source.nodes[1]!, id: 'next', label: 'next' };
    graph.nodes.push(next); graph.edges.push({ ...graph.edges[0]!, id: 'back', source: 'save', target: 'run' }, { ...graph.edges[0]!, id: 'next-edge', source: 'save', target: 'next' });
    const overview = summarizeSemanticGraph(graph); expect(overview.nodes.flatMap(node => node.attributes.members).sort()).toEqual(graph.nodes.map(node => node.id).sort());
    const positions = layoutSemanticGraph(graph, true); expect(positions.find(item => item.node.id === 'run')?.z).toBe(positions.find(item => item.node.id === 'save')?.z); expect(positions.find(item => item.node.id === 'next')?.z).toBeLessThan(positions.find(item => item.node.id === 'save')!.z);
  });
});
