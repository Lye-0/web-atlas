import { describe, expect, it } from 'vitest';
import { adaptDataExecutionTrace, importDataExecutionTrace } from './dataTrace';
import { importExecutionTrace } from './traces';
import { projectSemanticView } from './project';
import type { SemanticAnalysis } from './types';

const analysis: SemanticAnalysis = { nodes: [{ id: 'run', label: 'run', kind: 'function', path: 'src/main.ts', line: 1, endLine: 5, group: 'API', confidence: 'source', evidence: [{ path: 'src/main.ts', line: 1, endLine: 5, start: 0, end: 80, description: 'function definition' }], attributes: { name: 'run' } }], edges: [], coverage: [], warnings: [], stats: { files: 1, functions: 1, models: 0, unresolved: 0, elapsedMs: 0 } };
const span = { name: 'run', traceId: 'trace-1', spanId: 'call-1', attributes: { 'data.input.name': 'Draft', 'data.output.name': 'Record', 'code.file.path': 'src/main.ts', 'code.line.number': 2, 'code.function.name': 'run', 'code.source.sha256': 'a'.repeat(64), 'data.input.value': 'private content' } };

describe('Data Flow trace adapter', () => {
  it('keeps full cached trace for 6/7 while removing unverified current-source binding only from 8', () => {
    const text = JSON.stringify({version:1,spans:[span]});
    const raw = importDataExecutionTrace(text,'trace.json',analysis);
    expect(raw).toEqual(importExecutionTrace(text,'trace.json',analysis));
    const before=JSON.stringify(raw), sourceBefore=JSON.stringify(analysis);
    const adapted=adaptDataExecutionTrace(raw);
    expect(JSON.stringify(raw)).toBe(before); expect(JSON.stringify(analysis)).toBe(sourceBefore);
    expect(raw.edges.some(edge=>edge.kind==='observed-at')).toBe(true);
    expect(adapted.edges.every(edge=>edge.kind==='observed-data')).toBe(true);
    expect(adapted.nodes.every(node=>!node.path && !node.line && node.evidence.length===0)).toBe(true);
    const recorded=adapted.nodes.find(node=>node.kind==='span')!;
    expect(recorded.attributes.sourceBinding).toContain('未検証');
    expect(recorded.attributes.recordedSourcePath).toBe('src/main.ts');
    expect(recorded.attributes['code.source.sha256']).toBe('a'.repeat(64));
    expect(recorded.attributes.sourceFunction).toBeUndefined();
    expect(recorded.attributes['data.input.value']).toBeUndefined();
    const graph=projectSemanticView(analysis,'data-flow',adapted,'observed');
    expect(graph.nodes.map(node=>node.label).sort()).toEqual(['Draft','Record','run']);
    expect(graph.nodes.filter(node=>node.kind==='value').every(node=>node.attributes.valueRecorded===false)).toBe(true);
    expect(graph.edges).toHaveLength(2);
  });
  it('does not invent data values, inter-call propagation, or chronology from spans alone', () => {
    const raw=importDataExecutionTrace(JSON.stringify({spans:[{name:'first',spanId:'a'},{name:'second',spanId:'b',parentSpanId:'a'}]}),'plain.json');
    const adapted=adaptDataExecutionTrace(raw);
    expect(adapted.nodes).toEqual([]); expect(adapted.edges).toEqual([]);
    expect(adapted.warnings.join(' ')).toContain('表示できる観測境界はありません');
  });
  it('retains warnings for missing referenced spans without creating a fake endpoint', () => {
    const raw=importDataExecutionTrace(JSON.stringify({spans:[{...span,parentSpanId:'missing'}]}),'missing.json');
    const adapted=adaptDataExecutionTrace(raw);
    expect(adapted.warnings.some(w=>w.includes('親spanが含まれていません'))).toBe(true);
    expect(adapted.nodes.some(node=>node.id.includes('missing'))).toBe(false);
    expect(adapted.edges.every(edge=>adapted.nodes.some(node=>node.id===edge.source)&&adapted.nodes.some(node=>node.id===edge.target))).toBe(true);
  });
  it.each([
    {version:999,spans:[span]}, {spans:{}}, {spans:[{name:'x'}]},
    {spans:[{...span,parentSpanId:99}]}, {version:1,spans:[span],edges:[{source:'missing',target:'x'}]},
    {data:[{spans:[{name:'x',spanID:'s'}]}]},
    {resourceSpans:[{scopeSpans:[{spans:[{name:'x',traceId:'t'}]}]}]},
    {spans:[{...span,references:[{refType:'invented',spanID:'x'}]}]},
    {spans:[span],logs:[42]}, {spans:[span],resourceLogs:[{scopeLogs:{}}]}, {traceEvents:[{name:'missing phase'}]},
  ])('rejects incompatible envelopes and IDs without modifying source analysis: %j', input => {
    const before=JSON.stringify(analysis);
    expect(()=>importDataExecutionTrace(JSON.stringify(input),'invalid.json',analysis)).toThrow();
    expect(JSON.stringify(analysis)).toBe(before);
  });
  it.each([
    {resourceSpans:[{scopeSpans:[{spans:[span]}]}]},
    {data:[{spans:[{traceID:'t',spanID:'s',operationName:'run',tags:[{key:'data.input.name',value:'Draft'}]}]}]},
    {traceEvents:[{ph:'X',name:'run',ts:1,dur:3,args:{'data.output.name':'Record'}}]},
    {version:1,spans:[span]},
  ])('accepts supported formats and keeps only recorded data-name boundaries: %j', input => {
    const adapted=adaptDataExecutionTrace(importDataExecutionTrace(JSON.stringify(input),'valid.json'));
    expect(adapted.edges.length).toBeGreaterThan(0);
    expect(adapted.edges.every(edge=>edge.kind==='observed-data')).toBe(true);
  });
  it('supports versionless JSONL and rejects explicitly incompatible JSONL records', () => {
    const raw=importDataExecutionTrace(JSON.stringify(span)+'\n'+JSON.stringify({message:'done',traceId:'trace-1',spanId:'call-1'}),'events.jsonl');
    expect(raw.spans).toBe(1); expect(raw.logs).toBe(1);
    expect(()=>importDataExecutionTrace(JSON.stringify({...span,version:999})+'\n'+JSON.stringify({message:'done'}),'invalid.jsonl')).toThrow(/version/);
  });
  it('explains a follows-from reference without treating it as data causality', () => {
    const raw=importDataExecutionTrace(JSON.stringify({data:[{spans:[{traceID:'t',spanID:'s',operationName:'run',references:[{refType:'FOLLOWS_FROM',spanID:'previous'}]}]}]}),'follows.json');
    expect(raw.warnings.some(w=>w.includes('FOLLOWS_FROM'))).toBe(true);
    expect(adaptDataExecutionTrace(raw).edges).toEqual([]);
  });
  it('is idempotent when a consumer receives an already adapted trace', () => {
    const adapted=adaptDataExecutionTrace(importDataExecutionTrace(JSON.stringify({spans:[span]}),'test.json'));
    expect(adaptDataExecutionTrace(adapted)).toEqual(adapted);
  });
});
