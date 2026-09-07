// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AnalyzerProjectStore } from '../types';
import { projectSemanticView } from './project';
import { buildSemanticExplorer, explorerRegionIdentity, explorerRelations, layoutExplorerRelations } from './semanticExplorer';
import { maskSemanticSource } from './sourceMask';
import { buildUnresolvedFlowPresentation, visibleUnresolvedFlowPositions } from './flowUnresolvedPresentation';
import { semanticFlowEdgePaths } from './flowPresentation';
import { semanticFlowRegions } from './flowRegions';
import type { SemanticAnalysis } from './types';

const roots = (process.env.WEB_ATLAS_VALIDATION_REPOS ?? '').split(';').filter(Boolean);
// A fresh generic repository validation must never depend on this review's cached inputs.
const enabled = roots.length > 0 && process.env.WEB_ATLAS_POLISH_REVIEW === '1';
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const fingerprint = (value: unknown) => sha256(JSON.stringify(value));
const destination = '.cache/tabs-6-7-point-edge-polish-20260907/accuracy';

describe('independent five-item polish actual-source conservation', () => {
  it.skipIf(!enabled)('holds the same masked source, canonical facts, ownership, 3D point vectors and 2D paths before/after', async () => {
    const projects = [];
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
          for (const evidence of [...edge.evidence, ...(edge.provenance?.edges.flatMap(item => item.evidence) ?? [])]) {
            const source = sources[evidence.path] ?? store.sources[evidence.path];
            expect(source, evidence.path).toBeDefined();
            expect(evidence.start).toBeGreaterThanOrEqual(0); expect(evidence.end).toBeLessThanOrEqual(source!.length);
            expect(evidence.end).toBeGreaterThanOrEqual(evidence.start);
          }
        }
        const cloud = buildUnresolvedFlowPresentation(graph, explorer);
        const vectors = [...cloud.regular, ...cloud.individual].map(point => [point.node.id, point.x, point.y, point.z]);
        const all = visibleUnresolvedFlowPositions(cloud, new Set(), undefined, true);
        for (const node of cloud.members) {
          expect(node.confidence).toBe('unresolved');
          expect(explorer.owners.get(node.id)).toMatchObject({ definitionAvailable: false, filePath: undefined });
        }
        if (cloud.aggregate) {
          expect(ids.has(cloud.aggregate.node.id)).toBe(false);
          expect(cloud.aggregate.node).toMatchObject({ group: '表示上の集約', evidence: [] });
          expect(cloud.aggregate.node.path).toBeUndefined();
        }
        const regions = semanticFlowRegions(cloud.regular, '3d', explorer);
        for (const region of regions) for (const id of region.nodeIds) expect(explorerRegionIdentity(explorer, id).id).toBe(region.id);
        expect(regions.flatMap(region => region.nodeIds).sort()).toEqual(cloud.regular.map(point => point.node.id).sort());
        const degrees = new Map<string, number>();
        for (const edge of graph.edges) for (const id of [edge.source, edge.target]) degrees.set(id, (degrees.get(id) ?? 0) + 1);
        const interesting = graph.nodes.filter(node => ['GraphPanel.load', 'GraphPanel.send', 'GraphSvg', 'callback L163'].includes(node.label));
        const busiest = [...graph.nodes].sort((a, b) => (degrees.get(b.id) ?? 0) - (degrees.get(a.id) ?? 0)).slice(0, 3);
        const cases = [...new Map([...interesting, ...busiest].map(node => [node.id, node])).values()].map(node => {
          const local = explorerRelations(graph, node.id), positions = layoutExplorerRelations(local, node.id);
          const paths = semanticFlowEdgePaths(local, positions, new Set([node.id]), undefined, '2d');
          const visible = visibleUnresolvedFlowPositions(cloud, new Set([node.id]));
          const fixed = new Map(all.map(point => [point.node.id, point]));
          for (const point of visible) expect([point.x, point.y, point.z]).toEqual([fixed.get(point.node.id)!.x, fixed.get(point.node.id)!.y, fixed.get(point.node.id)!.z]);
          return { id: node.id, label: node.label, path: node.path, line: node.line, evidence: node.evidence,
            localNodes: local.nodes.length, localEdges: local.edges.length,
            positions2dSha256: fingerprint(positions.map(point => [point.node.id, point.x, point.y, point.z])),
            paths2dSha256: fingerprint(paths), incidentEdgesSha256: fingerprint(graph.edges.filter(edge => edge.source === node.id || edge.target === node.id)),
          };
        });
        if (name === 'git-lines' && view === 'function-call-flow') {
          for (const label of ['GraphPanel.load', 'GraphPanel.send', 'GraphSvg']) expect(interesting.some(node => node.label === label), label).toBe(true);
          const duplicate = interesting.filter(node => node.label === 'callback L163');
          expect(duplicate.length).toBeGreaterThan(1);
          expect(new Set(duplicate.map(node => node.id)).size).toBe(duplicate.length);
          for (const node of duplicate) {
            const evidence = node.evidence[0]!;
            expect(sources[evidence.path]!.slice(0, evidence.start).split('\n').length).toBe(163);
            expect(sources[evidence.path]!.slice(evidence.start, evidence.end)).toContain('=>');
          }
        }
        expect(JSON.stringify(graph)).toBe(before);
        views.push({ view, nodes: graph.nodes.length, edges: graph.edges.length, nodeSha256: fingerprint(graph.nodes), edgeSha256: fingerprint(graph.edges),
          ownersSha256: fingerprint([...explorer.owners]), pointVectors3dSha256: fingerprint(vectors),
          regionMembershipSha256: fingerprint(regions.map(region => [region.id, region.nodeIds])),
          unresolvedTargets: cloud.members.length, unresolvedRelations: cloud.relationCount, unresolvedCallsites: cloud.callSiteCount, cases });
      }
      projects.push({ name, storeSha256: sha256(storeText), analysisSha256: sha256(analysisText), manifest, views,
        preexistingPartialCoverage: analysis.coverage.filter(file => file.status === 'partial') });
    }
    const phase = process.env.WEB_ATLAS_POLISH_REPORT;
    if (phase === 'baseline' || phase === 'final') {
      await mkdir(destination, { recursive: true });
      if (phase === 'final') {
        const baseline = JSON.parse(await readFile(`${destination}/baseline-source-report.json`, 'utf8')) as { projects: unknown[] };
        expect(projects).toEqual(baseline.projects);
      }
      await writeFile(`${destination}/${phase}-source-report.json`, JSON.stringify({ projects }, null, 2));
    }
    console.info('[polish source accuracy]', JSON.stringify(projects.map(project => ({ name: project.name, sourceFiles: project.manifest.length,
      maskedFiles: project.manifest.filter(file => file.maskingChanged).length, views: project.views.map(({ cases, ...counts }) => ({ ...counts, cases: cases.length })) }))));
  }, 120000);
});
