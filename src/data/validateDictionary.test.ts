import { describe, expect, it } from 'vitest';
import { categories, stackMap, stacks, validateDictionary } from './index';

describe('dictionary data', () => {
  it('contains the complete Phase 1 catalogue without broken references', () => {
    expect(categories).toHaveLength(43);
    expect(stacks).toHaveLength(48);
    expect(validateDictionary(categories, stacks, stackMap)).toEqual([]);
  });

  it('detects duplicate package ownership and missing relations', () => {
    const errors = validateDictionary(
      [{
        id: 'sample-category',
        name: 'サンプル',
        summary: 'summary',
        description: 'description',
        role: 'role',
        useCases: ['use case'],
        differences: [],
      }],
      [{
        id: 'sample-stack',
        name: 'Sample',
        categoryId: 'sample-category',
        summary: 'summary',
        description: 'description',
        features: [],
        useCases: [],
        responsibilities: [],
        packageNames: ['sample-package'],
        relationships: [{ targetStackId: 'missing-stack', kind: 'related-to', label: 'broken' }],
        relatedStackIds: ['missing-stack'],
        status: 'active',
      }, {
        id: 'sample-stack-two',
        name: 'Sample Two',
        categoryId: 'sample-category',
        summary: 'summary',
        description: 'description',
        features: [],
        useCases: [],
        responsibilities: [],
        packageNames: ['sample-package'],
        status: 'active',
      }],
      { kind: 'group', id: 'root', label: 'root', children: [] },
    );

    expect(errors).toEqual(expect.arrayContaining([
      'Stack sample-stack refers to missing related stack missing-stack',
      'Stack sample-stack refers to missing relationship target missing-stack',
      'Package name sample-package is assigned to both sample-stack and sample-stack-two',
      'Category sample-category is not present in the map',
      'Stack sample-stack is not present in the map',
    ]));
  });
});
