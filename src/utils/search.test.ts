import { describe, expect, it } from 'vitest';
import { searchDictionary } from './search';

describe('searchDictionary', () => {
  it('finds related stacks by name and keeps exact names first', () => {
    const results = searchDictionary('react');
    expect(results.slice(0, 3).map((result) => result.name)).toEqual(['React', 'React DOM', 'React Three Fiber']);
  });

  it('finds a category by its English alias', () => {
    const [result] = searchDictionary('build');
    expect(result).toMatchObject({ kind: 'category', id: 'build-tool', name: 'ビルドツール' });
  });

  it('finds a stack by package name', () => {
    const [result] = searchDictionary('@tanstack/react-query');
    expect(result).toMatchObject({ kind: 'stack', id: 'tanstack-query', matchedField: 'package' });
  });

  it('returns no results for blank input', () => {
    expect(searchDictionary('   ')).toEqual([]);
  });
});
