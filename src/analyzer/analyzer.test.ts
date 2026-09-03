import { describe, expect, it } from 'vitest';
import { commandInvocation, parseCommandExpression } from './commandParser';
import { COMMAND_EXECUTABLE_STACK_IDS } from './commandTargets';
import { evidenceRangeLabel, makeEvidence, positionAt } from './evidence';
import { isAnalyzerSourcePath, isAnalyzerUsageSourcePath, isExcludedPath, sourceFilesFromInput } from './fileDiscovery';
import { parseDotnetProject, parsePackageJson, parsePnpmWorkspace, parseWranglerConfig } from './parsers';
import { ANALYZER_COMMAND_COMMON_LANE_ID, projectArchitecture, projectCommand, projectDependencies, projectStackMap, projectWorkspace } from './projectors';
import { analyzerSummarySubtitle, presentationOwnsNode, presentAnalyzerView } from './presentation';
import { scanProjectFiles } from './scan';
import { packageIdForPath, scriptIdFor, type AnalyzerProjectStore, type AnalyzerSourceFile, type AnalyzerViewModel } from './types';
import { ANALYZER_NEAR_NODE_HEIGHT, ANALYZER_NODE_HEIGHT, layoutAnalyzerView, type PositionedGraphEndpoint } from './layout';
import { getStack } from '../data';
import { analyzerEdgeObstacles, analyzerEdgeRoutes, type AnalyzerFanoutRoutingDiagnostic } from './edgeRouting';
import { ANALYZER_FIT_PADDING, fitAnalyzerTransform, focusAnalyzerTransform, preserveAnalyzerTransformOnViewportResize, shouldRunAnalyzerInitialFit } from './camera';
import { analyzerRelationInverseLabels, relationLabelForNode } from './relations';
import { analyzerFocusedEdgeEmphasis } from './focus';
import { ANALYZER_FAR_ZOOM_THRESHOLD, ANALYZER_NEAR_ZOOM_THRESHOLD, displayedZoomLevelForNode, semanticZoomLevelForScale, shouldShowAnalyzerEvidencePreview } from './zoom';

function fixtureFile(relativePath: string, source: string): AnalyzerSourceFile {
  return {
    relativePath,
    name: relativePath.split('/').at(-1) ?? relativePath,
    extension: relativePath.includes('.') ? `.${relativePath.split('.').at(-1)}` : '',
    size: source.length,
    readText: async () => source,
  };
}

function analyzerFixture(): AnalyzerSourceFile[] {
  const rootManifest = JSON.stringify({
    name: 'atlas-root',
    packageManager: 'pnpm@9.12.0',
    scripts: {
      dev: 'concurrently "pnpm --filter @atlas/web dev" "pnpm run typecheck"',
      typecheck: 'pnpm exec tsc --noEmit',
      cycle: 'pnpm run cycle',
    },
    dependencies: {
      react: '^19.1.0',
      firebase: '^12.0.0',
      '@atlas/shared': 'workspace:*',
      'mystery-lib': '^1.0.0',
    },
  }, null, 2);
  return [
    fixtureFile('package.json', rootManifest),
    fixtureFile('pnpm-workspace.yaml', `packages:
  - "apps/*"
  - packages/*
`),
    fixtureFile('apps/web/package.json', `{
  "name": "@atlas/web",
  "scripts": {
    "dev": "pnpm exec vite"
  },
  "dependencies": {
    "@atlas/shared": "workspace:*",
    "react": "^19.1.0",
    "vite": "^7.0.0"
  }
}`),
    fixtureFile('packages/shared/package.json', `{
  "name": "@atlas/shared",
  "scripts": {
    "build": "pnpm run build"
  }
}`),
    fixtureFile('wrangler.jsonc', `{
  "name": "atlas-worker",
  "main": "src/worker.ts",
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "atlas",
      "database_id": "database-id"
    }
  ],
  "vars": {
    "B2_BUCKET": "private-bucket"
  }
}`),
    fixtureFile('firebase.json', `{
  "projectId": "atlas-local",
  "emulators": {
    "auth": { "port": 9099 }
  }
}`),
    fixtureFile('vite.config.ts', 'export default {}\n'),
    fixtureFile('tsconfig.json', '{ "compilerOptions": { "strict": true } }\n'),
    fixtureFile('Desktop/Atlas.Desktop.csproj', `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <AssemblyName>Atlas.Desktop</AssemblyName>
    <UseWPF>true</UseWPF>
  </PropertyGroup>
  <ItemGroup>
    <ProjectReference Include="..\\Shared\\Shared.csproj" />
  </ItemGroup>
</Project>`),
    fixtureFile('Shared/Shared.csproj', '<Project Sdk="Microsoft.NET.Sdk" />'),
    fixtureFile('node_modules/ignored/package.json', '{ "name": "ignored" }'),
    fixtureFile('.env', 'B2_APPLICATION_KEY=do-not-read'),
  ];
}

function stackMapScopeFixture(): AnalyzerSourceFile[] {
  return [
    fixtureFile('package.json', `{
  "name": "scope-fixture",
  "packageManager": "pnpm@9.0.0",
  "devDependencies": {
    "vitest": "^3.0.0",
    "@types/node": "^24.0.0"
  }
}`),
    fixtureFile('pnpm-workspace.yaml', `packages:
  - "apps/*"
  - "packages/*"
`),
    fixtureFile('tsconfig.json', '{ "compilerOptions": { "strict": true } }\n'),
    fixtureFile('apps/web/package.json', `{
  "name": "@scope/web",
  "dependencies": {
    "react": "^19.0.0",
    "vite": "^7.0.0"
  }
}`),
    fixtureFile('apps/web/tsconfig.json', '{ "extends": "../../tsconfig.json" }\n'),
    fixtureFile('apps/api/package.json', `{
  "name": "@scope/api",
  "dependencies": {
    "typescript": "^5.0.0"
  },
  "devDependencies": {
    "vitest": "^3.0.0"
  }
}`),
    fixtureFile('apps/api/tsconfig.json', '{ "compilerOptions": { "strict": true } }\n'),
    fixtureFile('packages/shared/package.json', '{ "name": "@scope/shared" }\n'),
    fixtureFile('apps/companion/ScopeFixture.slnx', '<Solution />\n'),
    fixtureFile('apps/companion/src/ProjectA/ProjectA.csproj', '<Project Sdk="Microsoft.NET.Sdk" />\n'),
    fixtureFile('apps/companion/src/ProjectB/ProjectB.csproj', '<Project Sdk="Microsoft.NET.Sdk" />\n'),
    fixtureFile('apps/companion/src/ProjectA/tsconfig.json', '{ "compilerOptions": { "strict": true } }\n'),
    fixtureFile('apps/companion/src/ProjectB/tsconfig.json', '{ "compilerOptions": { "strict": true } }\n'),
    fixtureFile('Standalone/Standalone.csproj', '<Project Sdk="Microsoft.NET.Sdk" />\n'),
    fixtureFile('Standalone/tsconfig.json', '{ "compilerOptions": { "strict": true } }\n'),
    fixtureFile('.kilo/tsconfig.json', '{ "compilerOptions": { "strict": true } }\n'),
  ];
}

function vehicleManagementWorkspaceFixture(): AnalyzerSourceFile[] {
  return [
    fixtureFile('package.json', '{ "name": "vehicle-management", "packageManager": "pnpm@9.0.0" }\n'),
    fixtureFile('pnpm-workspace.yaml', 'packages:\n  - "apps/*"\n  - "packages/*"\n  - "tools/*"\n'),
    fixtureFile('apps/api/package.json', '{ "name": "api" }\n'),
    fixtureFile('apps/web/package.json', '{ "name": "web" }\n'),
    fixtureFile('packages/database/package.json', '{ "name": "database" }\n'),
    fixtureFile('packages/shared/package.json', '{ "name": "shared" }\n'),
  ];
}

function gitLinesWorkspaceFixture(): AnalyzerSourceFile[] {
  return [
    fixtureFile('package.json', '{ "name": "git-lines", "packageManager": "pnpm@9.0.0" }\n'),
    fixtureFile('pnpm-workspace.yaml', 'packages: []\n'),
  ];
}

function commandEvidenceLocalityFixture(): AnalyzerSourceFile[] {
  return [
    fixtureFile('package.json', JSON.stringify({ name: 'locality-root', packageManager: 'pnpm@9.0.0' })),
    fixtureFile('pnpm-workspace.yaml', 'packages:\n  - "apps/*"\n'),
    fixtureFile('apps/api/package.json', JSON.stringify({
      name: 'api',
      scripts: { build: 'tsc -b', test: 'vitest' },
      devDependencies: {
        typescript: '^5.0.0',
        vitest: '^3.0.0',
        wrangler: '^4.0.0',
        'drizzle-kit': '^0.31.0',
      },
    }, null, 2)),
    fixtureFile('apps/web/package.json', JSON.stringify({
      name: 'web',
      scripts: {
        'build:production': 'tsc -b && vite build',
        test: 'vitest',
        'db:generate': 'drizzle-kit generate',
        'dev:worker': 'wrangler dev',
        'db:migrate': 'wrangler d1 migrations apply DB --local',
      },
      devDependencies: {
        typescript: '^5.0.0',
        vite: '^7.0.0',
        vitest: '^3.0.0',
        'drizzle-kit': '^0.31.0',
        wrangler: '^4.0.0',
      },
    }, null, 2)),
    fixtureFile('apps/api/wrangler.jsonc', '{ "name": "api-worker", "main": "src/index.ts" }\n'),
    fixtureFile('apps/web/wrangler.jsonc', `{
  "name": "web-worker",
  "main": "src/index.ts",
  "d1_databases": [{ "binding": "DB", "database_name": "web", "database_id": "id" }]
}`),
  ];
}

function commandSemanticFixture(): AnalyzerSourceFile[] {
  const manifest = JSON.stringify({
    name: 'command-semantics',
    packageManager: 'pnpm@9.12.0',
    scripts: {
      check: 'pnpm run lint && pnpm run test && pnpm run build',
      lint: 'eslint .',
      test: 'vitest',
      build: 'vite build && tsc -b',
      'db:generate': 'drizzle-kit generate',
      'dev:worker': 'wrangler dev',
      'db:migrate': 'wrangler d1 migrations apply DB --local --env development',
      types: 'wrangler types',
      dev: 'concurrently "pnpm run dev:worker" "pnpm run test"',
    },
    devDependencies: {
      vite: '^7.0.0',
      vitest: '^3.0.0',
      typescript: '^5.0.0',
      'drizzle-kit': '^0.31.0',
      wrangler: '^4.0.0',
    },
  }, null, 2);
  return [
    fixtureFile('package.json', manifest),
    fixtureFile('pnpm-workspace.yaml', 'packages:\n  - "apps/*"\n'),
    fixtureFile('wrangler.jsonc', `{
  "name": "worker",
  "main": "src/index.ts",
  "d1_databases": [{ "binding": "DB", "database_name": "atlas", "database_id": "id" }]
}`),
  ];
}

