import { describe, expect, it } from 'vitest';
import type { AnalyzerEvidence } from './types';
import { moduleRelationEvidenceCounts } from './moduleAutoAggregation';

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
