import type { AnalyzerSemanticRegion, AnalyzerViewNode } from './types';

export interface AnalyzerSearchDocument {
  names: string[];
  paths?: string[];
  groups?: string[];
  fields?: string[];
}
export interface AnalyzerSearchMatch { rank: number; reason: string; fields: string[] }

/** Literal, case-insensitive AND search. Normalization never changes canonical data. */
export function normalizeAnalyzerQuery(value: string): string {
  return value.trim().replaceAll('\\', '/').replace(/\s+/g, ' ').toLocaleLowerCase();
}

export function matchAnalyzerSearch(document: AnalyzerSearchDocument, query: string): AnalyzerSearchMatch | undefined {
  const normalized = normalizeAnalyzerQuery(query);
  if (!normalized) return undefined;
  const tokens = normalized.split(' ');
  const sections = [
    ['名前', document.names], ['パス', document.paths ?? []],
    ['所属', document.groups ?? []], ['フィールド', document.fields ?? []],
  ] as const;
  const fields = new Set<string>();
  for (const token of tokens) {
    const match = sections.find(([, values]) => values.some(value => normalizeAnalyzerQuery(value).includes(token)));
    if (!match) return undefined;
    fields.add(match[0]);
  }
  const names = document.names.map(normalizeAnalyzerQuery);
  const rank = names.includes(normalized) ? 0 : names.some(name => name.startsWith(normalized)) ? 1
    : tokens.every(token => names.some(name => name.includes(token))) ? 2 : 3;
  return { rank, reason: [...fields].filter(field => field !== '名前').map(field => `${field}で一致`).join(' · '), fields: [...fields] };
}

export function moduleSearchDocument(node: AnalyzerViewNode): AnalyzerSearchDocument {
  const strings = (keys: string[]) => keys.flatMap(key => typeof node.metadata[key] === 'string' ? [node.metadata[key] as string] : []);
  return { names: [node.label], paths: strings(['modulePath', 'directoryPath']), groups: strings(['packageName', 'packagePath']) };
}

/** Search only user-facing names, declared commands and paths, never opaque metadata. */
export function analyzerEntitySearchDocument(node: AnalyzerViewNode | AnalyzerSemanticRegion): AnalyzerSearchDocument {
  if ('type' in node && node.type === 'module') return moduleSearchDocument(node);
  const strings = (keys: string[]) => keys.flatMap(key => {
    const value = node.metadata[key];
    return typeof value === 'string' ? [value] : Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  });
  return {
    names: [node.label, ...strings(['aliases', 'alias', 'packageName', 'stackName'])],
    paths: strings(['filePath', 'scopePath', 'packagePath', 'directoryPath', 'modulePath', 'configPath']),
    groups: strings(['scopeLabel', 'workspaceName']),
    fields: [
      ...('type' in node && node.type === 'workspace-pattern' ? [] : [node.subtitle ?? '']),
      ...strings(['command', 'rawCommand', 'scriptName', 'pattern', 'specifier', 'versionRange', 'versionRanges', 'toolName', 'packageSelector']),
    ],
  };
}

export function compareAnalyzerSearchResults(
  first: { match: AnalyzerSearchMatch; label: string; path?: string; id: string },
  second: { match: AnalyzerSearchMatch; label: string; path?: string; id: string },
): number {
  return first.match.rank - second.match.rank || first.label.localeCompare(second.label)
    || (first.path ?? '').localeCompare(second.path ?? '') || first.id.localeCompare(second.id);
}
