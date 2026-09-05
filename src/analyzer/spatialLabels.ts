import type { AnalyzerSemanticRegion } from './types';

export function tokenizeDisplayPath(name: string): string[] {
  return name
    .replace(/^@/, '')
    .split(/[\\/]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

/**
 * Shortest unique suffix among a set of path-like names.
 * A single name keeps its original spelling so a lone package is not abbreviated.
 */
export function shortestUniqueSuffixes(names: readonly string[]): string[] {
  if (names.length === 0) return [];
  if (names.length === 1) return [names[0]!];
  const tokenized = names.map(tokenizeDisplayPath);
  return tokenized.map((segments, index) => {
    if (segments.length === 0) return names[index]!;
    for (let count = 1; count <= segments.length; count += 1) {
      const suffix = segments.slice(-count);
      const key = suffix.join('\0').toLowerCase();
      const collision = tokenized.some((other, otherIndex) => {
        if (otherIndex === index || other.length < count) return false;
        return other.slice(-count).join('\0').toLowerCase() === key;
      });
      if (!collision) return suffix.join(' / ');
    }
    return names[index]!;
  });
}

export function regionIdentityPath(region: AnalyzerSemanticRegion): string {
  const directoryPath = region.metadata.directoryPath;
  if (typeof directoryPath === 'string' && directoryPath.trim()) return directoryPath;
  if (region.regionKind === 'workspace-package') {
    const packagePath = region.metadata.packagePath;
    return region.label || (typeof packagePath === 'string' ? packagePath : region.id);
  }
  return region.subtitle || region.label;
}

export function shortestUniqueRegionLabels(regions: readonly AnalyzerSemanticRegion[]): Map<string, string> {
  const unique = shortestUniqueSuffixes(regions.map(regionIdentityPath));
  return new Map(regions.map((region, index) => [region.id, unique[index] ?? region.label]));
}

export function isRootPackageRegion(region: AnalyzerSemanticRegion): boolean {
  if (region.regionKind !== 'workspace-package') return false;
  if (region.metadata.isRoot === true) return true;
  const packagePath = region.metadata.packagePath;
  if (packagePath === '.' || packagePath === '') return true;
  const role = region.metadata.role;
  if (typeof role === 'string' && /\broot\b/i.test(role)) return true;
  const displayRole = region.metadata.displayRole;
  return typeof displayRole === 'string' && displayRole.toUpperCase().includes('ROOT');
}

export function regionDisplayLabel(
  region: AnalyzerSemanticRegion,
  uniqueLabels: ReadonlyMap<string, string>,
  zoomLevel: 'far' | 'medium' | 'near',
): string {
  if (zoomLevel === 'far' && isRootPackageRegion(region)) return 'ROOT';
  return uniqueLabels.get(region.id) ?? region.label;
}

export function spatialCountNoun(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

export function spatialPackageHeadingCount(zoomLevel: 'far' | 'medium' | 'near', moduleCount: number): string {
  if (zoomLevel === 'far') return `· ${moduleCount}`;
  return `· ${moduleCount} ${spatialCountNoun(moduleCount, 'module', 'modules')}`;
}

export function spatialRegionHeadingWidth(
  label: string,
  countText = '',
  scale = 1,
  includeToggle = true,
): number {
  const chrome = includeToggle ? 50 : 36;
  const textWidth = (label.length + countText.length) * 6.6;
  return Math.min(360, Math.max(80, (chrome + textWidth) * scale));
}

export function truncateDistinctFilename(name: string, siblings: readonly string[], maxChars: number): string {
  if (name.length <= maxChars) return name;
  const unique = shortestUniqueSuffixes(siblings.length > 0 ? siblings : [name]);
  const index = siblings.indexOf(name);
  const suffix = unique[index] ?? name;
  if (suffix.length <= maxChars) return suffix;
  const keep = Math.max(4, Math.floor(maxChars / 2));
  const head = Math.max(1, maxChars - keep - 1);
  return `${name.slice(0, head)}…${name.slice(-keep)}`;
}

export function spatialAggregateCaption(options: {
  sourceLabel: string;
  targetLabel: string;
  count: number;
}): string | undefined {
  if (!options.sourceLabel || !options.targetLabel || options.count < 1) return undefined;
  return `${options.sourceLabel} → ${options.targetLabel} · ${options.count}`;
}
