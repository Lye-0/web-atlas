export const dictionaryRoutes = {
  map: '/dictionary/map',
  categories: '/dictionary/categories',
  stacks: '/dictionary/stacks',
} as const;

export const analyzerRoot = '/analyzer';

export const analyzerRoutes = {
  architecture: '/analyzer/architecture',
  workspace: '/analyzer/workspace',
  command: '/analyzer/command',
  dependencies: '/analyzer/dependencies',
  'module-dependency': '/analyzer/module-dependency',
  'runtime-flow': '/analyzer/runtime-flow',
  'function-call-flow': '/analyzer/function-call-flow',
  'data-flow': '/analyzer/data-flow',
  'data-model': '/analyzer/data-model',
  'architecture-map': '/analyzer/architecture-map',
} as const;

export const categoryPath = (categoryId: string) => `${dictionaryRoutes.categories}/${encodeURIComponent(categoryId)}`;
export const stackPath = (stackId: string) => `${dictionaryRoutes.stacks}/${encodeURIComponent(stackId)}`;
