import { categories } from './categories';
import { stackMap } from './map';
import { stacks } from './stacks';
import { assertValidDictionary } from './validateDictionary';

assertValidDictionary(categories, stacks, stackMap);

export { categories, stackMap, stacks };
export { assertValidDictionary, DictionaryValidationError, validateDictionary } from './validateDictionary';

export const categoryById = new Map(categories.map((category) => [category.id, category]));
export const stackById = new Map(stacks.map((stack) => [stack.id, stack]));

export const getCategory = (id: string) => categoryById.get(id);
export const getStack = (id: string) => stackById.get(id);

export const stacksForCategory = (categoryId: string) => stacks.filter((stack) => stack.categoryId === categoryId);
