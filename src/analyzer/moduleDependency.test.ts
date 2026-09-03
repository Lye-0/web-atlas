import { describe, expect, it } from 'vitest';
import { layoutAnalyzerView } from './layout';
import { projectModuleDependency } from './projectors';
import { scanProjectFiles } from './scan';
import { moduleIdForPath } from './moduleResolver';
import type { AnalyzerSourceFile } from './types';

function file(relativePath: string, source: string): AnalyzerSourceFile {
  return {
    relativePath,
    name: relativePath.split('/').at(-1) ?? relativePath,
    extension: `.${relativePath.split('.').at(-1) ?? ''}`,
    size: source.length,
    readText: async () => source,
  };
}

describe('Module Dependency view', () => {
  it('creates source modules, typed dependency facts, and nested directory Regions', async () => {
    const store = await scanProjectFiles([
      file('package.json', '{"name":"fixture"}'),
      file('src/a.ts', `import './b';\nimport type { B } from './b';\nexport * from './folder';\nvoid import('./lazy');\nconst required = require('./common');\nvoid import(\`./views/\${name}\`);`),
      file('src/b.ts', ''),
      file('src/folder/index.ts', ''),
      file('src/lazy.ts', ''),
      file('src/common.ts', ''),
    ]);
    const moduleFacts = store.facts.filter((fact) => fact.kind === 'module');
    const dependencyFacts = store.facts.filter((fact) => fact.kind === 'module-dependency');
    expect(moduleFacts.map((fact) => fact.id)).toEqual([
      'module:src/a.ts',
      'module:src/b.ts',
      'module:src/common.ts',
      'module:src/folder/index.ts',
      'module:src/lazy.ts',
    ]);
    expect(dependencyFacts).toHaveLength(5);
    expect(store.relations.filter((relation) => relation.kind === 'imports')).toHaveLength(5);
    const view = projectModuleDependency(store);
    expect(view.nodes.map((node) => node.id)).toContain(moduleIdForPath('src/a.ts'));
    expect(view.edges.every((edge) => edge.kind === 'imports')).toBe(true);
    expect(view.regions?.some((region) => region.regionKind === 'directory')).toBe(true);
    expect(view.regions?.some((region) => Array.isArray(region.metadata.compressedPaths))).toBe(true);
  });

  it('resolves a local workspace package entry without creating external module nodes', async () => {
    const store = await scanProjectFiles([
      file('package.json', '{"name":"root"}'),
      file('pnpm-workspace.yaml', 'packages:\n  - apps/*\n  - packages/*\n'),
      file('apps/app/package.json', '{"name":"@fixture/app"}'),
      file('apps/app/src/app.ts', `import { shared } from '@fixture/shared';\nexport { shared };`),
      file('packages/shared/package.json', '{"name":"@fixture/shared"}'),
      file('packages/shared/src/index.ts', 'export const shared = true;'),
      file('apps/app/src/external.ts', `import React from 'react';`),
    ]);
    const view = projectModuleDependency(store);
    expect(view.edges.some((edge) => edge.sourceId === moduleIdForPath('apps/app/src/app.ts') && edge.targetId === moduleIdForPath('packages/shared/src/index.ts'))).toBe(true);
    expect(view.nodes.some((node) => node.label === 'React')).toBe(false);
    const appRegion = view.regions?.find((region) => region.metadata.packagePath === 'apps/app');
    expect(appRegion?.regionKind).toBe('workspace-package');
    expect(layoutAnalyzerView(view)).toEqual(layoutAnalyzerView(view));
  });

  it('packs a dense directory into a compact far map and restores modules when expanded', async () => {
    const denseFiles = Array.from({ length: 240 }, (_, index) => file(
      `src/dense/module-${String(index).padStart(3, '0')}.ts`,
      '',
    ));
    const store = await scanProjectFiles([
      file('package.json', '{"name":"dense-fixture"}'),
      ...denseFiles,
    ]);
    const view = projectModuleDependency(store);
    const denseRegion = view.regions?.find((region) => region.metadata.directoryPath === 'src/dense');
    expect(denseRegion).toBeDefined();
    const collapsed = layoutAnalyzerView(view);
    const expanded = layoutAnalyzerView(view, new Set([denseRegion!.id]));
    expect(collapsed.nodes).toHaveLength(0);
    expect(collapsed.width).toBeLessThan(1000);
    expect(expanded.nodes).toHaveLength(240);
    expect(expanded.width).toBeGreaterThan(collapsed.width);
    expect(layoutAnalyzerView(view, new Set([denseRegion!.id]))).toEqual(expanded);
  });
});
