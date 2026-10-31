// @vitest-environment node
import { expect, it } from 'vitest';
import { readdir, readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { filesFromDirectoryHandle, type DirectoryHandleLike } from '../fileDiscovery';
import { scanProjectFiles } from '../scan';
import { semanticInput } from './client';
import { analyzeSemanticSources } from './analyze';
import { initializeTestParser, testLanguage, testParser } from './testRuntime';
import { projectSemanticView } from './project';
import { prepareArchitectureScope, architectureScopeGraph } from './architectureProjection';
import { layoutSemanticFlow } from './flowPresentation';
it.skipIf(!process.env.WEB_ATLAS_STABILITY_REVIEW_ROOT)('analyzes a large project read-only without executing its files', async () => {
  const root = process.env.WEB_ATLAS_STABILITY_REVIEW_ROOT!, reads: string[] = [];
  const directory = (relative: string): DirectoryHandleLike => ({ kind: 'directory', name: relative.split('/').at(-1) || 'root', async *values() {
    for (const entry of await readdir(join(root, relative), { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) yield directory(path);
      else if (entry.isFile()) yield { kind: 'file', name: entry.name, getFile: async () => ({ size: (await stat(join(root, path))).size, text: async () => { reads.push(path); return readFile(join(root, path), 'utf8'); } }) as unknown as File };
    }
  } });
  const started = performance.now(), files = await filesFromDirectoryHandle(directory('')), discoveredMs = performance.now() - started;
  expect(files.every(file => !/(?:^|\/)(?:\.venv|__pycache__|node_modules)(?:\/|$)/.test(file.relativePath))).toBe(true);
  const scanned = performance.now(), store = await scanProjectFiles(files), scanMs = performance.now() - scanned;
  await initializeTestParser(); const prepared = performance.now(), input = semanticInput(store, true), prepareMs = performance.now() - prepared;
  const analyzed = performance.now(), analysis = await analyzeSemanticSources(input, testLanguage, undefined, testParser), analyzeMs = performance.now() - analyzed;
  const views = Object.fromEntries((['runtime-flow', 'function-call-flow', 'data-flow', 'data-model', 'architecture-map'] as const).map(view => {
    const graph = view === 'architecture-map' ? architectureScopeGraph(analysis.architecture!) : projectSemanticView(analysis, view);
    expect(graph.nodes.length).toBeGreaterThan(0);
    const ids = new Set(graph.nodes.map(n => n.id)); expect(ids.size).toBe(graph.nodes.length);
    expect(graph.edges.every(e => ids.has(e.source) && ids.has(e.target))).toBe(true);
    return [view, { nodes: graph.nodes.length, edges: graph.edges.length }];
  }));
  const scope = prepareArchitectureScope(analysis.architecture!, undefined, '', true);
  expect(scope.allowed.length).toBeGreaterThan(0);
  const positions = layoutSemanticFlow(architectureScopeGraph(analysis.architecture!), '2d');
  expect(positions.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  expect(reads.every(path => !path.includes('/.venv/'))).toBe(true);
  await mkdir('.cache/stability-review', { recursive: true });
  await writeFile('.cache/stability-review/actual.json', JSON.stringify({ files: files.length, readFiles: reads.length, sources: Object.keys(input.sources).length, discoveredMs, scanMs, prepareMs, analyzeMs, stats: analysis.stats, views }, null, 2));
}, 300000);
