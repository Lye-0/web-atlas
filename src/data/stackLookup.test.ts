import { describe, expect, it } from 'vitest';
import { findCanonicalStackByAlias, findCanonicalStackByPackageName, findCanonicalStackByPackageOrAlias } from './index';

describe('canonical Dictionary Stack lookup', () => {
  it('matches exact package names and aliases to stable Stack IDs', () => {
    expect(findCanonicalStackByPackageName('react')).toMatchObject({ id: 'react', categoryId: 'ui-library' });
    expect(findCanonicalStackByPackageOrAlias('@react-three/fiber')).toMatchObject({ id: 'react-three-fiber' });
    expect(findCanonicalStackByAlias('Vite.js')).toMatchObject({ id: 'vite', categoryId: 'build-tool' });
  });

  it('does not resolve ambiguous or unknown Analyzer tokens', () => {
    expect(findCanonicalStackByPackageOrAlias('firebase')).toBeUndefined();
    expect(findCanonicalStackByPackageOrAlias('workspace-local-package')).toBeUndefined();
  });
});
