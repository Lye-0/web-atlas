export const dictionaryRoutes = {
  map: '/dictionary/map',
  categories: '/dictionary/categories',
  stacks: '/dictionary/stacks',
} as const;

export const categoryPath = (categoryId: string) => `${dictionaryRoutes.categories}/${encodeURIComponent(categoryId)}`;
export const stackPath = (stackId: string) => `${dictionaryRoutes.stacks}/${encodeURIComponent(stackId)}`;
