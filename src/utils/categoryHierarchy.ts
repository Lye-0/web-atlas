import { categories, categoryById } from '../data';
import type { CategoryEntry, CategoryId } from '../types';

export interface CategoryTreeNode {
  category: CategoryEntry;
  children: CategoryTreeNode[];
}

const childrenByParent = new Map<CategoryId, CategoryEntry[]>();

for (const category of categories) {
  if (!category.parentCategoryId) continue;
  const children = childrenByParent.get(category.parentCategoryId) ?? [];
  children.push(category);
  childrenByParent.set(category.parentCategoryId, children);
}

export const getCategoryChildren = (categoryId: CategoryId) => childrenByParent.get(categoryId) ?? [];

const makeTree = (category: CategoryEntry): CategoryTreeNode => ({
  category,
  children: getCategoryChildren(category.id).map(makeTree),
});

export const categoryTrees: CategoryTreeNode[] = categories
  .filter((category) => !category.parentCategoryId)
  .map(makeTree);

export const categoryTreeById = new Map(
  categoryTrees.map((tree) => [tree.category.id, tree]),
);

export function getRootCategoryId(categoryId: CategoryId): CategoryId {
  let current = categoryById.get(categoryId);
  const visited = new Set<CategoryId>();

  while (current?.parentCategoryId && !visited.has(current.id)) {
    visited.add(current.id);
    const parent = categoryById.get(current.parentCategoryId);
    if (!parent) break;
    current = parent;
  }

  return current?.id ?? categoryId;
}

export function getCategoryDepth(categoryId: CategoryId): number {
  let depth = 0;
  let current = categoryById.get(categoryId);
  const visited = new Set<CategoryId>();

  while (current?.parentCategoryId && !visited.has(current.id)) {
    visited.add(current.id);
    depth += 1;
    current = categoryById.get(current.parentCategoryId);
  }

  return depth;
}
