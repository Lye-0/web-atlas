import { categories } from './categories';
import { dictionaryVisualGroups, validateDictionaryVisualGroups } from './dictionaryGroups';
import { stackMap } from './map';
import { stacks } from './stacks';
import { assertValidDictionary } from './validateDictionary';
import type { StackEntry } from '../types';

assertValidDictionary(categories, stacks, stackMap);
const visualGroupErrors = validateDictionaryVisualGroups(dictionaryVisualGroups, categories);
if (visualGroupErrors.length > 0) {
  throw new Error(`Dictionary visual groups are invalid:\n${visualGroupErrors.map((error) => `- ${error}`).join('\n')}`);
}

export { categories, dictionaryVisualGroups, stackMap, stacks };
export { validateDictionaryVisualGroups } from './dictionaryGroups';
export { assertValidDictionary, DictionaryValidationError, validateDictionary } from './validateDictionary';

export const categoryById = new Map(categories.map((category) => [category.id, category]));
export const stackById = new Map(stacks.map((stack) => [stack.id, stack]));

export const getCategory = (id: string) => categoryById.get(id);
export const getStack = (id: string) => stackById.get(id);

export const stacksForCategory = (categoryId: string) => stacks.filter((stack) => stack.categoryId === categoryId);

const normalizeStackLookupValue = (value: string): string => value.trim().toLowerCase();

// `firebase` is intentionally kept as an Analyzer primary product token. It
// is also listed by the Firebase Authentication entry for search purposes,
// so a bare package name cannot safely identify one Dictionary Stack.
const ambiguousAnalyzerStackTokens = new Set(['firebase']);

function uniqueStackMatch(value: string, valuesForStack: (stack: StackEntry) => string[] | undefined): StackEntry | undefined {
  const normalizedValue = normalizeStackLookupValue(value);
  if (!normalizedValue || ambiguousAnalyzerStackTokens.has(normalizedValue)) return undefined;
  const matches = stacks.filter((stack) => valuesForStack(stack)?.some((candidate) => normalizeStackLookupValue(candidate) === normalizedValue));
  return matches.length === 1 ? matches[0] : undefined;
}

export function findCanonicalStackByPackageName(packageName: string): StackEntry | undefined {
  return uniqueStackMatch(packageName, (stack) => stack.packageNames);
}

export function findCanonicalStackByAlias(alias: string): StackEntry | undefined {
  return uniqueStackMatch(alias, (stack) => stack.aliases);
}

export function findCanonicalStackByPackageOrAlias(value: string): StackEntry | undefined {
  return uniqueStackMatch(value, (stack) => [...(stack.packageNames ?? []), ...(stack.aliases ?? [])]);
}
