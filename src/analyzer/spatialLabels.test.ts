import { describe, expect, it } from 'vitest';
import { shortestUniqueRegionLabels, shortestUniqueSuffixes, spatialAggregateCaption, spatialPackageHeadingCount, regionDisplayLabel, truncateDistinctFilename } from './spatialLabels';
import type { AnalyzerSemanticRegion } from './types';

function region(id: string, regionKind: AnalyzerSemanticRegion['regionKind'], label: string, extra: AnalyzerSemanticRegion['metadata'] = {}): AnalyzerSemanticRegion {
  return {
    id,
    entityKind: 'region',
    regionKind,
    label,
    childIds: [],
    ports: [],
    selectable: true,
    evidenceIds: [],
    metadata: extra,
  };
}

describe('shortest unique display labels', () => {
  it('disambiguates identical trailing directory names with a short unique path', () => {
    const labels = shortestUniqueSuffixes([
      'apps/api/src',
      'packages/database/src',
      'packages/shared/src',
    ]);
    expect(labels).toEqual(['api / src', 'database / src', 'shared / src']);
    expect(new Set(labels).size).toBe(3);
  });

  it('shortens colliding scoped package names without hardcoding a repository', () => {
    const labels = shortestUniqueSuffixes([
      '@vehicle-management/database',
      '@vehicle-management/shared',
    ]);
    expect(labels).toEqual(['database', 'shared']);
  });

  it('keeps a singleton package name unabbreviated', () => {
    expect(shortestUniqueSuffixes(['@example/git-lines'])).toEqual(['@example/git-lines']);
  });

  it('uses region identity paths for Directory and Package headings', () => {
    const labels = shortestUniqueRegionLabels([
      region('dir:a', 'directory', 'src', { directoryPath: 'apps/api/src' }),
      region('dir:b', 'directory', 'src', { directoryPath: 'packages/database/src' }),
      region('pkg:a', 'workspace-package', '@scope/database'),
      region('pkg:b', 'workspace-package', '@scope/shared'),
    ]);
    expect(labels.get('dir:a')).toBe('api / src');
    expect(labels.get('dir:b')).toBe('database / src');
    expect(labels.get('pkg:a')).toBe('database');
    expect(labels.get('pkg:b')).toBe('shared');
  });

  it('uses ROOT for a root package heading at Far without hardcoding a repository name', () => {
    const unique = shortestUniqueRegionLabels([
      region('pkg:root', 'workspace-package', '@example/app', { packagePath: '.', isRoot: true }),
    ]);
    expect(regionDisplayLabel(
      region('pkg:root', 'workspace-package', '@example/app', { packagePath: '.', isRoot: true }),
      unique,
      'far',
    )).toBe('ROOT');
    expect(spatialPackageHeadingCount('far', 12)).toBe('· 12');
    expect(spatialPackageHeadingCount('near', 1)).toBe('· 1 module');
  });

  it('labels a visible aggregate as a complete source-to-target relation', () => {
    expect(spatialAggregateCaption({
      sourceLabel: 'api',
      targetLabel: 'database',
      count: 22,
    })).toBe('api → database · 22');
    expect(spatialAggregateCaption({ sourceLabel: '', targetLabel: 'database', count: 2 })).toBeUndefined();
  });

  it('preserves unique filename suffixes instead of identical prefixes', () => {
    const labels = ['document-a.ts', 'document-b.ts', 'document-c.ts'].map((name, _, names) => truncateDistinctFilename(name, names, 14));
    expect(new Set(labels).size).toBe(3);
  });

  it('keeps both endpoints in aggregate captions', () => {
    const caption = spatialAggregateCaption({
      sourceLabel: 'api / src',
      targetLabel: 'database / src',
      count: 4,
    });
    expect(caption).toBe('api / src → database / src · 4');
  });
});
