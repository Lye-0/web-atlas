import { describe, expect, it } from 'vitest';
import { moduleIdForPath, parseModuleImports, resolveModuleGraph, type ModuleResolverPackage, type ModuleResolverSource } from './moduleResolver';

function source(relativePath: string, text: string): ModuleResolverSource {
  return { relativePath, source: text };
}

function packageRecord(packagePath: string, name: string): ModuleResolverPackage {
  return {
    filePath: `${packagePath === '.' ? '' : `${packagePath}/`}package.json`,
    packagePath,
    name,
    packageId: `package:${packagePath}`,
    isWorkspacePackage: true,
    scripts: [],
    dependencies: [],
  };
}

function module(path: string, graph: ReturnType<typeof resolveModuleGraph>) {
  return graph.modules.find((candidate) => candidate.path === path);
}

describe('module resolver', () => {
  it('parses supported import forms without treating comments or strings as imports', () => {
    const imports = parseModuleImports(`
      // import './comment'
      const text = "require('./string')";
      import value from './value';
      import type { Value } from './types';
      export { value } from './re-export';
      export * from './all';
      void import('./lazy');
      void import(\`./views/\${name}\`);
      const required = require('./common');
    `);
    expect(imports.map((item) => [item.kind, item.specifier])).toEqual([
      ['import', './value'],
      ['import-type', './types'],
      ['re-export', './re-export'],
      ['re-export', './all'],
      ['dynamic-import', './lazy'],
      ['dynamic-import', './views/${name}'],
      ['require', './common'],
    ]);
    expect(imports.find((item) => item.specifier === './views/${name}')?.computed).toBe(true);
  });

  it('resolves relative extension, index, type, re-export, dynamic, and require imports', () => {
    const graph = resolveModuleGraph([
      source('src/a.ts', `import './foo';\nimport type { Foo } from './types';\nexport * from './folder';\nvoid import('./lazy');\nconst x = require('./common');`),
      source('src/foo.ts', ''),
      source('src/types.ts', ''),
      source('src/folder/index.ts', ''),
      source('src/lazy.ts', ''),
      source('src/common.ts', ''),
    ]);
    const imports = module('src/a.ts', graph)?.imports ?? [];
    expect(imports.filter((item) => item.resolvedPath).map((item) => [item.kind, item.resolvedPath])).toEqual([
      ['import', 'src/foo.ts'],
      ['import-type', 'src/types.ts'],
      ['re-export', 'src/folder/index.ts'],
      ['dynamic-import', 'src/lazy.ts'],
      ['require', 'src/common.ts'],
    ]);
    expect(imports.every((item) => item.start < item.end)).toBe(true);
  });

  it('does not create an edge for computed or unresolved imports', () => {
    const graph = resolveModuleGraph([
      source('src/a.ts', `void import(\`./views/\${name}\`);\nimport './missing';\nimport 'external-lib';`),
    ]);
    const imports = module('src/a.ts', graph)?.imports ?? [];
    expect(imports).toHaveLength(3);
    expect(imports.map((item) => item.reason)).toEqual(['computed', 'unresolved', 'external']);
    expect(imports.every((item) => !item.resolvedPath)).toBe(true);
  });

  it('resolves deterministic aliases and local workspace package entries', () => {
    const graph = resolveModuleGraph(
      [
        source('apps/web/src/app.ts', `import { shared } from '@workspace/shared';\nimport { util } from '@workspace/shared/util';\nimport local from '@/local';`),
        source('apps/web/src/local.ts', ''),
        source('packages/shared/src/index.ts', ''),
        source('packages/shared/src/util.ts', ''),
      ],
      [packageRecord('.', 'root'), packageRecord('apps/web', '@workspace/web'), packageRecord('packages/shared', '@workspace/shared')],
      [source('apps/web/tsconfig.json', JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } } }))],
    );
    const imports = module('apps/web/src/app.ts', graph)?.imports ?? [];
    expect(imports.find((item) => item.specifier === '@workspace/shared')?.resolvedPath).toBe('packages/shared/src/index.ts');
    expect(imports.find((item) => item.specifier === '@workspace/shared/util')?.resolvedPath).toBe('packages/shared/src/util.ts');
    expect(imports.find((item) => item.specifier === '@/local')?.resolvedPath).toBe('apps/web/src/local.ts');
  });

  it('keeps cycles as stable module-to-module references', () => {
    const graph = resolveModuleGraph([
      source('a.ts', `import './b';`),
      source('b.ts', `import './c';`),
      source('c.ts', `import './a';`),
    ]);
    expect(graph.modules.flatMap((item) => item.imports.filter((entry) => entry.resolvedPath).map((entry) => `${moduleIdForPath(item.path)}>${moduleIdForPath(entry.resolvedPath!)}`))).toEqual([
      'module:a.ts>module:b.ts',
      'module:b.ts>module:c.ts',
      'module:c.ts>module:a.ts',
    ]);
  });
});
