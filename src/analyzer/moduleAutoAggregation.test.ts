import { describe, expect, it } from 'vitest';
import type { AnalyzerEvidence } from './types';
import { moduleAggregateRegions, moduleRelationEvidenceCounts } from './moduleAutoAggregation';
import type { PositionedNode, PositionedSemanticRegion } from './layout';
import type { DisplayAggregation } from './autoAggregation';

describe('module aggregate heading ownership', () => {
  const file = (id: string, regionPath: string[]): PositionedNode => ({ x: 0, y: 0, height: 36,
    node: { id, label: id, type: 'module', evidenceIds: [], metadata: { regionPath } } });
  const region = (id: string): PositionedSemanticRegion => ({ x: 0, y: 0, width: 300, height: 200, headingHeight: 30, memberGap: 10,
    region: { id, label: id, entityKind: 'region', regionKind: 'directory', childIds: [], ports: [], selectable: true, evidenceIds: [], metadata: {} } });
  const group: DisplayAggregation = { id: 'display', groupId: 'group', label: 'src', memberIds: ['a', 'b'], matchingCount: 0, mode: 'automatic', x: 0, y: 0, z: 0 };
  const regions = ['package', 'src', 'src/a', 'src/b', 'other-package'].map(region);

  it('uses the common ancestor of files across subdirectories without changing membership', () => {
    const files = [file('a', ['package', 'src', 'src/a']), file('b', ['package', 'src', 'src/b'])];
    expect(moduleAggregateRegions([group], files, regions).get('display')?.region.id).toBe('src');
    expect(group.memberIds).toEqual(['a', 'b']);
  });

  it('attaches manual collapsed groups to the nearest visible common ancestor', () => {
    const files = [file('a', ['package', 'src', 'src/a']), file('b', ['package', 'src', 'src/a'])];
    expect(moduleAggregateRegions([{ ...group, mode: 'manual' }], files, regions.filter(r => r.region.id !== 'src/a')).get('display')?.region.id).toBe('src');
  });

  it('does not use matching labels or the first file to invent an owner across packages', () => {
    expect(moduleAggregateRegions([group], [file('a', ['package']), file('b', ['other-package'])], regions).size).toBe(0);
    expect(moduleAggregateRegions([group], [file('a', ['package'])], regions).size).toBe(0);
  });
});

describe('module aggregation Evidence units', () => {
  const evidence = (id: string, line: number, filePath = 'src/main.ts'): AnalyzerEvidence => ({ id, filePath, contextStartLine: line, contextEndLine: line,
    highlightRanges: [{ start: { line, column: 1 }, end: { line, column: 16 } }], kind: 'module', detectorId: 'fixture' });

  it('counts separate Evidence records at the same source range as one source site', () => {
    const records = [evidence('a', 1), evidence('b', 1)];
    expect(moduleRelationEvidenceCounts({ evidenceIds: ['a', 'b', 'a'] }, new Map(records.map(item => [item.id, item])))).toEqual({ evidenceCount: 2, siteCount: 1 });
  });

  it('counts distinct files and multiple recorded source ranges independently', () => {
    const first = evidence('a', 1), second = evidence('b', 1, 'src/other.ts');
    first.highlightRanges.push({ start: { line: 2, column: 1 }, end: { line: 2, column: 16 } });
    expect(moduleRelationEvidenceCounts({ evidenceIds: ['a', 'b'] }, new Map([['a', first], ['b', second]]))).toEqual({ evidenceCount: 2, siteCount: 3 });
  });

  it('distinguishes missing ranges from a genuinely empty Evidence collection', () => {
    expect(moduleRelationEvidenceCounts({ evidenceIds: [] }, new Map())).toEqual({ evidenceCount: 0, siteCount: 0 });
    expect(moduleRelationEvidenceCounts({ evidenceIds: ['missing'] }, new Map())).toEqual({ evidenceCount: 1 });
    const noRange = { ...evidence('a', 1), highlightRanges: [] };
    expect(moduleRelationEvidenceCounts({ evidenceIds: ['a'] }, new Map([['a', noRange]]))).toEqual({ evidenceCount: 1 });
  });
});
