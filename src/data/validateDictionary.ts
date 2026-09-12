import type { CategoryEntry, MapNode, StackEntry } from '../types';

const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class DictionaryValidationError extends Error {
  constructor(public readonly errors: string[]) {
    super(`Dictionary data is invalid:\n${errors.map((error) => `- ${error}`).join('\n')}`);
    this.name = 'DictionaryValidationError';
  }
}

const duplicateIds = (ids: string[], label: string, errors: string[]) => {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) errors.push(`${label} ID is duplicated: ${id}`);
    seen.add(id);
  }
};

const walkMap = (node: MapNode, categoryIds: string[], stackIds: string[]) => {
  if (node.kind === 'group') {
    node.children.forEach((child) => walkMap(child, categoryIds, stackIds));
  } else if (node.kind === 'category') {
    categoryIds.push(node.categoryId);
    node.children.forEach((child) => walkMap(child, categoryIds, stackIds));
  } else {
    stackIds.push(node.stackId);
  }
};

export function validateDictionary(
  categories: CategoryEntry[],
  stacks: StackEntry[],
  map: MapNode,
): string[] {
  const errors: string[] = [];
  const categoryIds = categories.map(({ id }) => id);
  const stackIds = stacks.map(({ id }) => id);
  const categoryIdSet = new Set(categoryIds);
  const stackIdSet = new Set(stackIds);

  duplicateIds(categoryIds, 'Category', errors);
  duplicateIds(stackIds, 'Stack', errors);

  for (const category of categories) {
    if (!idPattern.test(category.id)) errors.push(`Category ID cannot be used in a URL: ${category.id}`);
    if (category.parentCategoryId && !categoryIdSet.has(category.parentCategoryId)) {
      errors.push(`Category ${category.id} refers to missing parent category ${category.parentCategoryId}`);
    }
    for (const relatedId of category.relatedCategoryIds ?? []) {
      if (!categoryIdSet.has(relatedId)) errors.push(`Category ${category.id} refers to missing related category ${relatedId}`);
    }
  }

  const packageOwners = new Map<string, string>();
  const aliases = new Map<string, Set<string>>();
  for (const stack of stacks) {
    if (!idPattern.test(stack.id)) errors.push(`Stack ID cannot be used in a URL: ${stack.id}`);
    if (!categoryIdSet.has(stack.categoryId)) {
      errors.push(`Stack ${stack.id} refers to missing category ${stack.categoryId}`);
    }
    for (const relatedId of stack.relatedStackIds ?? []) {
      if (!stackIdSet.has(relatedId)) errors.push(`Stack ${stack.id} refers to missing related stack ${relatedId}`);
    }
    for (const relationship of stack.relationships ?? []) {
      if (!stackIdSet.has(relationship.targetStackId)) {
        errors.push(`Stack ${stack.id} refers to missing relationship target ${relationship.targetStackId}`);
      }
    }
    for (const packageName of stack.packageNames ?? []) {
      const normalized = packageName.trim().toLowerCase();
      const previousOwner = packageOwners.get(normalized);
      if (previousOwner && previousOwner !== stack.id) {
        errors.push(`Package name ${packageName} is assigned to both ${previousOwner} and ${stack.id}`);
      }
      packageOwners.set(normalized, stack.id);
    }
    for (const alias of stack.aliases ?? []) { const normalized = alias.trim().toLowerCase(); aliases.set(normalized, new Set([...(aliases.get(normalized) ?? []), stack.id])); }
  }
  for (const [alias, owners] of aliases) {
    if (owners.size < 2) continue;
    // Legacy search-only term. Lookup deliberately returns no canonical product.
    if (alias === 'cloud storage' && [...owners].every(id => ['firebase-storage', 'google-cloud-storage'].includes(id))) continue;
    errors.push(`Alias ${alias} is assigned to multiple stacks: ${[...owners].join(', ')}`);
  }

  const mapCategoryIds: string[] = [];
  const mapStackIds: string[] = [];
  walkMap(map, mapCategoryIds, mapStackIds);
  duplicateIds(mapCategoryIds, 'Map category', errors);
  duplicateIds(mapStackIds, 'Map stack', errors);
  for (const id of mapCategoryIds) {
    if (!categoryIdSet.has(id)) errors.push(`Map refers to missing category ${id}`);
  }
  for (const id of mapStackIds) {
    if (!stackIdSet.has(id)) errors.push(`Map refers to missing stack ${id}`);
  }
  for (const id of categoryIds) {
    if (!mapCategoryIds.includes(id)) errors.push(`Category ${id} is not present in the map`);
  }
  for (const id of stackIds) {
    if (!mapStackIds.includes(id)) errors.push(`Stack ${id} is not present in the map`);
  }

  const categoryById = new Map(categories.map(category => [category.id, category]));
  const stackById = new Map(stacks.map(stack => [stack.id, stack]));
  const checkParents = (node: MapNode, parentCategoryId?: string): void => {
    if (node.kind === 'stack') {
      if (stackById.has(node.stackId) && stackById.get(node.stackId)?.categoryId !== parentCategoryId) errors.push(`Map stack ${node.stackId} has an incorrect category parent`);
      return;
    }
    if (node.kind === 'category') {
      if (categoryById.has(node.categoryId) && categoryById.get(node.categoryId)?.parentCategoryId !== parentCategoryId) errors.push(`Map category ${node.categoryId} has an incorrect category parent`);
      node.children.forEach(child => checkParents(child, node.categoryId));
    } else node.children.forEach(child => checkParents(child, parentCategoryId));
  };
  checkParents(map);
  for (const category of categories) {
    const ancestors = new Set<string>([category.id]); let parent = category.parentCategoryId;
    while (parent) { if (ancestors.has(parent)) { errors.push(`Category parent cycle: ${category.id}`); break; } ancestors.add(parent); parent = categoryById.get(parent)?.parentCategoryId; }
  }

  return errors;
}

export function assertValidDictionary(categories: CategoryEntry[], stacks: StackEntry[], map: MapNode): void {
  const errors = validateDictionary(categories, stacks, map);
  if (errors.length > 0) throw new DictionaryValidationError(errors);
}
