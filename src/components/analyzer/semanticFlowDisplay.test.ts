import { describe, expect, it } from 'vitest';
import type { SemanticNode } from '../../analyzer/semantic/types';
import { semanticNodeDisplay, semanticNodeDisplays } from './semanticFlowDisplay';

const node = (id: string, overrides: Partial<SemanticNode> = {}): SemanticNode => ({ id, kind: 'function', label: id, path: 'src/example.ts', line: 5,
  group: 'Source', confidence: 'source', evidence: [{ path: 'src/example.ts', start: 40, end: 80, line: 5, endLine: 6, description: 'recorded source' }], attributes: {}, ...overrides });

describe('human-readable flow names preserve recorded semantics', () => {
  it('identifies same-definition parameters by recorded call sites without changing IDs or Evidence', () => {
    const definition = node('definition', { kind: 'value', label: 'value', data: { role: 'parameter', expression: 'value' } });
    const callA = node('callA', { kind: 'operation', line: 25, evidence: [{path:'src/example.ts',start:110,end:130,line:25,endLine:25,description:'call A'}] });
    const callB = node('callB', { kind: 'operation', line: 28, evidence: [{path:'src/example.ts',start:150,end:170,line:28,endLine:28,description:'call B'}] });
    const a = {...definition,id:'parameter-A',data:{...definition.data!,contextId:callA.id}}, b={...definition,id:'parameter-B',data:{...definition.data!,contextId:callB.id}};
    const input=[definition,callA,callB,a,b],before=JSON.stringify(input),display=semanticNodeDisplays(input);
    expect(display.get(a.id)!.disambiguation).toContain('呼び出し L25 (110–130)');
    expect(display.get(b.id)!.disambiguation).toContain('呼び出し L28 (150–170)');
    expect(display.get(a.id)!.location).not.toContain('対象 2');
    expect(display.get(definition.id)!.location).toBe('src/example.ts:5');expect(JSON.stringify(input)).toBe(before);
    const local = semanticNodeDisplays([a], new Map(input.map(node => [node.id, node])));
    expect(local.get(a.id)!.location).toContain('呼び出し src/example.ts:25');
    expect(local.size).toBe(1);
  });
  it('uses the file-level initializer meaning, not the literal module label', () => {
    const initializer = node('initializer', { label: '<module>', path: 'scripts/build-extension.mjs', line: undefined, evidence: [], attributes: { initializer: true } });
    expect(semanticNodeDisplay(initializer)).toMatchObject({ title: 'ファイル直下の処理', location: 'scripts/build-extension.mjs' });
    expect(semanticNodeDisplay(node('renamed', { label: 'initializer name', attributes: { initializer: true } })).title).toBe('ファイル直下の処理');
    expect(semanticNodeDisplay(node('ordinary', { label: '<module>' })).title).toBe('<module>');
    expect(semanticNodeDisplay(node('metadata', { label: '<module>', attributes: { initializer: 'true' } })).title).toBe('<module>');
    expect(semanticNodeDisplay(node('external', { label: '<module>', kind: 'external', attributes: { initializer: true } })).title).toBe('<module>');
  });

  it('presents calls with the recorded receiver and source line without resolving unknown definitions', () => {
    const call = node('starts-with', { label: 'startsWith()', kind: 'operation', path: 'src/git/parsers/refParser.ts', attributes: { callee: 'fullName.startsWith' } });
    expect(semanticNodeDisplay(call)).toMatchObject({ title: 'fullName.startsWith(...)', location: 'src/git/parsers/refParser.ts:5' });
    const external = node('unknown', { kind: 'external', confidence: 'unresolved', attributes: { callee: 'Math.abs' } });
    expect(semanticNodeDisplay(external).title).toBe('Math.abs(...)');
    expect(external.confidence).toBe('unresolved');
    expect(semanticNodeDisplay(node('request', { kind: 'request', label: '/api/items', attributes: { callee: 'fetch' } })).title).toBe('/api/items');
  });

  it('elides nested arguments and inline bodies while retaining the complete recorded expression in the tooltip', () => {
    const callee = "historyEvents\n.filter((event) => event.type === 'cherry-pick' || event.type === 'revert')\n.map";
    const external = node('long', { kind: 'external', label: callee.replace(/\s+/g, ' '), attributes: { callee } });
    const before = JSON.stringify(external), display = semanticNodeDisplay(external);
    expect(display.title).toBe('historyEvents.filter(...).map(...)');
    expect(display.title).not.toContain('event.type');
    expect(display.tooltip).toContain(callee);
    expect(JSON.stringify(external)).toBe(before);
    expect(semanticNodeDisplay(node('iife', { kind: 'external', attributes: { callee: '(() => { while (busy) { work(); } return result; })' } })).title).toBe('(...)(...)');
    expect(semanticNodeDisplay(node('literal-delimiters', { kind: 'external', attributes: { callee: 'values.filter(item => item === ")").map' } })).title).toBe('values.filter(...).map(...)');
    expect(semanticNodeDisplay(node('partial', { kind: 'external', attributes: { callee: 'values.filter(item => { /* recorded prefix' } })).title).toBe('呼び出し式 (...)');
  });

  it('keeps distinct same-line call sites identifiable after shortening without changing stable IDs or ranges', () => {
    const first = node('call:40', { kind: 'operation', label: 'startsWith()', attributes: { callee: 'fullName.startsWith' } });
    const second = { ...first, id: 'call:81', evidence: [{ ...first.evidence[0]!, start: 81, end: 122 }] };
    const otherFile = { ...first, id: 'call:other-file', path: 'src/other.ts' };
    const inputs = [first, second, otherFile], before = JSON.stringify(inputs), displays = semanticNodeDisplays(inputs);
    expect(displays.get(first.id)!.title).toBe(displays.get(second.id)!.title);
    expect(displays.get(first.id)!.location).toBe('src/example.ts:5 · 範囲 40–80');
    expect(displays.get(second.id)!.location).toBe('src/example.ts:5 · 範囲 81–122');
    expect(displays.get(otherFile.id)!.location).toBe('src/other.ts:5');
    expect(JSON.stringify(inputs)).toBe(before);
    const sameRange = { ...first, id: 'call:41' };
    const overlapping = semanticNodeDisplays([sameRange, first]);
    expect(overlapping.get(first.id)!.location).toBe('src/example.ts:5 · 範囲 40–80 · 対象 1');
    expect(overlapping.get(sameRange.id)!.location).toBe('src/example.ts:5 · 範囲 40–80 · 対象 2');
    expect(overlapping.get(first.id)!.tooltip).toContain(`ID: ${first.id}`);
  });
});
