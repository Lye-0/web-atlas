import { describe, expect, it } from 'vitest';
import { parseCommandExpression } from './commandParser';
import { makeEvidence, positionAt } from './evidence';
import { isAnalyzerSourcePath, isExcludedPath, sourceFilesFromInput } from './fileDiscovery';
import { parseDotnetProject, parsePackageJson, parsePnpmWorkspace, parseWranglerConfig } from './parsers';
import { projectCommand, projectDependencies, projectWorkspace } from './projectors';
import { scanProjectFiles } from './scan';
import { packageIdForPath, scriptIdFor, type AnalyzerSourceFile } from './types';

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
    expect(workspace.edges.every((edge) => ['contains', 'uses-config', 'declares', 'matches'].includes(edge.kind))).toBe(true);
    expect(dependencies.nodes.map((node) => node.id)).toEqual(expect.arrayContaining(['package:.', 'package:apps/web', 'technology:react', 'external-package:mystery-lib']));
    expect(dependencies.edges.some((edge) => edge.metadata.dependencyType === 'workspaceDependency')).toBe(true);
    expect(command.entryScriptId).toBe(scriptIdFor(packageIdForPath('.'), 'dev'));
    expect(command.nodes.some((node) => node.id.startsWith('user-command:'))).toBe(true);
    expect(command.nodes.some((node) => node.label === 'pnpm exec vite')).toBe(true);
    expect(command.edges.some((edge) => edge.kind === 'starts' && edge.targetId === 'technology:vite')).toBe(true);
    expect(command.evidence.length).toBeGreaterThan(store.evidence.length);
  });

  it('warns on recursive package scripts while retaining the cycle edge', async () => {
    const store = await scanProjectFiles(analyzerFixture());
    const cycleId = scriptIdFor(packageIdForPath('.'), 'cycle');
    const command = projectCommand(store, cycleId);

    expect(command.entryScriptId).toBe(cycleId);
    expect(command.edges.some((edge) => edge.kind === 'resolves-to' && edge.targetId === cycleId)).toBe(true);
    expect(command.warnings.some((warning) => warning.message.includes('Command cycle detected'))).toBe(true);
  });
});

describe('Analyzer file discovery boundaries', () => {
  it('keeps meaningful hidden files while excluding generated, dependency, and secret inputs', () => {
    expect(isAnalyzerSourcePath('.firebaserc')).toBe(true);
    expect(isAnalyzerSourcePath('.env')).toBe(false);
    expect(isExcludedPath('node_modules/package.json')).toBe(true);
    expect(sourceFilesFromInput([
      new File(['{}'], 'package.json', { type: 'application/json' }),
      new File(['{}'], 'ignored.json', { type: 'application/json' }),
    ]).map((file) => file.relativePath)).toEqual(['package.json', 'ignored.json']);
    expect(sourceFilesFromInput([new File(['{}'], 'package.json', { type: 'application/json' })])[0].relativePath).toBe('package.json');
  });
});
