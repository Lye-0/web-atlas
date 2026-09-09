// @vitest-environment node
import { beforeAll, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { scanProjectFiles } from '../scan';
import { semanticInput } from './client';
import { analyzeSemanticSources } from './analyze';
import { initializeTestParser, testLanguage, testParser } from './testRuntime';
import { architectureScopeGraph } from './architectureProjection';
import { architecturePartners, architectureRequestSources } from '../../components/analyzer/architectureSummary';
import { semanticNodeDisplays } from '../../components/analyzer/semanticFlowDisplay';
const folder = process.env.ARCHITECTURE_REVIEW_DIR ?? (existsSync('.cache/architecture-focus-20260909/inputs') ? '.cache/architecture-focus-20260909' : '.cache/architecture-map-20260909');
beforeAll(initializeTestParser);
for (const name of ['git-lines', 'vehicle-management', 'web-atlas']) it.skipIf(!existsSync(`${folder}/inputs/${name}.json`))(`inspects fixed local ${name} sources without executing them`, async () => {
  const inputName = name === 'vehicle-management' && existsSync(`${folder}/inputs/vehicle-management-local.json`) ? 'vehicle-management-local' : name;
  const sources = JSON.parse(readFileSync(`${folder}/inputs/${inputName}.json`, 'utf8')) as Record<string, string>;
  const store = await scanProjectFiles(Object.entries(sources).map(([relativePath, text]) => ({ relativePath, name: relativePath.split('/').at(-1)!, extension: `.${relativePath.split('.').at(-1)}`, size: text.length, readText: async () => text })));
  const analysis = await analyzeSemanticSources(semanticInput(store), testLanguage, undefined, testParser);
  const model = analysis.architecture!, root = architectureScopeGraph(model);
  writeFileSync(`${folder}/${name}.actual.json`, JSON.stringify({ sourceFiles: Object.keys(sources).length, nodes: model.nodes.map(n => ({ id: n.id, label: n.label, architecture: n.architecture, evidence: n.evidence.map(e => ({ path: e.path, line: e.line, description: e.description })) })), edges: root.edges.map(e => ({ source: root.nodes.find(n => n.id === e.source)?.label, target: root.nodes.find(n => n.id === e.target)?.label, kind: e.kind, confidence: e.confidence, environment: e.details?.environment, count: e.provenance?.edges.length })), rootCount: root.nodes.length, limitations: model.limitations }, null, 2));
  expect(root.nodes.length).toBeGreaterThan(0);
  const canonical = JSON.stringify(model), canonicalNodes = new Map(model.nodes.map(node => [node.id, node]));
  const display = semanticNodeDisplays(root.nodes, canonicalNodes);
  for (const group of root.architectureView!.requestGroups) {
    const members = group.memberIds.map(id => canonicalNodes.get(id)!);
    const origin = architectureRequestSources(members, canonicalNodes);
    expect(origin.unknown).toBe(false);
    expect(display.get(group.id)?.disambiguation).toContain(origin.label);
    expect(members.every(member => canonicalNodes.has(member.architecture!.request!.ownerId))).toBe(true);
  }
  for (const object of root.nodes) {
    const partners = architecturePartners(root.edges, object.id);
    expect(new Set(partners.map(partner => partner.otherId)).size).toBe(partners.length);
    expect(new Set(partners.flatMap(partner => partner.relations.flatMap(group => group.edges.map(edge => edge.id)))))
      .toEqual(new Set(root.edges.filter(edge => edge.source === object.id || edge.target === object.id).map(edge => edge.id)));
  }
  expect(JSON.stringify(model)).toBe(canonical);
  expect(new Set(model.nodes.map(n => n.id)).size).toBe(model.nodes.length);
  const allowed = new Set(model.nodes.filter(n => !n.architecture?.auxiliary).map(n => n.id));
  const originalIds = (edges: typeof model.edges) => [...new Set(edges.flatMap(e => (e.provenance?.edges ?? [e]).map(original => original.id)))].sort();
  expect(originalIds([...root.edges, ...root.architectureView!.internalRelations, ...root.architectureView!.boundaryRelations]))
    .toEqual(originalIds(model.edges.filter(e => allowed.has(e.source) && allowed.has(e.target))));
  expect(root.edges.every(edge => edge.source !== edge.target || edge.details?.architectureRelation === 'self')).toBe(true);
  for (const app of model.nodes.filter(n => n.architecture?.kind === 'application' && !n.architecture.auxiliary)) {
    const inside = architectureScopeGraph(model, app.id, '', false, { mode: '3d' });
    expect(inside.nodes.some(node => node.id === app.id)).toBe(false);
    expect(inside.nodes.filter(node => node.architecture?.parentId && node.architecture.parentId !== app.id)).toEqual([]);
    expect(new Set(inside.architectureView!.representedNodeIds).size).toBe(inside.architectureView!.representedNodeIds.length);
  }
  if (name === 'git-lines') {
    expect(root.nodes.some(n => n.architecture?.context.includes('Extension Host'))).toBe(true);
    expect(root.nodes.some(n => n.architecture?.context.includes('Webview / ブラウザ'))).toBe(true);
    expect(root.edges.filter(e => e.kind === 'message')).toHaveLength(2);
    expect(root.nodes.some(n => n.label === 'git（起動先の既定値）' && n.confidence === 'inferred')).toBe(true);
    const host = model.nodes.find(n => n.architecture?.context.includes('Extension Host') && n.architecture.kind === 'application')!;
    const webview = model.nodes.find(n => n.architecture?.context.includes('Webview / ブラウザ') && n.architecture.kind === 'application')!;
    const partners = architecturePartners(root.edges, host.id);
    expect(partners).toHaveLength(2);
    expect(partners.find(partner => partner.otherId === webview.id)?.direction).toBe('相手から・相手への関係あり');
    expect(host.architecture?.technologies?.find(t => t.name === 'react')?.usage).toBe('declared');
    expect(webview.architecture?.technologies?.find(t => t.name === 'react')?.usage).toBe('source');
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
    const named = model.nodes.filter(n => n.label === 'vehicle-management-db');
    expect(named).toHaveLength(2); expect(named.every(n => n.architecture?.identity?.status === 'unconfirmed')).toBe(true);
    const declaredDatabaseId = sources['apps/api/wrangler.jsonc']?.match(/"database_id"\s*:\s*"([^"]+)"/)?.[1];
    expect(declaredDatabaseId).toBeTruthy();
    expect(production.nodes.some(n => n.architecture?.identity?.identifier === declaredDatabaseId)).toBe(true);
    if (inputName.endsWith('-local')) expect(model.nodes.find(n => n.architecture?.ownerPath === '.kilo')?.architecture).toMatchObject({ kind: 'code-package', codeUsage: { status: 'unconfirmed', consumerIds: [] } });
    expect(model.nodes.filter(n => n.architecture?.request?.kind === 'process').every(n => n.label === '外部プログラムへの起動要求')).toBe(true);
  }
  if (name === 'web-atlas') {
    expect(root.nodes.filter(n => n.architecture?.kind === 'application').map(n => n.label)).toEqual(['web-atlas']);
    expect(root.nodes.some(n => n.architecture?.kind === 'resource')).toBe(false);
  }
}, 120000);
