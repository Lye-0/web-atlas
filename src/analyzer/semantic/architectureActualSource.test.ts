// @vitest-environment node
import { beforeAll, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { scanProjectFiles } from '../scan';
import { semanticInput } from './client';
import { analyzeSemanticSources } from './analyze';
import { initializeTestParser, testLanguage, testParser } from './testRuntime';
import { architectureScopeGraph } from './architectureProjection';
const folder = '.cache/architecture-map-20260909';
beforeAll(initializeTestParser);
for (const name of ['git-lines', 'vehicle-management', 'web-atlas']) it.skipIf(!existsSync(`${folder}/inputs/${name}.json`))(`inspects fixed local ${name} sources without executing them`, async () => {
  const sources = JSON.parse(readFileSync(`${folder}/inputs/${name}.json`, 'utf8')) as Record<string, string>;
  const store = await scanProjectFiles(Object.entries(sources).map(([relativePath, text]) => ({ relativePath, name: relativePath.split('/').at(-1)!, extension: `.${relativePath.split('.').at(-1)}`, size: text.length, readText: async () => text })));
  const analysis = await analyzeSemanticSources(semanticInput(store), testLanguage, undefined, testParser);
  const model = analysis.architecture!, root = architectureScopeGraph(model);
  writeFileSync(`${folder}/${name}.actual.json`, JSON.stringify({ sourceFiles: Object.keys(sources).length, nodes: model.nodes.map(n => ({ id: n.id, label: n.label, architecture: n.architecture, evidence: n.evidence.map(e => ({ path: e.path, line: e.line, description: e.description })) })), edges: root.edges.map(e => ({ source: root.nodes.find(n => n.id === e.source)?.label, target: root.nodes.find(n => n.id === e.target)?.label, kind: e.kind, confidence: e.confidence, environment: e.details?.environment, count: e.provenance?.edges.length })), rootCount: root.nodes.length, limitations: model.limitations }, null, 2));
  expect(root.nodes.length).toBeGreaterThan(0);
  expect(new Set(model.nodes.map(n => n.id)).size).toBe(model.nodes.length);
  if (name === 'git-lines') {
    expect(root.nodes.some(n => n.architecture?.context.includes('Extension Host'))).toBe(true);
    expect(root.nodes.some(n => n.architecture?.context.includes('Webview / ブラウザ'))).toBe(true);
    expect(root.edges.filter(e => e.kind === 'message')).toHaveLength(2);
    expect(root.nodes.some(n => n.label === 'git（起動先の既定値）' && n.confidence === 'inferred')).toBe(true);
  }
  if (name === 'vehicle-management') {
    expect(root.nodes.some(n => n.label === 'vehicle-management-api')).toBe(true);
    expect(root.nodes.some(n => n.label === 'VehicleManagement.Companion' && n.architecture?.context.includes('.NET / WPF'))).toBe(true);
    expect(model.environments).toEqual(['development', 'production']);
    expect(root.nodes.some(n => n.label === 'Firebase authエミュレーター :9099')).toBe(true);
    const production = architectureScopeGraph(model, undefined, 'production');
    const development = architectureScopeGraph(model, undefined, 'development');
    expect(production.nodes.filter(n => n.architecture?.kind === 'resource').every(n => n.architecture!.environments.includes('production'))).toBe(true);
    expect(development.nodes.some(n => n.label === 'vehicle-management-db' && n.architecture?.environments.includes('development'))).toBe(true);
  }
  if (name === 'web-atlas') {
    expect(root.nodes.filter(n => n.architecture?.kind === 'application').map(n => n.label)).toEqual(['web-atlas']);
    expect(root.nodes.some(n => n.architecture?.kind === 'resource')).toBe(false);
  }
}, 120000);
