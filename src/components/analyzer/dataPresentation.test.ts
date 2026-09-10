import { describe, expect, it } from 'vitest';
import type { SemanticNode } from '../../analyzer/semantic/types';
import { isFineDataExpression, semanticNodeDisplay } from './semanticFlowDisplay';
import { matchingSemanticFields, searchSemanticNodes } from '../../analyzer/semantic/search';

const value = (id: string, role: NonNullable<SemanticNode['data']>['role'], expression: string): SemanticNode => ({
  id, label: expression, kind: role === 'operation' ? 'operation' : 'value', path: 'src/reader.ts', line: 7, group: 'Source', confidence: 'source',
  attributes: { owner: 'read', ownerName: 'read' }, evidence: [{ path: 'src/reader.ts', line: 7, endLine: 7, start: 100, end: 100 + expression.length, description: 'source range' }],
  data: { role, expression },
});

describe('Data Flow / Data Model display semantics', () => {
  it('separates named values/results from fine occurrences without removing the latter from search', () => {
    const nodes = [value('parameter', 'parameter', 'limit'), value('declaration', 'declaration', 'args'), value('result', 'call-result', 'runner.runChecked(["--all"])'), value('literal', 'literal', '"--all"'), value('use', 'use', 'limit')];
    expect(nodes.filter(isFineDataExpression).map(node => node.id)).toEqual(['literal', 'use']);
    expect(nodes.filter(node => !isFineDataExpression(node)).map(node => node.id)).toEqual(['parameter', 'declaration', 'result']);
    expect(searchSemanticNodes(nodes, '--all').map(result => result.id).sort()).toEqual(['literal', 'result']);
  });

  it('keeps await, recorded role, owner and full original source in the shared display', () => {
    const expression = 'await /* ( explanatory comment */ runner.runChecked(["for-each-ref", "--sort=refname"], { cwd: root })';
    const node = value('await', 'operation', expression), before = structuredClone(node);
    const display = semanticNodeDisplay(node);
    expect(display.title).toBe('await runner.runChecked(…)'); expect(display.dataRole).toBe('操作');
    expect(display.tooltip).toContain(expression); expect(display.tooltip).toContain('所属: read'); expect(display.location).toBe('src/reader.ts:7');
    expect(node).toEqual(before);
  });

  it('distinguishes formal parameters, source uses, actual slots and call results', () => {
    const formal = value('formal', 'parameter', 'limit'); formal.data!.argumentIndex = 2;
    const actual = value('actual', 'argument', 'limit'); actual.data!.argumentIndex = 1;
    expect(semanticNodeDisplay(formal).dataRole).toBe('readの仮引数・第3引数');
    expect(semanticNodeDisplay(value('use', 'use', 'limit')).dataRole).toBe('7行目の使用箇所');
    expect(semanticNodeDisplay(actual).dataRole).toBe('実引数・第2引数');
    expect(semanticNodeDisplay(value('result', 'call-result', 'Math.max(1, limit)')).title).toBe('Math.max(…) の結果');
  });

  it('finds candidate fields without opening every structure for a model-name-only query', () => {
    const node: SemanticNode = { id: 'message', label: 'Message', kind: 'model', group: 'Source', path: 'messages.ts', confidence: 'source', evidence: [], attributes: {},
      model: { domain: 'code', kind: 'union', definition: '{ event: "done"; count: number } | { event: "error"; errorText: string }', expansion: 'expanded', reasons: [], choices: [
        { label: '{ event: "done"; count: number }', fields: [{ id: 'event1', name: 'event', type: '"done"', optional: false }, { id: 'count', name: 'count', type: 'number', optional: false }], evidence: [] },
        { label: '{ event: "error"; errorText: string }', fields: [{ id: 'event2', name: 'event', type: '"error"', optional: false }, { id: 'errorText', name: 'errorText', type: 'string', optional: false }], evidence: [] },
      ] } };
    expect(matchingSemanticFields(node, 'Message')).toEqual([]);
    expect(matchingSemanticFields(node, 'Message errorText').map(field => field.id)).toEqual(['errorText']);
    expect(searchSemanticNodes([node], 'errorText').map(result => result.id)).toEqual(['message']);
    expect(matchingSemanticFields(node, 'event').map(field => field.id)).toEqual(['event1', 'event2']);
  });
});