function usageAwareScopeFixture(): AnalyzerSourceFile[] {
  return [
    fixtureFile('package.json', `{
  "name": "usage-scope-fixture",
  "packageManager": "pnpm@9.0.0",
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "vite": "^7.0.0",
    "vitest": "^3.0.0"
  }
}`),
    fixtureFile('webview/vite.config.ts', `import { defineConfig } from 'vite';
export default defineConfig({ root: 'webview' });
`),
    fixtureFile('tsconfig.json', `{
  "compilerOptions": { "rootDir": "." },
  "include": ["src/**/*.ts"]
}`),
    fixtureFile('tsconfig.webview.json', `{
  "include": ["webview/src/**/*.ts", "webview/src/**/*.tsx"]
}`),
    fixtureFile('src/extension.ts', 'export const extension = true;\n'),
    fixtureFile('webview/src/App.tsx', `import React from 'react';
import { createRoot } from 'react-dom/client';
export const root = createRoot;
`),
    fixtureFile('webview/src/components/Foo.tsx', `import React from 'react';
export const Foo = () => React.createElement('div');
`),
    fixtureFile('webview/src/components/Bar.tsx', `import React from 'react';
export const Bar = () => React.createElement('div');
`),
    fixtureFile('tests/smoke.test.ts', `import { describe } from 'vitest';
describe('smoke', () => undefined);
`),
  ];
}

function nestedScopeFixture(): AnalyzerSourceFile[] {
  return [
    fixtureFile('package.json', `{
  "name": "nested-scope-fixture",
  "packageManager": "pnpm@9.0.0"
}`),
    fixtureFile('pnpm-workspace.yaml', 'packages:\n  - "apps/*"\n'),
    fixtureFile('apps/api/package.json', `{
  "name": "@scope/api",
  "dependencies": {
    "typescript": "^5.0.0"
  },
  "devDependencies": {
    "vitest": "^3.0.0"
  }
}`),
    fixtureFile('apps/api/tsconfig.json', '{ "include": ["src/**/*.ts"] }\n'),
    fixtureFile('apps/api/vitest.config.mts', "import { defineConfig } from 'vitest/config';\nexport default defineConfig({});\n"),
    fixtureFile('apps/api/test/tsconfig.json', `{
  "extends": "../tsconfig.json",
  "compilerOptions": { "types": ["@cloudflare/vitest-pool-workers"] },
  "include": ["./**/*.ts", "../worker-configuration.d.ts"],
  "exclude": []
}`),
    fixtureFile('apps/api/src/worker.ts', "import ts from 'typescript';\nexport const worker = ts;\n"),
    fixtureFile('apps/api/test/worker.test.ts', "import { describe } from 'vitest';\nimport ts from 'typescript';\ndescribe('worker', () => ts);\n"),
  ];
}

describe('Analyzer parsers and evidence', () => {
  it('parses JSONC manifests and keeps exact script/dependency offsets', () => {
    const source = `{
  // comments are allowed in JSONC
  "name": "atlas",
  "scripts": {
    "dev": "vite --host"
  },
  "dependencies": {
    "react": "^19.0.0",
  },
}`;
    const parsed = parsePackageJson('package.json', source);
    const script = parsed.scripts[0];
    const dependency = parsed.dependencies[0];
    const commandStart = source.indexOf('vite --host');
    const commandEnd = commandStart + 'vite --host'.length;

    expect(parsed.name).toBe('atlas');
    expect(script.commandStartOffset).toBe(commandStart);
    expect(source.slice(script.commandStartOffset, script.commandEndOffset)).toBe(script.command);
    expect(dependency.packageName).toBe('react');
    expect(dependency.dependencyType).toBe('dependency');

    const evidence = makeEvidence('package.json', source, { start: commandStart, end: commandEnd }, 'script', 'test-command');
    expect(evidence.highlightRanges[0]).toEqual({
      start: positionAt(source, commandStart),
      end: positionAt(source, commandEnd),
    });
    expect(evidence.contextStartLine).toBe(3);
    expect(evidence.contextEndLine).toBe(7);
    expect(evidenceRangeLabel(evidence)).toBe(`package.json:${evidence.highlightRanges[0].start.line}`);

    const multiLineEvidence = makeEvidence('package.json', source, {
      start: source.indexOf('"scripts"'),
      end: source.indexOf('"dependencies"'),
    }, 'script', 'multi-line-test');
    expect(evidenceRangeLabel(multiLineEvidence)).toBe('package.json:4–7');
  });

  it('parses workspace patterns, Wrangler bindings, and .NET WPF projects', () => {
    const workspaceSource = 'packages:\n  - "apps/*"\n  - packages/*\n';
    const workspace = parsePnpmWorkspace('pnpm-workspace.yaml', workspaceSource);
    const wranglerSource = `{
  "name": "worker",
  "main": "src/index.ts",
  "d1_databases": [{ "binding": "DB", "database_name": "atlas", "database_id": "id" }]
}`;
    const wrangler = parseWranglerConfig('wrangler.jsonc', wranglerSource);
    const dotnet = parseDotnetProject('<Project><PropertyGroup><AssemblyName>Desktop</AssemblyName><UseWPF>true</UseWPF></PropertyGroup><ItemGroup><ProjectReference Include="..\\Shared\\Shared.csproj" /></ItemGroup></Project>');

    expect(workspace.patterns.map((pattern) => pattern.pattern)).toEqual(['apps/*', 'packages/*']);
    expect(workspace.patterns.every((pattern) => workspaceSource.slice(pattern.range.start, pattern.range.end) === pattern.pattern)).toBe(true);
    expect(wrangler.workerName).toBe('worker');
    expect(wrangler.main).toBe('src/index.ts');
    expect(wrangler.d1Bindings[0]).toMatchObject({ binding: 'DB', databaseName: 'atlas', databaseId: 'id' });
    expect(dotnet).toMatchObject({ projectName: 'Desktop', useWpf: true, projectReferences: [{ include: '..\\Shared\\Shared.csproj' }] });
  });
});

describe('Analyzer command parsing', () => {
  it('retains shell operators, pnpm selectors, exec commands, and concurrently branches', () => {
    const fragments = parseCommandExpression('pnpm run build && pnpm --filter web dev; concurrently "pnpm run api" "vite --host"');

    expect(fragments.map((fragment) => [fragment.kind, fragment.operator, fragment.scriptName])).toEqual([
      ['pnpm-script', undefined, 'build'],
      ['pnpm-script', '&&', 'dev'],
      ['concurrently', ';', undefined],
    ]);
    expect(fragments[1].packageSelector).toBe('web');
    expect(fragments[2].children.map((child) => child.kind)).toEqual(['pnpm-script', 'cli']);
    expect(fragments[2].children[0].scriptName).toBe('api');
    expect(fragments[2].children[1].toolName).toBe('vite');
    expect(parseCommandExpression('pnpm exec vite')[0]).toMatchObject({ kind: 'pnpm-exec', toolName: 'vite' });
    expect(parseCommandExpression('vitest')[0]).toMatchObject({ kind: 'cli', toolName: 'vitest' });
    expect(parseCommandExpression('drizzle-kit generate')[0]).toMatchObject({ kind: 'cli', toolName: 'drizzle-kit' });
    expect(parseCommandExpression('npx vite')[0]).toMatchObject({ kind: 'cli', toolName: 'vite' });
    expect(commandInvocation(parseCommandExpression('wrangler d1 migrations apply DB')[0])).toMatchObject({
      executable: 'wrangler',
      subcommand: 'd1',
    });
    expect(commandInvocation(parseCommandExpression('pnpm exec wrangler d1 migrations apply DB')[0])).toMatchObject({
      executable: 'wrangler',
      subcommand: 'd1',
    });
    expect(Object.values(COMMAND_EXECUTABLE_STACK_IDS).every((stackId) => getStack(stackId))).toBe(true);
  });
});

