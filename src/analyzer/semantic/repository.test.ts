// @vitest-environment node
import { readdir, readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { isAnalyzerSourcePath, isAnalyzerSemanticSourcePath, isExcludedDirectory } from '../fileDiscovery';
import { scanProjectFiles } from '../scan';
import type { AnalyzerSourceFile } from '../types';
import { analyzeSemanticSources } from './analyze';
import { semanticInput } from './client';
import { initializeTestParser, testLanguage, testParser } from './testRuntime';
import { projectSemanticView } from './project';
import { semanticViewIds } from './types';
import { summarizeSemanticGraph } from './presentation';

const roots = (process.env.WEB_ATLAS_VALIDATION_REPOS ?? '').split(';').filter(Boolean);
describe('semantic repository validation (read-only inputs)', () => {
  beforeAll(initializeTestParser);
  it.skipIf(!roots.length)('keeps every view consistent on opted-in repository sources', async () => {
    for (const root of roots) {
      const files: AnalyzerSourceFile[] = [];
      const visit = async (directory: string, prefix = '') => {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
          if (entry.isSymbolicLink()) continue;
          const relativePath = prefix + entry.name, absolute = join(directory, entry.name);
          if (entry.isDirectory()) { if (!isExcludedDirectory(entry.name)) await visit(absolute, `${relativePath}/`); }
          else if (isAnalyzerSourcePath(relativePath) || isAnalyzerSemanticSourcePath(relativePath)) {
            const size = (await stat(absolute)).size;
            files.push({ relativePath, name: entry.name, extension: extname(entry.name), size, readText: () => readFile(absolute, 'utf8') });
          }
        }
      };
      await visit(root); const store = await scanProjectFiles(files);
      const analysis = await analyzeSemanticSources(semanticInput(store), testLanguage, undefined, testParser);
      const counts: Record<string, unknown> = {};
      expect(analysis.stats.functions).toBeGreaterThan(0); expect(analysis.stats.models).toBeGreaterThan(0);
      const nodes = new Map(analysis.nodes.map(node => [node.id, node]));
      expect(nodes.size).toBe(analysis.nodes.length);
      for (const edge of analysis.edges) { expect(nodes.has(edge.source)).toBe(true); expect(nodes.has(edge.target)).toBe(true); }
      for (const view of semanticViewIds) {
        const graph = projectSemanticView(analysis, view); const overview = summarizeSemanticGraph(graph);
        expect(overview.nodes.flatMap(node => node.attributes.members as string[]).sort()).toEqual(graph.nodes.map(node => node.id).sort());
        expect(graph.nodes.length, view).toBeGreaterThan(0);
        counts[view] = { nodes: graph.nodes.length, edges: graph.edges.length, groups: overview.nodes.length };
      }
      console.info('[semantic validation]', basename(root), JSON.stringify({ stats: analysis.stats, coverage: analysis.coverage.reduce((counts, file) => ({ ...counts, [file.status]: (counts[file.status] ?? 0) + 1 }), {} as Record<string, number>), views: counts }));
      // Explicitly opted-in browser fixtures stay in this project's ignored cache.
      if (process.env.WEB_ATLAS_VALIDATION_SNAPSHOT === '1') { await mkdir('.cache/semantic-validation', { recursive: true }); await writeFile(`.cache/semantic-validation/${basename(root)}.json`, JSON.stringify(store)); await writeFile(`.cache/semantic-validation/${basename(root)}-analysis.json`, JSON.stringify(analysis)); }
    }
  }, 120000);
});
