import { categories, stacks } from '../data';
import type { SearchResult } from '../types';
import { categoryPath, stackPath } from './routes';

const normalize = (value: string) => value.trim().toLocaleLowerCase('ja-JP');

interface ScoredResult {
  result: SearchResult;
  score: number;
}

const scoreField = (value: string, query: string, exactScore: number, prefixScore: number, containsScore: number) => {
  const normalized = normalize(value);
  if (normalized === query) return exactScore;
  if (normalized.startsWith(query)) return prefixScore;
  if (normalized.includes(query)) return containsScore;
  return 0;
};

export function searchDictionary(query: string, limit = 8): SearchResult[] {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return [];

  const matches: ScoredResult[] = [];
  for (const category of categories) {
    const nameScore = scoreField(category.name, normalizedQuery, 100, 90, 70);
    const aliasScore = Math.max(
      0,
      ...(category.aliases ?? []).map((alias) => scoreField(alias, normalizedQuery, 88, 78, 62)),
    );
    const summaryScore = scoreField(category.summary, normalizedQuery, 44, 38, 28);
    const score = Math.max(nameScore, aliasScore, summaryScore);
    if (score > 0) {
      matches.push({
        score,
        result: {
          id: category.id,
          kind: 'category',
          name: category.name,
          summary: category.summary,
          href: categoryPath(category.id),
          matchedField: score === nameScore ? 'name' : score === aliasScore ? 'alias' : 'summary',
        },
      });
    }
  }

  for (const stack of stacks) {
    const nameScore = scoreField(stack.name, normalizedQuery, 100, 90, 70);
    const aliasScore = Math.max(0, ...(stack.aliases ?? []).map((alias) => scoreField(alias, normalizedQuery, 88, 78, 62)));
    const packageScore = Math.max(0, ...(stack.packageNames ?? []).map((name) => scoreField(name, normalizedQuery, 86, 76, 60)));
    const summaryScore = scoreField(stack.summary, normalizedQuery, 44, 38, 28);
    const score = Math.max(nameScore, aliasScore, packageScore, summaryScore);
    if (score > 0) {
      matches.push({
        score,
        result: {
          id: stack.id,
          kind: 'stack',
          name: stack.name,
          summary: stack.summary,
          href: stackPath(stack.id),
          matchedField:
            score === nameScore ? 'name' : score === aliasScore ? 'alias' : score === packageScore ? 'package' : 'summary',
        },
      });
    }
  }

  return matches
    .sort((a, b) => b.score - a.score || a.result.name.localeCompare(b.result.name, 'ja'))
    .slice(0, Math.max(1, limit))
    .map(({ result }) => result);
}