describe('Analyzer semantic zoom and layout', () => {
  it('fits only a view that has no stored camera', () => {
    expect(shouldRunAnalyzerInitialFit(false)).toBe(true);
    expect(shouldRunAnalyzerInitialFit(true)).toBe(false);
  });

  it('uses stable far/medium/near thresholds with inclusive medium boundaries', () => {
    expect(semanticZoomLevelForScale(ANALYZER_FAR_ZOOM_THRESHOLD - 0.01)).toBe('far');
    expect(semanticZoomLevelForScale(ANALYZER_FAR_ZOOM_THRESHOLD)).toBe('medium');
    expect(semanticZoomLevelForScale(0.7)).toBe('medium');
    expect(semanticZoomLevelForScale(ANALYZER_NEAR_ZOOM_THRESHOLD)).toBe('medium');
    expect(semanticZoomLevelForScale(ANALYZER_NEAR_ZOOM_THRESHOLD + 0.01)).toBe('near');
    expect(displayedZoomLevelForNode('near', false, true)).toBe('near');
    expect(displayedZoomLevelForNode('near', false, false)).toBe('medium');
    expect(displayedZoomLevelForNode('far', true, false)).toBe('near');
  });

  it('allows the code preview only for a selected node with evidence', () => {
    const selectedZoom = displayedZoomLevelForNode('far', true, false);
    const hoveredZoom = displayedZoomLevelForNode('near', false, false);

    expect(shouldShowAnalyzerEvidencePreview(selectedZoom, true, true)).toBe(true);
    expect(shouldShowAnalyzerEvidencePreview(hoveredZoom, false, true)).toBe(false);
    expect(shouldShowAnalyzerEvidencePreview('near', false, false)).toBe(false);
  });

  it('expands only requested nodes while preserving the deterministic layout columns', () => {
    const view = {
      view: 'workspace' as const,
      nodes: [
        { id: 'node:source', type: 'project' as const, label: 'Source', clusterId: 'workspace:project', evidenceIds: ['evidence:source'], metadata: {} },
        { id: 'node:other', type: 'workspace-package' as const, label: 'Other', clusterId: 'workspace:project', evidenceIds: [], metadata: {} },
      ],
      edges: [],
      clusters: [{ id: 'workspace:project', label: 'Project', tone: 'accent' as const, nodeIds: ['node:source', 'node:other'] }],
      evidence: [],
      warnings: [],
    };
    const base = layoutAnalyzerView(view);
    const expanded = layoutAnalyzerView(view, new Set(['node:source']));
    const baseSource = base.nodes.find((node) => node.node.id === 'node:source');
    const expandedSource = expanded.nodes.find((node) => node.node.id === 'node:source');
    const expandedOther = expanded.nodes.find((node) => node.node.id === 'node:other');

    expect(baseSource?.height).toBe(ANALYZER_NODE_HEIGHT);
    expect(expandedSource?.height).toBe(ANALYZER_NEAR_NODE_HEIGHT);
    expect(expandedOther?.height).toBe(ANALYZER_NODE_HEIGHT);
    expect(expandedOther?.y).toBe((expandedSource?.y ?? 0) + ANALYZER_NEAR_NODE_HEIGHT + 24);
    expect(expanded.clusters[0]?.height).toBeGreaterThan(base.clusters[0]?.height ?? 0);
  });

  it('fits the complete layout without enforcing a crop-prone minimum scale', () => {
    const baseLayout = layoutAnalyzerView({ view: 'workspace', nodes: [], edges: [], clusters: [], evidence: [], warnings: [] });
    const layout = { ...baseLayout, width: 2000, height: 1200 };
    const fitted = fitAnalyzerTransform(layout, 800, 500);
    const focused = focusAnalyzerTransform({
      node: { id: 'node', type: 'project', label: 'Node', evidenceIds: [], metadata: {} },
      x: 200,
      y: 100,
      height: 106,
    }, 800, 500, 0.6);

    expect(fitted.scale).toBeLessThan(0.44);
    expect(fitted.x + layout.width * fitted.scale).toBeLessThanOrEqual(800);
    expect(fitted.y + layout.height * fitted.scale).toBeLessThanOrEqual(500);
    expect(focused.scale).toBe(0.82);
    expect(focused.x).toBe(800 / 2 - (200 + 122) * 0.82);
  });

  it('keeps the selected block in place when the detail panel narrows the viewport', () => {
    const current = { x: 120, y: 40, scale: 1 };
    const selected = {
      node: { id: 'selected', type: 'project' as const, label: 'Selected', evidenceIds: [], metadata: {} },
      x: 240,
      y: 80,
      height: 106,
    };

    expect(preserveAnalyzerTransformOnViewportResize(current, { width: 1000, height: 600 }, { width: 700, height: 600 }, selected)).toEqual(current);
    expect(preserveAnalyzerTransformOnViewportResize(current, { width: 1000, height: 600 }, { width: 700, height: 600 }, { ...selected, x: 600 })).toEqual({ x: -180, y: 40, scale: 1 });
  });
});

describe('Analyzer relation presentation', () => {
  it('keeps forward labels and presents inverse labels from the selected target perspective', () => {
    const edge = {
      id: 'edge:depends-on',
      sourceId: 'package:api',
      targetId: 'external-package:aws4fetch',
      kind: 'depends-on' as const,
      label: 'depends-on',
      evidenceIds: [],
      metadata: {},
    };

    expect(relationLabelForNode(edge, 'package:api')).toBe('depends-on');
    expect(relationLabelForNode(edge, 'external-package:aws4fetch')).toBe('used-by');
    expect(analyzerRelationInverseLabels).toMatchObject({
      contains: 'contained-by',
      uses: 'used-by',
      'binds-to': 'bound-from',
      'uses-config': 'config-for',
      declares: 'declared-by',
      matches: 'matched-by',
      'depends-on': 'used-by',
      starts: 'started-by',
      executes: 'executed-by',
      'resolves-to': 'resolved-from',
    });
  });
});

