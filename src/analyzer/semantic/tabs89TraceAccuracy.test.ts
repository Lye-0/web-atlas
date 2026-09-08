// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { adaptDataExecutionTrace, importDataExecutionTrace } from './dataTrace';
import { importExecutionTrace } from './traces';
import type { SemanticAnalysis } from './types';

const source: SemanticAnalysis = {
  nodes: [{ id: 'function:source.ts:0:identity', kind: 'function', label: 'identity', path: 'source.ts', line: 1, endLine: 3, group: 'fixture', confidence: 'source', attributes: { name: 'identity' }, evidence: [{ path: 'source.ts', start: 0, end: 40, line: 1, endLine: 3, description: 'current source definition' }] }],
  edges: [], coverage: [], warnings: [], stats: { files: 1, functions: 1, models: 0, unresolved: 0, elapsedMs: 0 },
};
const span = { name: 'identity', traceId: 'review-trace', spanId: 'review-span', attributes: { 'code.file.path': 'source.ts', 'code.line.number': 2, 'code.function.name': 'identity', 'data.input.name': 'input name', 'data.output.name': 'output name' } };
const text = (value: unknown) => JSON.stringify(value);

describe('independent source-first trace semantics for tabs8/9', () => {
  it('TRACE-01 names-only boundary cannot invent actual values or causal path to source', () => {
    const raw = importDataExecutionTrace(text({ version: 1, spans: [span] }), 'fixture.json', source), before = text(raw);
    const adapted = adaptDataExecutionTrace(raw);
    expect(adapted.nodes.filter(n => n.kind === 'value').map(n => n.label)).toEqual(['input name', 'output name']);
    expect(adapted.edges.map(e => [e.kind, e.views])).toEqual([['observed-data', ['data-flow']], ['observed-data', ['data-flow']]]);
    expect(adapted.nodes.every(n => !n.path && !n.evidence.length)).toBe(true);
    expect(adapted.nodes.filter(n => n.kind === 'value').every(n => n.attributes.valueRecorded === false)).toBe(true);
    expect(adapted.edges.some(e => e.source === source.nodes[0]!.id || e.target === source.nodes[0]!.id)).toBe(false);
    expect(text(raw)).toBe(before);
    expect(raw).toEqual(importExecutionTrace(text({ version: 1, spans: [span] }), 'fixture.json', source));
  });
  it('TRACE-02 unsupported version and malformed shape rejected, older versionless accepted', () => {
    expect(() => importDataExecutionTrace(text({ version: 999, spans: [span] }), 'bad.json', source)).toThrow(/version/);
    expect(() => importDataExecutionTrace(text({ version: 1, spans: 'invalid' }), 'bad.json', source)).toThrow();
    expect(() => importDataExecutionTrace(text({ spans: [{ name: 'missing ID' }] }), 'bad.json', source)).toThrow(/spanId/);
    expect(importDataExecutionTrace(text({ spans: [span] }), 'old.json', source).spans).toBe(1);
    expect(importDataExecutionTrace(text(span) + '\n' + text({ ...span, spanId: 'second' }), 'old.jsonl', source).spans).toBe(2);
  });
  it('TRACE-03 stale or merely supplied hash never confirms current source identity', () => {
    const raw = importDataExecutionTrace(text({ version: 1, spans: [{ ...span, attributes: { ...span.attributes, 'code.source.sha256': '0'.repeat(64) } }] }), 'stale.json', source);
    const adapted = adaptDataExecutionTrace(raw), recorded = adapted.nodes.find(n => n.kind === 'span')!;
    expect(recorded.attributes['code.source.sha256']).toBe('0'.repeat(64)); expect(recorded.attributes.sourceBinding).toContain('未検証');
    expect(recorded.attributes.sourceFunction).toBeUndefined(); expect(recorded.evidence).toHaveLength(0);
    expect(adapted.edges.some(e => e.kind === 'observed-at')).toBe(false);
    expect(raw.nodes.find(n => n.kind === 'span')!.evidence.length).toBeGreaterThan(0);
  });
  it('TRACE-04 unknown parent/source references do not produce invented target or causality', () => {
    const raw = importDataExecutionTrace(text({ spans: [{ ...span, parentSpanId: 'missing-parent', attributes: { ...span.attributes, 'code.file.path': 'missing.ts', 'code.function.name': 'missing' } }] }), 'unknown.json', source);
    const adapted = adaptDataExecutionTrace(raw);
    expect(adapted.warnings.some(w => w.includes('親span'))).toBe(true);
    expect(adapted.nodes.some(n => n.attributes.spanId === 'missing-parent')).toBe(false);
    expect(adapted.edges.some(e => e.kind === 'observed-child')).toBe(false);
    expect(adapted.nodes.every(n => !n.evidence.length)).toBe(true);
  });
  it('TRACE-05 trace without data names gives explanatory empty Data Flow, never generated values', () => {
    const raw = importDataExecutionTrace(text({ spans: [{ ...span, attributes: { 'code.file.path': 'source.ts' } }] }), 'no-data.json', source);
    const adapted = adaptDataExecutionTrace(raw);
    expect(raw.spans).toBe(1); expect(adapted.nodes).toHaveLength(0); expect(adapted.edges).toHaveLength(0);
    expect(adapted.warnings.some(w => w.includes('観測境界'))).toBe(true);
  });
  it('TRACE-06 projected observation removes unsolicited raw data attributes', () => {
    const raw = importDataExecutionTrace(text({ spans: [{ ...span, attributes: { ...span.attributes, 'data.input.value': 'fixture-unrecorded-value', 'custom.payload': 'fixture-unrecorded-value' } }] }), 'raw.json', source);
    const adapted = adaptDataExecutionTrace(raw);
    expect(text(adapted)).not.toContain('fixture-unrecorded-value');
    expect(raw.nodes.some(n => n.attributes['data.input.value'] === 'fixture-unrecorded-value')).toBe(true);
  });
});
