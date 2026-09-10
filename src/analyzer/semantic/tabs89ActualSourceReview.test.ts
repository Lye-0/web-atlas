// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanProjectFiles } from '../scan';
import { analyzeSemanticSources } from './analyze';
import { semanticInput } from './client';
import { initializeTestParser, testLanguage, testParser } from './testRuntime';
import { projectSemanticView } from './project';

const enabled = process.env.WEB_ATLAS_TABS89_ACCURACY === '1';
const destination = '.cache/tabs-8-9-refactor-20260908/accuracy';
const checkpoint = process.env.WEB_ATLAS_TABS89_CHECKPOINT ?? 'review';
interface Snapshot { projectName: string; head: string; files: { path: string; content: string; sha256: string }[] }
interface Case { id: string; project: string; evidence: { path: string; start: number; end: number; line: number; endLine: number; expression: string; sha256: string }[]; expectations: string[]; negative: string[] }

describe('opt-in independent tabs8/9 fixed actual-source review capture', () => {
  it.skipIf(!enabled)('collects exact-checkpoint observations; collection success is not semantic acceptance', async () => {
    await initializeTestParser();
    const fixed = JSON.parse(await readFile(`${destination}/expected-results.json`, 'utf8')) as { createdBeforeAnalyzerOutput: boolean; cases: Case[] };
    expect(fixed.createdBeforeAnalyzerOutput).toBe(true);
    await mkdir(`${destination}/${checkpoint}`, { recursive: true });
    const productPaths = ['src/analyzer/scan.ts', ...['analyze.ts', 'types.ts', 'dataCompiler.ts', 'dataFlow.ts', 'dataModels.ts', 'dataSchemas.ts', 'dataSchemaFiles.ts', 'project.ts', 'client.ts'].map(path => `src/analyzer/semantic/${path}`)];
    const fingerprint = async () => Object.fromEntries(await Promise.all(productPaths.map(async path => [path, createHash('sha256').update(await readFile(path)).digest('hex')])));
    const productBefore = await fingerprint();
    await writeFile(`${destination}/${checkpoint}/product-fingerprint.json`, JSON.stringify(productBefore, null, 2));
    for (const name of ['git-lines', 'vehicle-management']) {
      const snapshot = JSON.parse(await readFile(`${destination}/${name}.files.json`, 'utf8')) as Snapshot;
      const files = snapshot.files.map(f => ({ relativePath: f.path, name: basename(f.path), extension: extname(f.path), size: f.content.length, readText: async () => f.content }));
      for (const f of snapshot.files) expect(createHash('sha256').update(f.content).digest('hex')).toBe(f.sha256);
      const store = await scanProjectFiles(files), input = semanticInput(store);
      const analysis = await analyzeSemanticSources(input, testLanguage, undefined, testParser);
      const sourceTexts = new Map(snapshot.files.map(f => [f.path, f.content])), ids = new Set(analysis.nodes.map(n => n.id));
      expect(ids.size, `${name}: duplicate canonical node IDs`).toBe(analysis.nodes.length);
      expect(new Set(analysis.edges.map(e => e.id)).size, `${name}: duplicate canonical edge IDs`).toBe(analysis.edges.length);
      for (const edge of analysis.edges) { expect(ids.has(edge.source), edge.id).toBe(true); expect(ids.has(edge.target), edge.id).toBe(true); }
      const evidence = [
        ...analysis.nodes.flatMap(n => [...n.evidence, ...(n.fields?.flatMap(f => f.evidence ?? []) ?? []), ...(n.model?.constraints?.flatMap(c => c.evidence) ?? [])]),
        ...analysis.edges.flatMap(e => e.evidence),
      ];
      for (const e of evidence) {
        const text = sourceTexts.get(e.path); expect(text, `${name}:${e.path}`).toBeDefined();
        expect(e.start).toBeGreaterThanOrEqual(0); expect(e.end).toBeGreaterThanOrEqual(e.start); expect(e.end).toBeLessThanOrEqual(text!.length);
        // Explicit source anchors already verify exact expressions; this checks all emitted ranges, not semantic truth.
      }
      await writeFile(`${destination}/${checkpoint}/${name}.store.json`, JSON.stringify(store));
      await writeFile(`${destination}/${checkpoint}/${name}.analysis.json`, JSON.stringify(analysis));
      const observations = fixed.cases.filter(c => c.project === name).map(c => {
        for (const e of c.evidence) { const f = snapshot.files.find(f => f.path === e.path)!; expect(f.sha256).toBe(e.sha256); expect(f.content.slice(e.start, e.end)).toBe(e.expression); }
        const matches = analysis.nodes.filter(n => n.evidence.some(e => c.evidence.some(source => e.path === source.path && e.start < source.end && e.end > source.start)));
        const ids = new Set(matches.map(n => n.id));
        const edges = analysis.edges.filter(e => (e.views.includes('data-flow') || e.views.includes('data-model')) && (ids.has(e.source) || ids.has(e.target)));
        const relatedIds = new Set(edges.flatMap(e => [e.source, e.target]));
        return { ...c, status: 'NOT_RUN: semantic reviewer must assess observations against fixed expectation', nodes: matches, relatedNodes: analysis.nodes.filter(n => relatedIds.has(n.id) && !ids.has(n.id)), edges };
      });
      const views = ['data-flow', 'data-model'] as const;
      const counts = Object.fromEntries(views.map(view => { const graph = projectSemanticView(analysis, view); return [view, { nodes: graph.nodes.length, edges: graph.edges.length }]; }));
      await writeFile(`${destination}/${checkpoint}/${name}.observations.json`, JSON.stringify({ head: snapshot.head, counts, cases: observations }, null, 2));
      console.info(JSON.stringify({ project: name, sourceFiles: files.length, sourceCases: observations.length, counts }));
    }
    expect(await fingerprint(), 'Semantic product files changed during review capture; rerun fixed checkpoint').toEqual(productBefore);
  }, 180000);
});
