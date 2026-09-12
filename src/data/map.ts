import type { MapNode } from '../types';
import { categories } from './categories';
import { stacks } from './stacks';

/** The map holds references only; the canonical taxonomy determines every parent. */
function categoryNode(categoryId: string, ancestors = new Set<string>()): MapNode {
  if (ancestors.has(categoryId)) throw new Error(`Category cycle: ${categoryId}`);
  const next = new Set([...ancestors, categoryId]);
  return { kind: 'category', categoryId, children: [
    ...stacks.filter((stack) => stack.categoryId === categoryId).map((stack): MapNode => ({ kind: 'stack', stackId: stack.id })),
    ...categories.filter((category) => category.parentCategoryId === categoryId).map((category) => categoryNode(category.id, next)),
  ] };
}

export const stackMap: MapNode = {
  kind: 'group', id: 'web-development-stack', label: 'Web開発周辺スタック',
  description: '分類から具体的な技術へ、役割の違いをたどるための全体地図',
  children: categories.filter((category) => !category.parentCategoryId).map((category) => categoryNode(category.id)),
};
