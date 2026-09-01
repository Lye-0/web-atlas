import { describe, expect, it } from 'vitest';
import { getCategory, getStack } from '../data';
import { analyzerRoot, analyzerRoutes, categoryPath, stackPath } from './routes';

describe('dictionary routes', () => {
  it('resolves stable IDs to the expected entries and URLs', () => {
    expect(getCategory('runtime')?.name).toBe('ランタイム');
    expect(getStack('vite')?.name).toBe('Vite');
    expect(categoryPath('build-tool')).toBe('/dictionary/categories/build-tool');
    expect(stackPath('react')).toBe('/dictionary/stacks/react');
  });

  it('encodes route IDs when a future entry contains special characters', () => {
    expect(stackPath('example/stack')).toBe('/dictionary/stacks/example%2Fstack');
    expect(categoryPath('example category')).toBe('/dictionary/categories/example%20category');
  });

  it('keeps Analyzer views on explicit stable routes', () => {
    expect(analyzerRoot).toBe('/analyzer');
    expect(analyzerRoutes).toEqual({
      architecture: '/analyzer/architecture',
      workspace: '/analyzer/workspace',
      command: '/analyzer/command',
      dependencies: '/analyzer/dependencies',
    });
  });
});