describe('Analyzer scan and projectors', () => {
  it('builds local facts, direct dependency relations, Dictionary matches, and masked sources', async () => {
    const store = await scanProjectFiles(analyzerFixture());
    const fact = (id: string) => store.facts.find((candidate) => candidate.id === id);
    const relation = (sourceId: string, targetId: string, kind: string) => store.relations.find((candidate) => candidate.sourceId === sourceId && candidate.targetId === targetId && candidate.kind === kind);

    expect(fact('project:root')).toMatchObject({ kind: 'project', label: 'atlas-root' });
    expect(fact('package:apps/web')).toMatchObject({ kind: 'workspace-package', packageName: '@atlas/web' });
    expect(fact('technology:react')).toMatchObject({ kind: 'technology', dictionaryStackId: 'react' });
    expect(fact('technology:vite')).toMatchObject({ kind: 'technology', dictionaryStackId: 'vite' });
    expect(fact('technology:firebase')).toMatchObject({ kind: 'technology', label: 'Firebase' });
    expect(fact('technology:firebase-authentication')).toBeUndefined();
    expect(fact('runtime:cloudflare-workers:wrangler.jsonc')).toMatchObject({ kind: 'runtime', runtimeType: 'cloudflare-workers' });
    expect(fact('resource:wrangler.jsonc:d1:DB')).toMatchObject({ kind: 'resource', resourceType: 'database', binding: 'DB' });
    expect(fact('resource:wrangler.jsonc:b2')).toMatchObject({ kind: 'resource', resourceType: 'storage', dictionaryStackId: 'backblaze-b2' });
    expect(fact('resource:firebase.json:firebase-auth')).toMatchObject({ kind: 'resource', resourceType: 'auth', dictionaryStackId: 'firebase-authentication' });
    expect(fact('dotnet-project:Desktop/Atlas.Desktop.csproj')).toMatchObject({ kind: 'dotnet-project', projectName: 'Atlas.Desktop', useWpf: true });

    expect(relation('package:.', 'package:packages/shared', 'depends-on')).toMatchObject({ metadata: { dependencyType: 'workspaceDependency' } });
    expect(relation('package:apps/web', 'package:packages/shared', 'depends-on')).toMatchObject({ metadata: { dependencyType: 'workspaceDependency' } });
    expect(relation('package:.', 'technology:react', 'depends-on')).toBeDefined();
    expect(relation('package:.', 'external-package:mystery-lib', 'depends-on')).toBeDefined();
    expect(store.sources['wrangler.jsonc']).not.toContain('private-bucket');
    expect(store.evidence.some((evidence) => evidence.filePath === 'wrangler.jsonc' && evidence.detectorId === 'cloudflare-d1')).toBe(true);
    expect(store.warnings).toEqual([]);
  });

  it('projects workspace, dependency, and command views without mixing their scopes', async () => {
    const store = await scanProjectFiles(analyzerFixture());
    const workspace = projectWorkspace(store);
    const dependencies = projectDependencies(store);
    const command = projectCommand(store);

    expect(workspace.nodes.map((node) => node.type)).not.toContain('external-package');
    expect(workspace.edges.every((edge) => ['uses-config', 'declares', 'matches', 'contains'].includes(edge.kind))).toBe(true);
    expect(workspace.edges.filter((edge) => edge.kind === 'contains')).toEqual([
      expect.objectContaining({ sourceId: 'project:root', targetId: 'package:.', kind: 'contains', label: 'contains' }),
    ]);
    expect(workspace.edges.some((edge) => edge.kind === 'contains' && edge.targetId !== 'package:.')).toBe(false);
    expect(dependencies.nodes.map((node) => node.id)).toEqual(expect.arrayContaining(['package:.', 'package:apps/web', 'technology:react', 'external-package:mystery-lib']));
    expect(dependencies.nodes.map((node) => node.id)).toContain('dependencies:external:summary');
    expect(dependencies.nodes.map((node) => node.id)).not.toContain('technology:pnpm');
    expect(dependencies.nodes.find((node) => node.id === 'external-package:mystery-lib')?.presentation?.parentId).toBe('dependencies:external:summary');
    expect(dependencies.edges.some((edge) => edge.metadata.dependencyType === 'workspaceDependency')).toBe(true);
    expect(dependencies.edges.some((edge) => edge.presentation?.displayKind === 'bundle')).toBe(true);
    expect(command.entryScriptId).toBe(scriptIdFor(packageIdForPath('.'), 'dev'));
    expect(command.nodes.some((node) => node.id.startsWith('user-command:'))).toBe(true);
    expect(command.nodes.some((node) => node.label === 'pnpm exec vite')).toBe(true);
    expect(command.edges.some((edge) => edge.kind === 'starts' && edge.targetId === 'technology:vite')).toBe(true);
    expect(command.edges.some((edge) => edge.kind === 'runs-in')).toBe(false);
    expect(command.nodes.some((node) => node.id === 'package:apps/web')).toBe(false);
    expect(command.evidence.length).toBeGreaterThan(store.evidence.length);
  });

  it('connects the Root Package to Project and keeps pattern matches on member packages', async () => {
    const store = await scanProjectFiles(vehicleManagementWorkspaceFixture());
    const workspace = projectWorkspace(store);
    const rootPackage = workspace.nodes.find((node) => node.id === 'package:.');
    const patternMatches = (pattern: string) => workspace.edges
      .filter((edge) => edge.kind === 'matches' && edge.sourceId.startsWith(`workspace-pattern:${pattern}:`))
      .map((edge) => edge.targetId)
      .sort();
    const packages = workspace.nodes.filter((node) => node.type === 'workspace-package');

    expect(rootPackage).toMatchObject({ type: 'workspace-package', metadata: { displayRole: 'ROOT PACKAGE' } });
    expect(workspace.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: 'project:root', targetId: 'package:.', kind: 'contains' }),
      expect.objectContaining({ sourceId: 'project:root', targetId: 'workspace:pnpm', kind: 'uses-config' }),
    ]));
    expect(workspace.edges.some((edge) => edge.kind === 'matches' && edge.targetId === 'package:.')).toBe(false);
    expect(workspace.edges.some((edge) => edge.kind === 'contains' && edge.sourceId === 'project:root' && edge.targetId !== 'package:.')).toBe(false);
    expect(patternMatches('apps/*')).toEqual(['package:apps/api', 'package:apps/web']);
    expect(patternMatches('packages/*')).toEqual(['package:packages/database', 'package:packages/shared']);
    expect(patternMatches('tools/*')).toEqual([]);
    expect(workspace.nodes.some((node) => node.type === 'workspace-pattern' && node.label === 'tools/*')).toBe(true);
    expect(packages.map((node) => node.id).sort()).toEqual([
      'package:.',
      'package:apps/api',
      'package:apps/web',
      'package:packages/database',
      'package:packages/shared',
    ]);
    expect(relationLabelForNode({
      sourceId: 'project:root',
      targetId: 'package:.',
      kind: 'contains',
      label: 'contains',
    }, 'package:.')).toBe('contained-by');
  });

  it('keeps a single-package repository as Project, Root Package, and Workspace Config', async () => {
    const store = await scanProjectFiles(gitLinesWorkspaceFixture());
    const workspace = projectWorkspace(store);
    const packageNodes = workspace.nodes.filter((node) => node.type === 'workspace-package');

    expect(workspace.nodes.map((node) => node.type).sort()).toEqual(['project', 'workspace-config', 'workspace-package'].sort());
    expect(workspace.nodes.some((node) => node.type === 'workspace-pattern')).toBe(false);
    expect(packageNodes).toHaveLength(1);
    expect(packageNodes[0]).toMatchObject({ id: 'package:.', metadata: { displayRole: 'ROOT PACKAGE' } });
    expect(workspace.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: 'project:root', targetId: 'package:.', kind: 'contains' }),
      expect.objectContaining({ sourceId: 'project:root', targetId: 'workspace:pnpm', kind: 'uses-config' }),
    ]));
    expect(workspace.edges.some((edge) => edge.kind === 'matches')).toBe(false);
    expect(workspace.edges.filter((edge) => edge.kind === 'contains')).toHaveLength(1);
  });

  it('flattens a single-source External Summary without changing the underlying dependency facts', async () => {
    const store = await scanProjectFiles(analyzerFixture());
    const dependencies = projectDependencies(store);
    const options = { expandedPresentationIds: new Set<string>(), filter: 'all', search: '' };
    const collapsed = presentAnalyzerView(dependencies, options);
    const expanded = presentAnalyzerView(dependencies, { ...options, expandedPresentationIds: new Set(['dependencies:external:summary']) });
    const collapsedAgain = presentAnalyzerView(dependencies, options);
    const searchRevealed = presentAnalyzerView(dependencies, { ...options, search: 'mystery-lib' });

    expect(dependencies.nodes.map((node) => node.id)).toContain('external-package:mystery-lib');
    expect(dependencies.nodes.map((node) => node.id)).not.toContain('dependencies:external:source:package:.');
    expect(collapsed.nodes.map((node) => node.id)).toContain('dependencies:external:summary');
    expect(collapsed.nodes.map((node) => node.id)).not.toContain('external-package:mystery-lib');
    expect(expanded.nodes.map((node) => node.id)).toContain('external-package:mystery-lib');
    expect(expanded.nodes.map((node) => node.id)).not.toContain('dependencies:external:summary');
    expect(collapsedAgain.nodes.map((node) => node.id)).not.toContain('external-package:mystery-lib');
    expect(searchRevealed.nodes.map((node) => node.id)).toContain('external-package:mystery-lib');
    expect(collapsed.edges.some((edge) => edge.targetId === 'dependencies:external:summary')).toBe(true);
    expect(collapsed.edges.some((edge) => edge.presentation?.displayKind === 'bundle')).toBe(true);
    expect(expanded.edges.some((edge) => edge.targetId === 'external-package:mystery-lib')).toBe(true);
    expect(expanded.edges.some((edge) => edge.presentation?.displayKind === 'bundle')).toBe(false);
    expect(expanded.counts?.visibleNodes).toBe(expanded.counts?.totalNodes);
    expect(expanded.presentationGroups).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'dependencies:external:summary', label: 'External Packages', count: expect.any(Number), countLabel: 'PACKAGES', expanded: true }),
    ]));
    expect(layoutAnalyzerView(collapsed).summaryGroups).toHaveLength(0);
    const externalGroupLayout = layoutAnalyzerView(expanded);
    const externalSummaryGroup = externalGroupLayout.summaryGroups.find((group) => group.id === 'dependencies:external:summary');
    expect(externalSummaryGroup).toMatchObject({ id: 'dependencies:external:summary', label: 'External Packages', countLabel: 'PACKAGES' });
    expect(externalSummaryGroup?.width).toBeGreaterThan(0);
    expect(externalSummaryGroup?.height).toBeGreaterThan(0);
    const directExternalNodes = externalGroupLayout.nodes.filter((positionedNode) => positionedNode.node.type === 'external-package');
    expect(directExternalNodes.length).toBeGreaterThan(0);
    expect(externalGroupLayout.bands).toHaveLength(0);
    expect(Math.min(...directExternalNodes.map((positionedNode) => positionedNode.y)) - (externalSummaryGroup?.y ?? 0)).toBeGreaterThan(40);
    const summary = dependencies.nodes.find((node) => node.id === 'dependencies:external:summary');
    expect(summary).toBeDefined();
    expect(analyzerSummarySubtitle(summary!, false)).toContain('expand for details');
    expect(analyzerSummarySubtitle(summary!, true)).toContain('expanded · Collapse');
    expect(presentationOwnsNode(dependencies, 'dependencies:external:summary', 'external-package:mystery-lib')).toBe(true);
    expect(summary?.metadata.externalLayoutMode).toBe('flat');
  });

  it('keeps source grouping and Shared External behavior when multiple sources exist', () => {
    const packageFact = (id: string, label: string) => ({
      id,
      kind: 'workspace-package' as const,
      label,
      packagePath: id.replace('package:', ''),
      packageName: label,
      manifestPath: `${id.replace('package:', '')}/package.json`,
      scripts: {},
      dependencies: [],
      isRoot: false,
      evidenceIds: [],
      metadata: {},
    });
    const externalFact = (id: string, label: string) => ({
      id,
      kind: 'external-package' as const,
      label,
      packageName: label,
      versionRanges: ['^1.0.0'],
      dependencyTypes: ['dependency' as const],
      evidenceIds: [],
      metadata: {},
    });
    const store: AnalyzerProjectStore = {
      files: [],
      facts: [packageFact('package:a', 'Package A'), packageFact('package:b', 'Package B'), externalFact('external:shared', 'shared-lib'), externalFact('external:solo', 'solo-lib')],
      relations: [
        { id: 'relation:a-shared', sourceId: 'package:a', targetId: 'external:shared', kind: 'depends-on', evidenceIds: [], metadata: {} },
        { id: 'relation:b-shared', sourceId: 'package:b', targetId: 'external:shared', kind: 'depends-on', evidenceIds: [], metadata: {} },
        { id: 'relation:a-solo', sourceId: 'package:a', targetId: 'external:solo', kind: 'depends-on', evidenceIds: [], metadata: {} },
      ],
      evidence: [],
      sources: {},
      warnings: [],
      scannedAt: 'multiple-sources',
    };
    const dependencies = projectDependencies(store);
    const options = { expandedPresentationIds: new Set<string>(), filter: 'all', search: '' };
    const expanded = presentAnalyzerView(dependencies, { ...options, expandedPresentationIds: new Set(['dependencies:external:summary']) });
    const sourceSummaries = expanded.nodes.filter((node) => node.presentation?.role === 'summary' && typeof node.metadata.externalGroupId === 'string');

    expect(sourceSummaries.map((node) => node.label)).toEqual(['Shared External', 'Package A Dependencies']);
    expect(expanded.nodes.map((node) => node.id)).not.toContain('external:shared');
    expect(dependencies.nodes.find((node) => node.id === 'external:shared')?.presentation?.parentId).toBe('dependencies:external:source:shared');
    expect(dependencies.nodes.find((node) => node.id === 'external:solo')?.presentation?.parentId).toBe('dependencies:external:source:package:a');

    const sharedExpanded = presentAnalyzerView(dependencies, {
      ...options,
      expandedPresentationIds: new Set(['dependencies:external:summary', 'dependencies:external:source:shared']),
    });
    expect(sharedExpanded.nodes.map((node) => node.id)).toContain('external:shared');
    expect(sharedExpanded.nodes.map((node) => node.id)).not.toContain('external:solo');
    expect(sharedExpanded.edges.some((edge) => edge.sourceId.startsWith('external:') && edge.targetId.startsWith('external:'))).toBe(false);
    expect(dependencies.nodes.filter((node) => node.metadata.externalLayoutMode === 'flat')).toHaveLength(0);
  });

  it('projects Stack Map as Project -> semantic Scope Region -> canonical Stack Usage without dependency-detail pollution', async () => {
    const store = await scanProjectFiles(analyzerFixture());
    const stackMap = projectStackMap(store);
    const compatibilityProjection = projectArchitecture(store);
    const usage = (scopeId: string, stackId: string) => stackMap.nodes.find((node) => node.id === `stack-usage:${scopeId}:${stackId}`);

    expect(stackMap.view).toBe('architecture');
    expect(compatibilityProjection.nodes.map((node) => node.type)).toEqual(stackMap.nodes.map((node) => node.type));
    expect(stackMap.nodes.map((node) => node.type)).toEqual(expect.arrayContaining(['project', 'stack-usage']));
    expect(stackMap.nodes.some((node) => node.type === 'stack-scope')).toBe(false);
    expect(stackMap.regions?.length).toBeGreaterThan(0);
    expect(stackMap.regions?.every((region) => region.entityKind === 'region' && region.regionKind === 'scope')).toBe(true);
    expect(stackMap.nodes.some((node) => node.type === 'technology' || node.type === 'external-package')).toBe(false);
    expect(stackMap.nodes.some((node) => node.label === 'mystery-lib' || node.label === '@types/node')).toBe(false);

    expect(usage('package:apps/web', 'react')).toMatchObject({
      type: 'stack-usage',
      label: 'React',
      metadata: { scopeLabel: 'WEB', scopePath: 'apps/web', dictionaryStackId: 'react' },
    });
    expect(usage('root', 'react')).toMatchObject({ metadata: { scopeLabel: 'PROJECT / TOOLING', scopePath: '.' } });
    expect(usage('package:apps/web', 'vite')).toBeUndefined();
    expect(usage('root', 'vite')).toBeDefined();
    expect(usage('services', 'cloudflare-workers')).toMatchObject({ metadata: { scopeLabel: 'PROJECT / SERVICES' } });
    expect(usage('services', 'cloudflare-d1')).toBeDefined();
    expect(usage('services', 'backblaze-b2')).toBeDefined();
    expect(usage('services', 'firebase-authentication')).toBeDefined();

    const sharedScope = stackMap.regions?.find((region) => region.id === 'region:scope:packages/shared');
    expect(sharedScope).toBeUndefined();
    expect(stackMap.regions?.some((region) => region.metadata.scopeLabel === 'DESKTOP')).toBe(false);
    expect(stackMap.edges.every((edge) => stackMap.nodes.some((node) => node.id === edge.sourceId) || stackMap.regions?.some((region) => region.id === edge.sourceId))).toBe(true);
    expect(stackMap.edges.every((edge) => stackMap.nodes.some((node) => node.id === edge.targetId) || stackMap.regions?.some((region) => region.id === edge.targetId))).toBe(true);
    expect(stackMap.edges.every((edge) => edge.kind === 'contains' && edge.metadata.toEndpointKind === 'region')).toBe(true);
    stackMap.regions?.forEach((region) => {
      expect(region.childIds.every((childId) => stackMap.nodes.some((node) => node.id === childId))).toBe(true);
      expect(region.ports.map((port) => port.side)).toEqual(['top', 'right', 'bottom', 'left']);
    });

    const presented = presentAnalyzerView(stackMap, { expandedPresentationIds: new Set(), filter: 'all', search: '' });
    expect(presented.counts).toEqual({ visibleNodes: stackMap.nodes.length, totalNodes: stackMap.nodes.length, hiddenNodes: 0 });
    expect(presented.edges).toHaveLength(stackMap.edges.length);
    expect(presented.presentationGroups).toEqual([]);
    const webRegion = presented.regions?.find((region) => region.metadata.scopePath === 'apps/web');
    expect(webRegion).toBeDefined();
    expect(webRegion?.childIds.every((childId) => presented.nodes.some((node) => node.id === childId))).toBe(true);
    const selectedRegion = presentAnalyzerView(stackMap, { expandedPresentationIds: new Set(), filter: 'all', search: '', selectedRegionId: webRegion?.id });
    expect(selectedRegion.regions?.map((region) => region.id)).toContain(webRegion?.id);
    expect(selectedRegion.edges.some((edge) => edge.targetId === webRegion?.id && edge.metadata.toEndpointKind === 'region')).toBe(true);
    const regionSearch = presentAnalyzerView(stackMap, { expandedPresentationIds: new Set(), filter: 'all', search: 'apps/web' });
    expect(regionSearch.regions?.map((region) => region.id)).toContain(webRegion?.id);
    expect(regionSearch.regions?.find((region) => region.id === webRegion?.id)?.childIds.length).toBe(webRegion?.childIds.length);
    const usageSearch = presentAnalyzerView(stackMap, { expandedPresentationIds: new Set(), filter: 'all', search: 'React' });
    expect(usageSearch.regions?.some((region) => region.childIds.some((childId) => usageSearch.nodes.some((node) => node.id === childId && node.label === 'React')))).toBe(true);
    const layout = layoutAnalyzerView(presented);
    expect(layout.regions?.some((region) => region.region.label === 'WEB')).toBe(true);
    expect(layout.regions?.some((region) => region.region.label === 'PROJECT / SERVICES')).toBe(true);
    expect(layout.regions?.every((region) => region.region.bounds?.x === region.x && region.region.bounds?.y === region.y)).toBe(true);
    expect(layout.regions?.every((region, index, all) => all.every((other, otherIndex) => index === otherIndex
      || region.x + region.width <= other.x
      || other.x + other.width <= region.x
      || region.y + region.height <= other.y
      || other.y + other.height <= region.y))).toBe(true);
    expect(fitAnalyzerTransform(layout, 1000, 600).scale).toBeGreaterThan(0);
  });

  it('attributes the same canonical Stack to each evidence-backed scope and isolates root tooling', async () => {
    const stackMap = projectStackMap(await scanProjectFiles(stackMapScopeFixture()));
    const usage = (scopeId: string, stackId: string) => stackMap.nodes.find((node) => node.id === `stack-usage:${scopeId}:${stackId}`);
    const typescriptUsages = stackMap.stackUsages?.filter((entry) => entry.stackId === 'typescript') ?? [];

    expect(usage('package:apps/web', 'typescript')).toMatchObject({ metadata: { scopeLabel: 'WEB', scopePath: 'apps/web' } });
    expect(usage('package:apps/api', 'typescript')).toMatchObject({ metadata: { scopeLabel: 'API', scopePath: 'apps/api' } });
    expect(usage('root', 'typescript')).toMatchObject({ metadata: { scopeLabel: 'PROJECT / TOOLING' } });
    expect(typescriptUsages).toHaveLength(5);
    expect(usage('root', 'vitest')).toMatchObject({ metadata: { scopeLabel: 'PROJECT / TOOLING' } });
    expect(usage('package:apps/web', 'vitest')).toBeUndefined();
    expect(usage('package:apps/api', 'vitest')).toMatchObject({ metadata: { scopeLabel: 'API', scopePath: 'apps/api' } });
    expect(usage('root', 'pnpm')).toMatchObject({ metadata: { scopeLabel: 'PROJECT / TOOLING', scopePath: '.' } });
    expect(stackMap.stackUsages?.filter((entry) => entry.stackId === 'pnpm').map((entry) => entry.scopeId)).toEqual(['root']);
    expect(stackMap.regions?.some((region) => region.metadata.scopePath === '.kilo')).toBe(false);
    expect(stackMap.regions?.some((region) => region.metadata.scopePath === 'packages/shared')).toBe(false);

    const companionScope = stackMap.regions?.find((region) => region.metadata.scopePath === 'apps/companion');
    expect(companionScope).toMatchObject({ entityKind: 'region', subtitle: 'apps/companion', metadata: { scopeKind: 'physical', scopeType: 'desktop' } });
    const companionTypescript = stackMap.nodes.find((node) => node.type === 'stack-usage' && node.metadata.scopePath === 'apps/companion' && node.metadata.stackId === 'typescript');
    expect(companionTypescript?.evidenceIds).toHaveLength(2);
    const companionEvidencePaths = stackMap.evidence.filter((evidence) => companionTypescript?.evidenceIds.includes(evidence.id)).map((evidence) => evidence.filePath);
    expect(companionEvidencePaths).toEqual(expect.arrayContaining(['apps/companion/src/ProjectA/tsconfig.json', 'apps/companion/src/ProjectB/tsconfig.json']));

    const standaloneScope = stackMap.regions?.find((region) => region.metadata.scopePath === 'Standalone');
    expect(standaloneScope).toMatchObject({ entityKind: 'region', subtitle: 'Standalone', metadata: { scopeKind: 'physical', scopeType: 'desktop' } });
    expect(stackMap.nodes.some((node) => node.label === '@types/node')).toBe(false);

    const stackOnly = presentAnalyzerView(stackMap, { expandedPresentationIds: new Set(), filter: 'stack-usage', search: '' });
    expect(stackOnly.nodes.map((node) => node.type)).toEqual(expect.arrayContaining(['project', 'stack-usage']));
    expect(stackOnly.nodes.every((node) => ['project', 'stack-usage'].includes(node.type))).toBe(true);
    expect(stackOnly.regions?.length).toBeGreaterThan(0);
    expect(stackOnly.edges.every((edge) => stackOnly.nodes.some((node) => node.id === edge.sourceId) || stackOnly.regions?.some((region) => region.id === edge.sourceId))).toBe(true);
    expect(stackOnly.edges.every((edge) => stackOnly.nodes.some((node) => node.id === edge.targetId) || stackOnly.regions?.some((region) => region.id === edge.targetId))).toBe(true);
  });

  it('prioritizes source/config Usage Evidence over root declarations in a single-package repository', async () => {
    const store = await scanProjectFiles(usageAwareScopeFixture());
    const stackMap = projectStackMap(store);
    const usageNodes = (stackId: string) => stackMap.nodes.filter((node) => node.metadata.stackId === stackId);
    const usageScopes = (stackId: string) => usageNodes(stackId).map((node) => node.metadata.scopePath);
    const reactFact = store.facts.find((fact) => fact.id === 'technology:react');
    const reactEvidence = reactFact?.evidenceIds.map((id) => store.evidence.find((candidate) => candidate.id === id)).filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate)) ?? [];

    expect(usageScopes('react')).toEqual(['webview']);
    expect(usageScopes('react-dom')).toEqual(['webview']);
    expect(usageScopes('vite')).toEqual(['webview']);
    expect(usageScopes('typescript')).toEqual(expect.arrayContaining(['src', 'webview']));
    expect(usageScopes('typescript')).toHaveLength(2);
    const typescriptUsageEvidence = usageNodes('typescript').map((node) => node.evidenceIds
      .map((id) => store.evidence.find((evidence) => evidence.id === id))
      .filter((evidence): evidence is NonNullable<typeof evidence> => Boolean(evidence)));
    expect(typescriptUsageEvidence.every((evidence) => evidence.some((item) => item.role === 'declaration' && item.filePath === 'package.json'))).toBe(true);
    expect(usageScopes('vitest')).toEqual(['.']);
    expect(usageScopes('pnpm')).toEqual(['.']);
    expect(usageNodes('react').some((node) => node.metadata.scopePath === '.')).toBe(false);
    expect(usageNodes('vite').some((node) => node.metadata.scopePath === '.')).toBe(false);

    const reactUsage = usageNodes('react').find((node) => node.metadata.scopePath === 'webview');
    expect(reactUsage).toBeDefined();
    expect(reactUsage?.evidenceIds.map((id) => store.evidence.find((evidence) => evidence.id === id)?.filePath)).toEqual(expect.arrayContaining([
      'webview/src/App.tsx',
      'webview/src/components/Foo.tsx',
      'webview/src/components/Bar.tsx',
    ]));
    expect(reactEvidence.some((evidence) => evidence.role === 'usage' && evidence.detectorId === 'source-import' && evidence.filePath === 'webview/src/App.tsx')).toBe(true);
    expect(reactEvidence.some((evidence) => evidence.role === 'declaration' && evidence.filePath === 'package.json')).toBe(true);
    expect(store.evidence.some((evidence) => evidence.role === 'scope' && evidence.scopePath === 'webview')).toBe(true);
    expect(store.sources['webview/src/App.tsx']).toContain('react-dom/client');
    expect(stackMap.regions?.some((region) => region.metadata.scopePath === 'webview')).toBe(true);
    expect(stackMap.regions?.some((region) => region.metadata.scopePath === 'src')).toBe(true);
    expect(stackMap.regions?.some((region) => region.metadata.scopePath === 'tests')).toBe(false);
  });

  it('promotes an explicit nested compilation boundary and keeps usage-only directories attributed to their package', async () => {
    const nestedStore = await scanProjectFiles(nestedScopeFixture());
    const nestedStackMap = projectStackMap(nestedStore);
    const regionAt = (path: string) => nestedStackMap.regions?.find((region) => region.metadata.scopePath === path);
    const apiRegion = regionAt('apps/api');
    const testRegion = regionAt('apps/api/test');

    expect(nestedStore.evidence.some((evidence) => evidence.role === 'scope'
      && evidence.scopePath === 'apps/api/test'
      && evidence.scopeStrength === 'explicit-boundary')).toBe(true);
    expect(nestedStore.evidence.some((evidence) => evidence.role === 'scope'
      && evidence.scopePath === 'apps/api'
      && evidence.scopeStrength === 'explicit-boundary'
      && evidence.description?.includes('Vitest'))).toBe(true);
    expect(apiRegion).toBeDefined();
    expect(testRegion).toMatchObject({
      parentRegionId: apiRegion?.id,
      depth: (apiRegion?.depth ?? 0) + 1,
      metadata: { scopePromotion: 'explicit-boundary' },
    });
    expect(apiRegion?.childRegionIds).toEqual([testRegion?.id]);

    const projectId = nestedStackMap.nodes.find((node) => node.type === 'project')?.id;
    expect(nestedStackMap.edges.filter((edge) => edge.sourceId === projectId).map((edge) => edge.targetId)).toContain(apiRegion?.id);
    expect(nestedStackMap.edges.some((edge) => edge.sourceId === projectId && edge.targetId === testRegion?.id)).toBe(false);
    expect(nestedStackMap.edges.some((edge) => nestedStackMap.regions?.some((region) => region.id === edge.sourceId)
      && nestedStackMap.regions?.some((region) => region.id === edge.targetId))).toBe(false);

    const regionsById = new Map((nestedStackMap.regions ?? []).map((region) => [region.id, region]));
    nestedStackMap.regions?.forEach((region) => {
      const visited = new Set<string>();
      let current: string | undefined = region.id;
      while (current) {
        expect(visited.has(current)).toBe(false);
        visited.add(current);
        current = regionsById.get(current)?.parentRegionId;
      }
    });

    const nestedLayout = layoutAnalyzerView(nestedStackMap);
    const positionedApi = nestedLayout.regions?.find((region) => region.region.id === apiRegion?.id);
    const positionedTest = nestedLayout.regions?.find((region) => region.region.id === testRegion?.id);
    expect(positionedApi).toBeDefined();
    expect(positionedTest).toBeDefined();
    expect(positionedTest!.x).toBeGreaterThan(positionedApi!.x);
    expect(positionedTest!.y).toBeGreaterThan(positionedApi!.y);
    expect(positionedTest!.x + positionedTest!.width).toBeLessThanOrEqual(positionedApi!.x + positionedApi!.width);
    expect(positionedTest!.y + positionedTest!.height).toBeLessThanOrEqual(positionedApi!.y + positionedApi!.height);
    const expandedNestedLayout = layoutAnalyzerView(nestedStackMap, new Set([nestedStackMap.nodes.find((node) => node.metadata.scopePath === 'apps/api/test' && node.metadata.stackId === 'typescript')?.id ?? '']));
    const expandedApi = expandedNestedLayout.regions?.find((region) => region.region.id === apiRegion?.id);
    const expandedTest = expandedNestedLayout.regions?.find((region) => region.region.id === testRegion?.id);
    expect(expandedTest!.height).toBeGreaterThan(positionedTest!.height);
    expect(expandedApi!.height).toBeGreaterThan(positionedApi!.height);
    const fitted = fitAnalyzerTransform(nestedLayout, 1000, 600);
    expect(fitted.x + (positionedTest!.x + positionedTest!.width) * fitted.scale).toBeLessThanOrEqual(1000 - 64 + 0.0001);

    const usageOnlyFixture = nestedScopeFixture().filter((file) => file.relativePath !== 'apps/api/test/tsconfig.json');
    const usageOnlyStackMap = projectStackMap(await scanProjectFiles(usageOnlyFixture));
    expect(usageOnlyStackMap.regions?.some((region) => region.metadata.scopePath === 'apps/api/test')).toBe(false);
    expect(usageOnlyStackMap.nodes.some((node) => node.metadata.stackId === 'vitest' && node.metadata.scopePath === 'apps/api')).toBe(true);

    const searched = presentAnalyzerView(nestedStackMap, { expandedPresentationIds: new Set(), filter: 'all', search: 'Vitest' });
    expect(searched.regions?.map((region) => region.id)).toEqual(expect.arrayContaining([apiRegion?.id, testRegion?.id]));
    expect(searched.regions?.find((region) => region.id === apiRegion?.id)?.childRegionIds).toContain(testRegion?.id);
    const filtered = presentAnalyzerView(nestedStackMap, { expandedPresentationIds: new Set(), filter: 'stack-usage', search: '' });
    expect(filtered.regions?.map((region) => region.id)).toEqual(expect.arrayContaining([apiRegion?.id, testRegion?.id]));

    const evidenceFor = (scopePath: string, stackId: string) => {
      const node = nestedStackMap.nodes.find((candidate) => candidate.type === 'stack-usage'
        && candidate.metadata.scopePath === scopePath
        && candidate.metadata.stackId === stackId);
      return node?.evidenceIds
        .map((evidenceId) => nestedStore.evidence.find((evidence) => evidence.id === evidenceId))
        .filter((evidence): evidence is NonNullable<typeof evidence> => Boolean(evidence)) ?? [];
    };
    const apiTypeScriptEvidence = evidenceFor('apps/api', 'typescript');
    const testTypeScriptEvidence = evidenceFor('apps/api/test', 'typescript');
    expect(apiTypeScriptEvidence.some((evidence) => evidence.role === 'usage' && evidence.filePath.startsWith('apps/api/src/'))).toBe(true);
    expect(apiTypeScriptEvidence.some((evidence) => evidence.filePath === 'apps/api/test/tsconfig.json')).toBe(false);
    expect(testTypeScriptEvidence.some((evidence) => evidence.role === 'scope' && evidence.filePath === 'apps/api/test/tsconfig.json')).toBe(true);
    expect(testTypeScriptEvidence.some((evidence) => evidence.role === 'usage' && evidence.filePath.startsWith('apps/api/test/'))).toBe(true);
    expect(apiTypeScriptEvidence.some((evidence) => evidence.role === 'declaration' && evidence.filePath === 'apps/api/package.json')).toBe(true);
    expect(testTypeScriptEvidence.filter((evidence) => evidence.filePath === 'apps/api/package.json').every((evidence) => evidence.role === 'declaration')).toBe(true);
    const apiVitestEvidence = evidenceFor('apps/api', 'vitest');
    const testVitestEvidence = evidenceFor('apps/api/test', 'vitest');
    expect(apiVitestEvidence.some((evidence) => evidence.role === 'usage' && evidence.filePath === 'apps/api/vitest.config.mts')).toBe(true);
    expect(testVitestEvidence.some((evidence) => evidence.role === 'usage' && evidence.filePath.startsWith('apps/api/test/'))).toBe(true);
    expect(apiVitestEvidence.some((evidence) => evidence.filePath.startsWith('apps/api/test/'))).toBe(false);

    const childOnlyFixture = nestedScopeFixture().filter((file) => file.relativePath !== 'apps/api/tsconfig.json' && file.relativePath !== 'apps/api/src/worker.ts');
    const childOnlyStore = await scanProjectFiles(childOnlyFixture);
    const childOnlyStackMap = projectStackMap(childOnlyStore);
    expect(childOnlyStackMap.nodes.some((node) => node.type === 'stack-usage'
      && node.metadata.scopePath === 'apps/api'
      && node.metadata.stackId === 'typescript')).toBe(false);
    expect(childOnlyStackMap.nodes.some((node) => node.type === 'stack-usage'
      && node.metadata.scopePath === 'apps/api/test'
      && node.metadata.stackId === 'typescript')).toBe(true);
  });

  it('routes Project fan-out only to top-level Regions and keeps a shared bus', async () => {
    const nestedStore = await scanProjectFiles(nestedScopeFixture());
    const nestedStackMap = projectStackMap(nestedStore);
    const layout = layoutAnalyzerView(nestedStackMap);
    const project = layout.nodes.find((node) => node.node.type === 'project');
    const apiRegion = layout.regions?.find((region) => region.region.metadata.scopePath === 'apps/api');
    const testRegion = layout.regions?.find((region) => region.region.metadata.scopePath === 'apps/api/test');
    const diagnostics: AnalyzerFanoutRoutingDiagnostic[] = [];
    const positionedById = new Map<string, PositionedGraphEndpoint>([
      ...layout.nodes.map((node) => [node.node.id, node] as const),
      ...(layout.regions ?? []).map((region) => [region.region.id, region] as const),
    ]);
    const routes = analyzerEdgeRoutes(nestedStackMap.edges, positionedById, analyzerEdgeObstacles(layout), {
      flowDirection: 'auto',
      bounds: { x: 0, y: 0, width: layout.width, height: layout.height },
      onFanoutDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });
    const projectRegion = diagnostics.find((diagnostic) => diagnostic.fanoutKind === 'project-region');
    const projectEdges = nestedStackMap.edges.filter((edge) => edge.sourceId === project?.node.id);

    expect(project).toBeDefined();
    expect(apiRegion).toBeDefined();
    expect(testRegion?.region.parentRegionId).toBe(apiRegion?.region.id);
    expect(projectEdges.map((edge) => edge.targetId)).toContain(apiRegion?.region.id);
    expect(projectEdges.some((edge) => edge.targetId === testRegion?.region.id)).toBe(false);
    expect(projectRegion).toMatchObject({
      fanoutKind: 'project-region',
      selectedDirection: 'down',
      fallbackUsed: false,
    });
    expect(projectRegion?.targetIds).not.toContain(testRegion?.region.id);
    expect(projectRegion?.targetIds.every((targetId) => nestedStackMap.regions?.some((region) => region.id === targetId && !region.parentRegionId))).toBe(true);
    const first = routes.get(projectEdges[0]!.id) ?? [];
    const second = routes.get(projectEdges[1]!.id) ?? first;
    if (projectEdges.length >= 2) expect(first.slice(0, 2)).toEqual(second.slice(0, 2));
    projectEdges.forEach((edge) => {
      const route = routes.get(edge.id) ?? [];
      const region = layout.regions?.find((candidate) => candidate.region.id === edge.targetId);
      expect(route.at(-1)?.y).toBe(region?.y);
    });
  });

  it('places Command Flow by execution rank and keeps concurrently branches on one stage', async () => {
    const store = await scanProjectFiles(analyzerFixture());
    const command = projectCommand(store);
    const layout = layoutAnalyzerView(command);
    const position = (predicate: (node: typeof layout.nodes[number]['node']) => boolean) => {
      const positioned = layout.nodes.find((candidate) => predicate(candidate.node));
      expect(positioned).toBeDefined();
      return positioned!;
    };
    const entry = position((node) => node.id.startsWith('user-command:'));
    const rootScript = position((node) => node.id === scriptIdFor(packageIdForPath('.'), 'dev'));
    const concurrently = position((node) => node.metadata.commandType === 'concurrently');
    const branches = layout.nodes.filter((candidate) => candidate.node.type === 'command' && /^root\.1\.[12]$/.test(String(candidate.node.metadata.branchPath)));

    expect(entry.x).toBeLessThan(rootScript.x);
    expect(rootScript.x).toBeLessThan(concurrently.x);
    expect(branches).toHaveLength(2);
    expect(branches[0]?.x).toBe(branches[1]?.x);
    expect(branches[0]?.y).not.toBe(branches[1]?.y);
    expect(entry.node.metadata.laneId).toBe(ANALYZER_COMMAND_COMMON_LANE_ID);
    expect(rootScript.node.metadata.laneId).toBe(ANALYZER_COMMAND_COMMON_LANE_ID);
    expect(concurrently.node.metadata.laneId).toBe(ANALYZER_COMMAND_COMMON_LANE_ID);
    expect(entry.y).toBe(rootScript.y);
    expect(rootScript.y).toBe(concurrently.y);
    expect(layout.lanes.some((lane) => lane.label.startsWith('COMMON · '))).toBe(true);
    command.edges
      .filter((edge) => ['expands-to', 'resolves-to', 'starts', 'uses'].includes(edge.kind))
      .forEach((edge) => {
        const source = layout.nodes.find((candidate) => candidate.node.id === edge.sourceId);
        const target = layout.nodes.find((candidate) => candidate.node.id === edge.targetId);
        if (source && target) expect(source.x).toBeLessThan(target.x);
      });
  });

  it('collapses command branches into readable lanes and expands only the selected branch', async () => {
    const store = await scanProjectFiles(analyzerFixture());
    const command = projectCommand(store);
    const options = { expandedPresentationIds: new Set<string>(), filter: 'all', search: '' };
    const collapsed = presentAnalyzerView(command, options);
    const branchSummaries = collapsed.nodes.filter((node) => node.presentation?.role === 'summary' && node.metadata.commandType === 'branch-summary');
    const webBranch = branchSummaries.find((node) => node.label === 'WEB');
    const expanded = webBranch
      ? presentAnalyzerView(command, { ...options, expandedPresentationIds: new Set([webBranch.id]) })
      : collapsed;
    expect(branchSummaries).toHaveLength(2);
    expect(webBranch).toBeDefined();
    expect(collapsed.nodes.some((node) => node.label === 'pnpm exec vite')).toBe(false);
    expect(collapsed.counts).toEqual({ visibleNodes: 5, totalNodes: 11, hiddenNodes: 6 });
    expect(layoutAnalyzerView(collapsed).lanes).toHaveLength(3);
    expect(expanded.nodes.some((node) => node.label === 'pnpm exec vite')).toBe(true);
    expect(expanded.nodes.some((node) => node.id === webBranch?.id)).toBe(false);
    expect(expanded.counts?.hiddenNodes).toBeLessThan(collapsed.counts?.hiddenNodes ?? 0);
    expect(layoutAnalyzerView(collapsed).lanes.every((lane) => /· \d+ STEPS$/.test(lane.label))).toBe(true);
    const expandedCommandLayout = layoutAnalyzerView(expanded);
    expect(expandedCommandLayout.summaryGroups).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: webBranch?.id, label: 'WEB', countLabel: 'STEPS' }),
    ]));
    const webGroup = expandedCommandLayout.summaryGroups.find((group) => group.id === webBranch?.id);
    const webGroupMembers = expandedCommandLayout.nodes.filter((positionedNode) => positionedNode.node.presentation?.parentId === webBranch?.id);
    const webLaneId = webGroupMembers[0]?.node.metadata.laneId;
    const webLane = expandedCommandLayout.lanes.find((lane) => lane.id === webLaneId);
    expect(webGroupMembers.length).toBeGreaterThan(0);
    expect(webLane).toBeDefined();
    expect((webGroup?.y ?? 0) + 8).toBeGreaterThanOrEqual((webLane?.y ?? 0) + 28 + 16);
    const fittedExpandedCommand = fitAnalyzerTransform(expandedCommandLayout, 1000, 600);
    expect(fittedExpandedCommand.y + ((webGroup?.y ?? 0) + (webGroup?.height ?? 0)) * fittedExpandedCommand.scale)
      .toBeLessThanOrEqual(600 - ANALYZER_FIT_PADDING.bottom + 0.0001);
    expect(layoutAnalyzerView(collapsed).summaryGroups).toHaveLength(0);
  });

  it('warns on recursive package scripts while retaining the cycle edge', async () => {
    const store = await scanProjectFiles(analyzerFixture());
    const cycleId = scriptIdFor(packageIdForPath('.'), 'cycle');
    const command = projectCommand(store, cycleId);

    expect(command.entryScriptId).toBe(cycleId);
    expect(command.edges.some((edge) => edge.kind === 'resolves-to' && edge.targetId === cycleId)).toBe(true);
    expect(command.warnings.some((warning) => warning.message.includes('Command cycle detected'))).toBe(true);
  });

  it('resolves Wrangler subcommands and explicit CLI stack terminals without changing && / concurrently presentation', async () => {
    const store = await scanProjectFiles(commandSemanticFixture());
    const root = packageIdForPath('.');
    const commandFor = (scriptName: string) => projectCommand(store, scriptIdFor(root, scriptName));
    const terminalFrom = (view: AnalyzerViewModel, commandLabel: string) => {
      const commandNode = view.nodes.find((node) => node.type === 'command' && node.label === commandLabel);
      expect(commandNode).toBeDefined();
      return view.edges.filter((edge) => edge.sourceId === commandNode!.id && edge.metadata.terminal === true);
    };

    const worker = commandFor('dev:worker');
    expect(terminalFrom(worker, 'wrangler dev')).toEqual([
      expect.objectContaining({ targetId: 'runtime:cloudflare-workers:wrangler.jsonc', kind: 'starts' }),
    ]);

    const migrate = commandFor('db:migrate');
    const d1Terminals = terminalFrom(migrate, 'wrangler d1 migrations apply DB --local --env development');
    expect(d1Terminals).toEqual([
      expect.objectContaining({ targetId: 'resource:wrangler.jsonc:d1:DB', kind: 'uses' }),
    ]);
    expect(d1Terminals.some((edge) => edge.kind === 'starts' && edge.targetId === 'runtime:cloudflare-workers:wrangler.jsonc')).toBe(false);
    expect(migrate.edges.some((edge) => (
      edge.kind === 'starts'
      && edge.targetId === 'runtime:cloudflare-workers:wrangler.jsonc'
    ))).toBe(false);

    const types = commandFor('types');
    expect(terminalFrom(types, 'wrangler types')).toEqual([
      expect.objectContaining({ targetId: 'runtime:cloudflare-workers:wrangler.jsonc', kind: 'uses' }),
    ]);

    const build = commandFor('build');
    expect(terminalFrom(build, 'vite build')).toEqual([
      expect.objectContaining({ targetId: 'technology:vite', kind: 'starts' }),
    ]);
    expect(terminalFrom(build, 'tsc -b')).toEqual([
      expect.objectContaining({ targetId: 'technology:typescript', kind: 'uses' }),
    ]);
    expect(build.edges.filter((edge) => edge.sourceId === scriptIdFor(root, 'build') && edge.kind === 'expands-to')).toEqual([
      expect.objectContaining({ metadata: expect.not.objectContaining({ operator: '&&' }) }),
      expect.objectContaining({ metadata: expect.objectContaining({ operator: '&&' }) }),
    ]);
    expect(build.edges.some((edge) => edge.sourceId.startsWith('user-command:') && edge.targetId === 'technology:vite')).toBe(false);

    const testView = commandFor('test');
    expect(terminalFrom(testView, 'vitest')).toEqual([
      expect.objectContaining({ targetId: 'technology:vitest', kind: 'starts' }),
    ]);

    const generate = commandFor('db:generate');
    expect(terminalFrom(generate, 'drizzle-kit generate')).toEqual([
      expect.objectContaining({ targetId: 'technology:drizzle-orm', kind: 'uses' }),
    ]);

    const check = commandFor('check');
    const checkFanout = check.edges.filter((edge) => edge.sourceId === scriptIdFor(root, 'check') && edge.kind === 'expands-to');
    expect(checkFanout).toHaveLength(3);
    expect(checkFanout.map((edge) => edge.metadata.operator)).toEqual([undefined, '&&', '&&']);
    expect(check.edges.some((edge) => edge.sourceId === scriptIdFor(root, 'check') && edge.targetId === 'technology:vite')).toBe(false);

    const entry = commandFor('dev');
    const concurrently = entry.nodes.find((node) => node.metadata.commandType === 'concurrently');
    expect(concurrently).toBeDefined();
    const parallel = entry.edges.filter((edge) => edge.sourceId === concurrently!.id && edge.kind === 'starts' && edge.metadata.parallel === true);
    expect(parallel).toHaveLength(2);
    expect(parallel.every((edge) => edge.metadata.operator !== '&&')).toBe(true);
    expect(entry.nodes.some((node) => node.metadata.commandType === 'branch-summary')).toBe(true);
  });

  it('shows Command Flow technology evidence from the current command package, not a sibling scope', async () => {
    const store = await scanProjectFiles(commandEvidenceLocalityFixture());
    const web = packageIdForPath('apps/web');
    const commandFor = (scriptName: string) => projectCommand(store, scriptIdFor(web, scriptName));
    const evidenceForNode = (view: AnalyzerViewModel, nodeId: string) => {
      const node = view.nodes.find((candidate) => candidate.id === nodeId);
      expect(node).toBeDefined();
      return node!.evidenceIds
        .map((evidenceId) => view.evidence.find((candidate) => candidate.id === evidenceId))
        .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));
    };
    const representativePath = (view: AnalyzerViewModel, nodeId: string) => evidenceForNode(view, nodeId)[0]?.filePath;
    const terminalTarget = (view: AnalyzerViewModel, commandLabel: string) => {
      const commandNode = view.nodes.find((node) => node.type === 'command' && node.label === commandLabel);
      expect(commandNode).toBeDefined();
      return view.edges.find((edge) => edge.sourceId === commandNode!.id && edge.metadata.terminal === true);
    };

    const production = commandFor('build:production');
    const typescriptEvidence = evidenceForNode(production, 'technology:typescript');
    const viteEvidence = evidenceForNode(production, 'technology:vite');
    expect(terminalTarget(production, 'tsc -b')).toMatchObject({ targetId: 'technology:typescript', kind: 'uses' });
    expect(terminalTarget(production, 'vite build')).toMatchObject({ targetId: 'technology:vite', kind: 'starts' });
    expect(representativePath(production, 'technology:typescript')).toBe('apps/web/package.json');
    expect(representativePath(production, 'technology:vite')).toBe('apps/web/package.json');
    expect(typescriptEvidence.every((evidence) => evidence.filePath.startsWith('apps/web'))).toBe(true);
    expect(viteEvidence.every((evidence) => evidence.filePath.startsWith('apps/web'))).toBe(true);
    expect(typescriptEvidence.some((evidence) => evidence.filePath === 'apps/api/package.json')).toBe(false);

    const testView = commandFor('test');
    expect(terminalTarget(testView, 'vitest')).toMatchObject({ targetId: 'technology:vitest', kind: 'starts' });
    expect(representativePath(testView, 'technology:vitest')).toBe('apps/web/package.json');
    expect(evidenceForNode(testView, 'technology:vitest').every((evidence) => evidence.filePath.startsWith('apps/web'))).toBe(true);

    const generate = commandFor('db:generate');
    expect(terminalTarget(generate, 'drizzle-kit generate')).toMatchObject({ targetId: 'technology:drizzle-orm', kind: 'uses' });
    expect(representativePath(generate, 'technology:drizzle-orm')).toBe('apps/web/package.json');
    expect(evidenceForNode(generate, 'technology:drizzle-orm').every((evidence) => evidence.filePath.startsWith('apps/web'))).toBe(true);

    const worker = commandFor('dev:worker');
    expect(terminalTarget(worker, 'wrangler dev')).toMatchObject({
      targetId: 'runtime:cloudflare-workers:apps/web/wrangler.jsonc',
      kind: 'starts',
    });
    expect(representativePath(worker, 'runtime:cloudflare-workers:apps/web/wrangler.jsonc')).toBe('apps/web/package.json');
    expect(evidenceForNode(worker, 'runtime:cloudflare-workers:apps/web/wrangler.jsonc').every((evidence) => evidence.filePath.startsWith('apps/web'))).toBe(true);

    const migrate = commandFor('db:migrate');
    expect(terminalTarget(migrate, 'wrangler d1 migrations apply DB --local')).toMatchObject({
      targetId: 'resource:apps/web/wrangler.jsonc:d1:DB',
      kind: 'uses',
    });
    expect(representativePath(migrate, 'resource:apps/web/wrangler.jsonc:d1:DB')).toBe('apps/web/package.json');
    expect(evidenceForNode(migrate, 'resource:apps/web/wrangler.jsonc:d1:DB').every((evidence) => evidence.filePath.startsWith('apps/web'))).toBe(true);

    const stackMap = projectStackMap(store);
    expect(stackMap.nodes.some((node) => node.type === 'stack-usage' && node.metadata.stackId === 'typescript' && node.metadata.scopePath === 'apps/api')).toBe(true);
    expect(stackMap.nodes.some((node) => node.type === 'stack-usage' && node.metadata.stackId === 'typescript' && node.metadata.scopePath === 'apps/web')).toBe(true);
  });
});

