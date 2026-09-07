// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AnalyzerProjectStore } from '../types';
import { projectSemanticView } from './project';
import { buildSemanticExplorer, explorerLocationForNode, explorerRelations } from './semanticExplorer';
import { maskSemanticSource } from './sourceMask';
import type { SemanticAnalysis, SemanticGraph } from './types';

const roots = (process.env.WEB_ATLAS_VALIDATION_REPOS ?? '').split(';').filter(Boolean);
const reviewEnabled = roots.length > 0 && process.env.WEB_ATLAS_FOUR_FIXES_REVIEW === '1';
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const callsites = (graph: SemanticGraph) => new Set(graph.edges.filter(edge => edge.kind === 'calls').flatMap(edge =>
  edge.evidence.map(item => JSON.stringify([item.path, item.start, item.end])))).size;

/** Opt in only: read original text; never import or execute project code. */
describe('independent four-fix actual-source accuracy', () => {
  it.skipIf(!reviewEnabled)('compares immutable masked snapshots, original source ranges, IDs and canonical counts', async () => {
    const reports = [];
    for (const root of roots) {
      const name = basename(root), snapshot = `.cache/semantic-validation/${name}`;
      const storeText = await readFile(`${snapshot}.json`, 'utf8'), analysisText = await readFile(`${snapshot}-analysis.json`, 'utf8');
      const store = JSON.parse(storeText) as AnalyzerProjectStore, analysis = JSON.parse(analysisText) as SemanticAnalysis;
      const sources = store.semanticSources ?? store.sources;
      const manifest = [];
      for (const [path, masked] of Object.entries(sources)) {
        const original = await readFile(join(root, path), 'utf8');
        expect(masked, path).toBe(maskSemanticSource(original));
        expect(masked.length, path).toBe(original.length);
        expect(masked.split('\n').length, path).toBe(original.split('\n').length);
        manifest.push({ path, originalSha256: sha256(original), maskedSha256: sha256(masked), characters: original.length, maskingChanged: masked !== original });
      }
      const views = [];
      for (const view of ['runtime-flow', 'function-call-flow'] as const) {
        const graph = projectSemanticView(analysis, view), before = JSON.stringify(graph);
        const explorer = buildSemanticExplorer(graph, new Set(store.files.map(file => file.relativePath)));
        const ids = new Set(graph.nodes.map(node => node.id));
        expect(ids.size).toBe(graph.nodes.length);
        expect(new Set(graph.edges.map(edge => edge.id)).size).toBe(graph.edges.length);
        for (const edge of graph.edges) {
          expect(ids.has(edge.source)).toBe(true); expect(ids.has(edge.target)).toBe(true);
          for (const evidence of edge.evidence) {
            const source = sources[evidence.path] ?? store.sources[evidence.path];
            expect(source, evidence.path).toBeDefined();
            expect(evidence.start).toBeGreaterThanOrEqual(0); expect(evidence.end).toBeLessThanOrEqual(source!.length);
            expect(evidence.end).toBeGreaterThanOrEqual(evidence.start);
          }
        }
        const external = graph.nodes.filter(node => node.kind === 'external');
        const externalIds = new Set(external.map(node => node.id));
        const externalGraph = { ...graph, edges: graph.edges.filter(edge => externalIds.has(edge.target) || externalIds.has(edge.source)) };
        for (const node of external) {
          expect(node.confidence).toBe('unresolved');
          expect(explorer.owners.get(node.id)).toMatchObject({ definitionAvailable: false, filePath: undefined });
          expect(explorerLocationForNode(explorer, node.id).centerId).toBe(node.id);
        }
        expect(JSON.stringify(graph)).toBe(before);
        views.push({ view, nodes: graph.nodes.length, edges: graph.edges.length, calls: graph.edges.filter(edge => edge.kind === 'calls').length,
          callsites: callsites(graph), unresolvedTargets: external.length, unresolvedRelations: externalGraph.edges.length,
          unresolvedCallsites: callsites(externalGraph), nodeSha256: sha256(JSON.stringify(graph.nodes)), edgeSha256: sha256(JSON.stringify(graph.edges)) });
      }
      const selected = [];
      if (name === 'git-lines') {
        const graph = projectSemanticView(analysis, 'function-call-flow');
        const initializer = graph.nodes.find(node => node.path === 'scripts/build-extension.mjs' && node.attributes.initializer === true)!;
        expect(initializer).toMatchObject({ kind: 'function', label: '<module>', attributes: { initializer: true } });
        expect(sources[initializer.path!]).toMatch(/^import[^\n]+\r?\n\r?\nawait build\(/);
        const moduleRelations = explorerRelations(graph, initializer.id);
        expect(moduleRelations.nodes).toHaveLength(2); expect(moduleRelations.edges).toHaveLength(1);
        const moduleCall = moduleRelations.edges[0]!;
        expect(moduleCall).toMatchObject({ source: initializer.id, kind: 'calls', confidence: 'unresolved' });
        expect(moduleCall.evidence[0]?.line).toBe(3);
        selected.push({ case: 'top-level initializer', id: initializer.id, edgeIds: [moduleCall.id] });
        const startsWith = graph.nodes.find(node => node.path === 'src/git/parsers/refParser.ts' && node.label === 'fullName.startsWith')!;
        expect(startsWith).toMatchObject({ kind: 'external', confidence: 'unresolved' });
        const refType = graph.nodes.find(node => node.path === startsWith.path && node.label === 'refType' && node.kind === 'function')!;
        const repeated = graph.edges.filter(edge => edge.source === refType.id && edge.target === startsWith.id && edge.kind === 'calls');
        expect(repeated).toHaveLength(3);
        expect(repeated.map(edge => edge.evidence[0]?.line).sort()).toEqual([5, 6, 7]);
        expect(new Set(repeated.map(edge => edge.id)).size).toBe(3);
        const expressions = repeated.map(edge => { const ev = edge.evidence[0]!; return sources[ev.path]!.slice(ev.start, ev.end); });
        expect(expressions).toEqual(["fullName.startsWith('refs/heads/')", "fullName.startsWith('refs/remotes/')", "fullName.startsWith('refs/tags/')"]);
        selected.push({ case: 'same callee, three original callsites', id: startsWith.id, edgeIds: repeated.map(edge => edge.id) });
        const circular = graph.nodes.find(node => node.kind === 'function' && node.label === 'circularDistance')!;
        expect(circular).toBeDefined();
        const mathCalls = graph.edges.filter(edge => edge.source === circular.id && edge.kind === 'calls');
        expect(mathCalls.map(edge => graph.nodes.find(node => node.id === edge.target)?.label).sort()).toEqual(['Math.abs', 'Math.min']);
        for (const edge of mathCalls) expect(graph.nodes.find(node => node.id === edge.target)).toMatchObject({ kind: 'external', confidence: 'unresolved' });
        selected.push({ case: 'two direct unresolved Math endpoints', id: circular.id, edgeIds: mathCalls.map(edge => edge.id) });
      }
      reports.push({ name, storeSha256: sha256(storeText), analysisSha256: sha256(analysisText), manifest, views, selected,
        preexistingPartialCoverage: analysis.coverage.filter(file => file.status === 'partial') });
    }
    const phase = process.env.WEB_ATLAS_FOUR_FIXES_REPORT;
    if (phase === 'baseline' || phase === 'final') {
      await mkdir('.cache/tabs-6-7-four-fixes/accuracy', { recursive: true });
      if (phase === 'final') {
        const baseline = JSON.parse(await readFile('.cache/tabs-6-7-four-fixes/accuracy/baseline-source-report.json', 'utf8')) as { projects: unknown[] };
        expect(reports).toEqual(baseline.projects);
      }
      await writeFile(`.cache/tabs-6-7-four-fixes/accuracy/${phase}-source-report.json`, JSON.stringify({ projects: reports }, null, 2));
    }
    console.info('[four-fix source accuracy]', JSON.stringify(reports.map(report => ({ name: report.name, sourceFiles: report.manifest.length,
      maskedFiles: report.manifest.filter(file => file.maskingChanged).length, views: report.views, selected: report.selected }))));
  }, 120000);
});
