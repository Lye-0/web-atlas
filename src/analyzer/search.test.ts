import { describe, expect, it } from 'vitest';
import { analyzerEntitySearchDocument, compareAnalyzerSearchResults, matchAnalyzerSearch } from './search';
import type { AnalyzerViewNode } from './types';

describe('Analyzer names, commands and paths', () => {
  const node: AnalyzerViewNode = { id: 'opaque-private-id', type: 'package-script', label: 'build', evidenceIds: [],
    metadata: { command: 'pnpm --filter workspace run compile', packagePath: 'packages/long-name', aliases: ['compile-assets'], sourceFactIds: ['opaque-fact-id'], executionRank: 9876 } };
  it('matches declared command, alias and path without indexing opaque metadata', () => {
    const document = analyzerEntitySearchDocument(node);
    for (const query of ['build', 'compile-assets', 'pnpm workspace', 'packages\\long-name']) expect(matchAnalyzerSearch(document, query)).toBeDefined();
    for (const query of ['opaque-private-id', 'opaque-fact-id', '9876']) expect(matchAnalyzerSearch(document, query)).toBeUndefined();
    const pattern = analyzerEntitySearchDocument({ ...node, type: 'workspace-pattern', label: 'packages/*', subtitle: 'workspace:internal-config', metadata: {} });
    expect(matchAnalyzerSearch(pattern, 'workspace:internal-config')).toBeUndefined();
    expect(matchAnalyzerSearch(pattern, 'packages/*')).toBeDefined();
  });
  it('ranks exact names first and disambiguates identical names by path without merging them', () => {
    const nodes = [{ ...node, id: 'b', metadata: { packagePath: 'packages/b' } }, { ...node, id: 'a', metadata: { packagePath: 'packages/a' } }, { ...node, id: 'c', label: 'build assets' }];
    const results = nodes.map(item => ({ id: item.id, label: item.label, path: String(item.metadata.packagePath ?? ''), match: matchAnalyzerSearch(analyzerEntitySearchDocument(item), 'build')! })).sort(compareAnalyzerSearchResults);
    expect(results.map(result => result.id)).toEqual(['a', 'b', 'c']);
    expect(node.metadata.command).toBe('pnpm --filter workspace run compile');
  });
});