describe('Analyzer presentation layout and focus emphasis', () => {
  it('groups external packages by source without creating an external-to-external chain', () => {
    const view: AnalyzerViewModel = {
      view: 'dependencies',
      nodes: [
        { id: 'package:a', type: 'workspace-package', label: 'Package A', clusterId: 'dependencies:packages', evidenceIds: [], metadata: {} },
        { id: 'package:b', type: 'workspace-package', label: 'Package B', clusterId: 'dependencies:packages', evidenceIds: [], metadata: {} },
        { id: 'external:shared', type: 'external-package', label: 'shared-lib', clusterId: 'dependencies:external', evidenceIds: [], metadata: {} },
        { id: 'external:solo', type: 'external-package', label: 'solo-lib', clusterId: 'dependencies:external', evidenceIds: [], metadata: {} },
      ],
      edges: [
        { id: 'edge:a-shared', sourceId: 'package:a', targetId: 'external:shared', kind: 'depends-on', label: 'depends-on', evidenceIds: [], metadata: {} },
        { id: 'edge:b-shared', sourceId: 'package:b', targetId: 'external:shared', kind: 'depends-on', label: 'depends-on', evidenceIds: [], metadata: {} },
        { id: 'edge:b-solo', sourceId: 'package:b', targetId: 'external:solo', kind: 'depends-on', label: 'depends-on', evidenceIds: [], metadata: {} },
      ],
      clusters: [
        { id: 'dependencies:packages', label: 'Workspace Packages', tone: 'neutral', nodeIds: ['package:a', 'package:b'] },
        { id: 'dependencies:external', label: 'External Packages · 2', tone: 'cool', nodeIds: ['external:shared', 'external:solo'] },
      ],
      evidence: [],
      warnings: [],
    };
    const layout = layoutAnalyzerView(view);
    const externalPositions = layout.nodes.filter((positionedNode) => positionedNode.node.type === 'external-package');

    expect(new Set(externalPositions.map((positionedNode) => positionedNode.x)).size).toBe(1);
    expect(layout.bands.map((band) => band.label)).toEqual(expect.arrayContaining(['Shared External', 'Package B Dependencies']));
    expect(view.edges.some((edge) => edge.sourceId.startsWith('external:') && edge.targetId.startsWith('external:'))).toBe(false);
  });

  it('keeps a selected node and its one-hop context visible through a type filter', () => {
    const view: AnalyzerViewModel = {
      view: 'architecture',
      nodes: [
        { id: 'project', type: 'project', label: 'Project', evidenceIds: [], metadata: {} },
        { id: 'technology', type: 'technology', label: 'Technology', evidenceIds: [], metadata: {} },
        { id: 'runtime', type: 'runtime', label: 'Runtime', evidenceIds: [], metadata: {} },
      ],
      edges: [
        { id: 'edge:project-technology', sourceId: 'project', targetId: 'technology', kind: 'uses', label: 'uses', evidenceIds: [], metadata: {} },
        { id: 'edge:project-runtime', sourceId: 'project', targetId: 'runtime', kind: 'uses', label: 'uses', evidenceIds: [], metadata: {} },
      ],
      clusters: [],
      evidence: [],
      warnings: [],
    };
    const presented = presentAnalyzerView(view, { expandedPresentationIds: new Set(), filter: 'technology', search: '', selectedNodeId: 'project' });

    expect(presented.nodes.map((node) => node.id)).toEqual(expect.arrayContaining(['project', 'technology', 'runtime']));
    expect(presented.edges).toHaveLength(2);
  });

  it('emphasizes architecture paths by one-hop depth for high-degree focus', () => {
    const view: AnalyzerViewModel = {
      view: 'architecture',
      nodes: ['root', 'direct-a', 'direct-b', 'direct-c', 'direct-d', 'second', 'third'].map((id) => ({
        id,
        type: id === 'root' ? 'project' as const : 'technology' as const,
        label: id,
        evidenceIds: [],
        metadata: {},
      })),
      edges: [
        ['root', 'direct-a'], ['root', 'direct-b'], ['root', 'direct-c'], ['root', 'direct-d'],
        ['direct-a', 'second'], ['second', 'third'],
      ].map(([sourceId, targetId], index) => ({ id: `edge:${index}`, sourceId, targetId, kind: 'uses' as const, label: 'uses', evidenceIds: [], metadata: {} })),
      clusters: [],
      evidence: [],
      warnings: [],
    };
    const edge = (index: number) => view.edges[index]!;

    expect(analyzerFocusedEdgeEmphasis(view, edge(0), 'root')).toBe('primary');
    expect(analyzerFocusedEdgeEmphasis(view, edge(4), 'root')).toBe('secondary');
    expect(analyzerFocusedEdgeEmphasis(view, edge(5), 'root')).toBe('deep');
  });

  it('keeps Fit inside the explicit presentation padding', () => {
    const layout = layoutAnalyzerView({ view: 'workspace', nodes: [], edges: [], clusters: [], evidence: [], warnings: [] });
    const fitted = fitAnalyzerTransform({ ...layout, width: 1200, height: 800 }, 1000, 700);

    expect(fitted.x).toBeGreaterThanOrEqual(ANALYZER_FIT_PADDING.left);
    expect(fitted.y).toBeGreaterThanOrEqual(ANALYZER_FIT_PADDING.top);
    expect(fitted.x + 1200 * fitted.scale).toBeLessThanOrEqual(1000 - ANALYZER_FIT_PADDING.right + 0.0001);
    expect(fitted.y + 800 * fitted.scale).toBeLessThanOrEqual(700 - ANALYZER_FIT_PADDING.bottom + 0.0001);
  });
});

describe('Analyzer file discovery boundaries', () => {
  it('keeps meaningful hidden files while excluding generated, dependency, and secret inputs', () => {
    expect(isAnalyzerSourcePath('.firebaserc')).toBe(true);
    expect(isAnalyzerUsageSourcePath('src/App.tsx')).toBe(true);
    expect(isAnalyzerUsageSourcePath('node_modules/react/index.js')).toBe(false);
    expect(isAnalyzerSourcePath('.env')).toBe(false);
    expect(isExcludedPath('node_modules/package.json')).toBe(true);
    expect(sourceFilesFromInput([
      new File(['{}'], 'package.json', { type: 'application/json' }),
      new File(['{}'], 'ignored.json', { type: 'application/json' }),
    ]).map((file) => file.relativePath)).toEqual(['package.json', 'ignored.json']);
    expect(sourceFilesFromInput([new File(['{}'], 'package.json', { type: 'application/json' })])[0].relativePath).toBe('package.json');
  });
});
