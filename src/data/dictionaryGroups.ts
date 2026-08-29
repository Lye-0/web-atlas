import type { CategoryEntry } from '../types';

export interface DictionaryVisualGroup {
  id: string;
  label: string;
  description: string;
  rootCategoryIds: string[];
}

/**
 * Presentation-only groups shared by the map, category index, and stack filter.
 * These groups do not replace the canonical Category parent/child taxonomy.
 */
export const dictionaryVisualGroups: DictionaryVisualGroup[] = [
  {
    id: 'language-runtime',
    label: '言語と実行基盤',
    description: 'コードを書く・動かす・依存を揃える',
    rootCategoryIds: ['markup-language', 'stylesheet-language', 'programming-language', 'runtime', 'package-manager'],
  },
  {
    id: 'application',
    label: 'UIとアプリケーション',
    description: '画面、アプリの構成、開発ツール',
    rootCategoryIds: ['framework', 'library', 'ui-component-system', 'build-tool', 'auth-service'],
  },
  {
    id: 'data',
    label: 'データとストレージ',
    description: 'データを扱い、保存する仕組み',
    rootCategoryIds: ['database', 'storage'],
  },
  {
    id: 'quality',
    label: '品質と検証',
    description: '動作を確かめ、コードを整える',
    rootCategoryIds: ['testing', 'code-quality'],
  },
  {
    id: 'delivery',
    label: '開発と配信',
    description: '変更を共有し、実行環境へ届ける',
    rootCategoryIds: ['version-control', 'development-platform', 'ci-cd', 'container', 'deployment-platform'],
  },
];

export function validateDictionaryVisualGroups(
  groups: DictionaryVisualGroup[],
  categories: CategoryEntry[],
): string[] {
  const errors: string[] = [];
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const rootCategoryIds = new Set(categories.filter((category) => !category.parentCategoryId).map((category) => category.id));
  const seenGroupIds = new Set<string>();
  const seenRootCategoryIds = new Set<string>();

  for (const group of groups) {
    if (seenGroupIds.has(group.id)) errors.push(`Visual group ID is duplicated: ${group.id}`);
    seenGroupIds.add(group.id);

    if (group.rootCategoryIds.length === 0) errors.push(`Visual group has no root category: ${group.id}`);

    for (const categoryId of group.rootCategoryIds) {
      const category = categoryById.get(categoryId);
      if (!category) {
        errors.push(`Visual group ${group.id} refers to missing category ${categoryId}`);
        continue;
      }
      if (category.parentCategoryId) {
        errors.push(`Visual group ${group.id} refers to non-root category ${categoryId}`);
      }
      if (seenRootCategoryIds.has(categoryId)) {
        errors.push(`Root category is assigned to multiple visual groups: ${categoryId}`);
      }
      seenRootCategoryIds.add(categoryId);
    }
  }

  for (const categoryId of rootCategoryIds) {
    if (!seenRootCategoryIds.has(categoryId)) {
      errors.push(`Root category is not assigned to a visual group: ${categoryId}`);
    }
  }

  for (const categoryId of seenRootCategoryIds) {
    if (!rootCategoryIds.has(categoryId)) {
      errors.push(`Visual group references a category outside the canonical roots: ${categoryId}`);
    }
  }

  return errors;
}
