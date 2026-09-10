// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildArchitectureModel } from './architecture';
import { aggregateArchitectureEdges, architectureScopeGraph } from './architectureProjection';
import { semanticFlow3DInput } from './flow3DInput';
import { layoutSemanticFlow } from './flowPresentation';
import type { SemanticEdge, SemanticNode } from './types';
const json = JSON.stringify;
const evidence = [{ path: 'src/main.ts', start: 0, end: 10, line: 1, endLine: 1, description: 'source relation' }];
const fact = (id: string, path: string, extra: Partial<SemanticNode> = {}): SemanticNode => ({ id, path, kind: 'function', group: 'Shared logic', label: id, confidence: 'source', evidence, attributes: {}, ...extra });
const relation = (id: string, source: string, target: string, kind = 'calls', confidence: SemanticEdge['confidence'] = 'source'): SemanticEdge => ({ id, source, target, kind, label: kind, confidence, evidence, views: ['function-call-flow'] });
const build = (sources: Record<string, string>, nodes: SemanticNode[] = [], edges: SemanticEdge[] = []) => buildArchitectureModel({ sources, imports: [], resources: [] }, { nodes, edges });
const web = { 'apps/web/package.json': json({ name: 'Web', scripts: { dev: 'vite' } }), 'apps/web/src/main.ts': 'createRoot(root).render(App);' };

describe('Architecture independent contracts', () => {
  it('T01 distinguishes app and a package with declared use but no confirmed library role', () => {
    const model = build({ ...web, 'apps/web/package.json': json({ name: 'Web', scripts: { dev: 'vite' }, dependencies: { shared: 'workspace:*' } }), 'packages/shared/package.json': json({ name: 'shared' }) });
    expect(model.nodes.find(n => n.label === 'Web')?.architecture?.kind).toBe('application');
    expect(model.nodes.find(n => n.label === 'shared')?.architecture?.kind).toBe('code-package');
    expect(model.nodes.find(n => n.label === 'shared')?.architecture?.codeUsage?.status).toBe('declared');
    expect(architectureScopeGraph(model).edges.some(e => e.kind === 'declaration-dependency')).toBe(true);
  });
  it('T02 api folder and package manifest alone do not imply an API server', () => {
    const model = build({ 'api/package.json': json({ name: 'api' }), 'api/utils.ts': 'export const n=1;' });
    expect(model.nodes.some(n => n.architecture?.kind === 'application')).toBe(false);
  });
  it('T03 uses Worker concrete name, main and binding without asserting activity', () => {
    const model = build({ 'api/wrangler.jsonc': json({ name: 'orders', main: 'src/index.ts', d1_databases: [{ binding: 'DB', database_name: 'orders-db' }] }), 'api/src/index.ts': 'env.DB.prepare(query);' });
    expect(model.nodes.find(n => n.label === 'orders')?.architecture?.entryPaths).toEqual(['api/src/index.ts']);
    expect(model.edges.map(e => e.kind)).toContain('deployment-config');
    expect(model.edges.map(e => e.kind)).toContain('data-operation');
    expect(model.nodes.some(n => n.confidence === 'observed')).toBe(false);
  });
  it('T04 never uses same-path runtime HTTP matching to connect relative fetch', () => {
    const request = fact('request', 'apps/web/src/main.ts', { kind: 'request', attributes: { endpoint: '/api/cars' } });
    const api = fact('handler', 'apps/api/index.ts', { kind: 'entry' });
    const model = build({ ...web, 'apps/api/index.ts': 'app.get("/api/cars", handler)' }, [request, api], [relation('unsafe', request.id, api.id, 'http', 'inferred')]);
    const links = model.edges.filter(e => e.kind === 'http-request');
    expect(links).toHaveLength(1); expect(links[0]?.confidence).toBe('unresolved');
  });
  it('T05 resolves explicit asset route mapping only in its configured environment', () => {
    const model = build({ ...web, 'apps/web/src/main.ts': 'fetch("/api/cars")', 'apps/api/wrangler.jsonc': json({ name: 'api', main: 'index.ts', env: { production: { assets: { directory: '../web/dist', run_worker_first: ['/api/*'] } } } }) }, [fact('req', 'apps/web/src/main.ts', { kind: 'request', attributes: { endpoint: '/api/cars' } })]);
    const resolved = model.edges.filter(e => e.kind === 'http-request' && e.confidence === 'source');
    expect(resolved).toHaveLength(1); expect(resolved[0]?.details?.environment).toBe('production');
    expect(architectureScopeGraph(model, undefined, 'production').nodes.some(n => n.architecture?.kind === 'unresolved')).toBe(false);
  });
  it('T05b respects route exceptions and never maps protocol-relative URLs to an internal Worker', () => {
    for (const endpoint of ['/api/docs/topic', '//other.example/api/cars', 'http://']) {
      const model = build({ ...web, 'apps/web/src/main.ts': `fetch(${json(endpoint)})`, 'apps/api/wrangler.jsonc': json({ name: 'api', main: 'index.ts', assets: { directory: '../web/dist', run_worker_first: ['/api/*', '!/api/docs/*'] } }) }, [fact('req', 'apps/web/src/main.ts', { kind: 'request' })]);
      expect(model.edges.filter(e => e.kind === 'http-request').every(e => e.confidence === 'unresolved')).toBe(true);
    }
  });
  it('T06 retains call vs declaration kinds and original IDs', () => {
    const model = build({ ...web, 'apps/web/src/other.ts': 'export function other(){}' }, [fact('one', 'apps/web/src/main.ts'), fact('two', 'apps/web/src/other.ts')], [relation('canonical-call', 'one', 'two')]);
    expect(architectureScopeGraph(model).architectureView?.internalRelations.find(e => e.kind === 'calls')?.provenance?.edges.map(e => e.id)).toEqual(['canonical-call']);
    const imported = buildArchitectureModel({ sources: { ...web, 'apps/web/src/other.ts': 'export const n=1;' }, imports: [{ from: 'apps/web/src/main.ts', to: 'apps/web/src/other.ts', specifier: './other' }], resources: [] }, { nodes: [], edges: [] });
    expect(imported.edges.map(e => e.kind)).toEqual(['code-reference']);
  });
  it('T07 does not join unrelated message channels by event name', () => {
    const model = build({ 'a.ts': 'left.postMessage({type:"ready"})', 'b.ts': 'right.addEventListener("ready", fn)' });
    expect(model.edges.some(e => e.kind === 'message')).toBe(false);
    const local = build({ 'events.ts': 'bus.on("ready", listener); other.emit("ready"); bus.emit("ready"); function unrelated(){ bus.emit("ready") }' });
    expect(local.edges.filter(e => e.kind === 'message')).toHaveLength(1);
    expect(local.edges.find(e => e.kind === 'message')?.evidence).toHaveLength(2);
  });
  it('T07b matches the Webview build output and host panel before joining message operations', () => {
    const sources = { 'package.json': json({ name: 'extension', engines: { vscode: '*' }, main: 'dist/extension.js' }),
      'vite.config.ts': 'export default defineConfig({root:"webview",build:{outDir:"../dist/view"}})',
      'webview/main.ts': 'const api=acquireVsCodeApi(); api.postMessage({type:"ready"}); window.addEventListener("message", listener);',
      'src/panel.ts': 'this.panel=vscode.window.createWebviewPanel("my-panel", "title", 1, {localResourceRoots:[vscode.Uri.joinPath(extensionUri,"dist","view")]}); this.panel.webview.onDidReceiveMessage(listener); this.panel.webview.postMessage({type:"update"});' };
    expect(build(sources).edges.filter(e => e.kind === 'message')).toHaveLength(2);
    expect(build({ ...sources, 'vite.config.ts': 'export default defineConfig({root:"webview",build:{outDir:"../different"}})' }).edges.filter(e => e.kind === 'message')).toHaveLength(0);
  });
  it('T08 a DB library and model type are not resource instances', () => {
    const model = build({ 'package.json': json({ name: 'db-lib', dependencies: { drizzle: '1' } }), 'types.ts': 'interface Database {}' }, [fact('type', 'types.ts', { kind: 'model' })]);
    expect(model.nodes.some(n => n.architecture?.kind === 'resource')).toBe(false);
  });
  it('T09 same DB name in different environments has distinct identity; bindings do not inherit', () => {
    const binding = { binding: 'DB', database_name: 'same' };
    const model = build({ 'wrangler.jsonc': json({ name: 'api', main: 'src/main.ts', d1_databases: [binding], env: { staging: {}, production: { d1_databases: [binding] } } }) });
    const resources = model.nodes.filter(n => n.architecture?.kind === 'resource');
    expect(resources).toHaveLength(2); expect(new Set(resources.map(n => n.id)).size).toBe(2);
    expect(architectureScopeGraph(model, undefined, 'staging').nodes.some(n => n.architecture?.kind === 'resource')).toBe(false);
  });
  it('T09b separates service vs emulator for the same project, including TOML non-inherited vars', () => {
    const model = build({ 'wrangler.toml': 'name="api"\nmain="main.ts"\n[vars]\nFIREBASE_PROJECT_ID="same"\n[env.local.vars]\nFIREBASE_PROJECT_ID="same"\nFIREBASE_AUTH_EMULATOR=true\n[env.production]\nname="prod"\n[[env.production.d1_databases]]\nbinding="DB"\ndatabase_name="same"', 'main.ts': 'env.DB.prepare(sql)' });
    expect(model.environments).toEqual(['local', 'production']);
    expect(model.nodes.filter(n => n.architecture?.context.includes('Firebase Auth'))).toHaveLength(2);
    expect(architectureScopeGraph(model, undefined, 'production').nodes.filter(n => n.architecture?.context.includes('Firebase Auth'))).toHaveLength(0);
    expect(model.nodes.find(n => n.label === 'api')?.architecture?.entryPaths).toEqual(['main.ts']);
    expect(model.nodes.find(n => n.label === 'api')?.architecture?.configurationVariants?.find(variant => variant.environment === 'production')).toMatchObject({ name: 'prod', entryPath: 'main.ts', inherited: ['main'] });
  });
  it('T03b ignores literal/comment API examples and never gives a sibling app the Worker binding', () => {
    const model = build({ 'wrangler.jsonc': json({ name: 'worker', main: 'main.ts', d1_databases: [{ binding: 'DB', database_name: 'db' }] }), 'main.ts': 'const text="env.DB.prepare(sql); spawn(\'git\')"; // env.DB\n', 'child/package.json': json({ name: 'child', scripts: { dev: 'vite' } }), 'child/main.ts': 'env.DB.prepare(sql)' });
    expect(model.edges.filter(e => e.kind === 'data-operation' || e.kind === 'process-start')).toHaveLength(0);
  });
  it('T03c retains constructor defaults as inferred, with overridability explicit', () => {
    const model = build({ 'run.ts': 'class GitRunner { constructor(private readonly executable="git") {} run(){ spawn(this.executable, args); } } class Other { run(){ spawn(this.executable,args); } }' });
    expect(model.nodes.some(n => n.label === 'git（起動先の既定値）' && n.confidence === 'inferred')).toBe(true);
    expect(model.nodes.some(n => n.architecture?.kind === 'unresolved')).toBe(true);
  });
  it('T09c keeps local emulator settings separate from CLI project aliases and active environments', () => {
    const model = build({ 'package.json': json({ name: 'workspace' }), 'firebase.json': json({ emulators: { auth: { port: 9099 } } }), '.firebaserc': json({ projects: { default: 'same', development: 'demo' } }) });
    const emulator = model.nodes.find(n => n.label === 'Firebase authエミュレーター :9099');
    expect(emulator?.attributes.projectAliases).toEqual(['default: same', 'development: demo']);
    expect(model.environments).toEqual([]); expect(model.edges[0]?.kind).toBe('deployment-config');
  });
  it('T10 multiple roles never duplicate source membership', () => {
    const model = build({ ...web, 'apps/web/src/pages/auth.tsx': 'getAuth();' }, [fact('one', 'apps/web/src/pages/auth.tsx')]);
    const app = model.nodes.find(n => n.label === 'Web')!;
    expect(app.architecture?.memberIds).toEqual(['one']);
  });
  it('T11 kind/confidence aggregation retains loops and unique provenance', () => {
    const edges = [relation('a', 'x', 'y'), relation('b', 'y', 'x', 'code-reference'), relation('c', 'x', 'y', 'calls', 'inferred')];
    const result = aggregateArchitectureEdges(edges, new Map([['x', 'app'], ['y', 'app']]));
    expect(result).toHaveLength(3); expect(result.every(e => e.source === e.target)).toBe(true);
    expect(new Set(result.flatMap(e => e.provenance!.edges.map(e => e.id))).size).toBe(3);
  });
  it('T12 disconnected intermediary members preserve original endpoints', () => {
    const result = aggregateArchitectureEdges([relation('a', 'a', 'b1'), relation('b', 'b2', 'c')], new Map([['a', 'A'], ['b1', 'B'], ['b2', 'B'], ['c', 'C']]));
    expect(result[0]?.provenance?.edges[0]?.target).toBe('b1'); expect(result[1]?.provenance?.edges[0]?.source).toBe('b2');
  });
  it('T13 tests are hidden together with relations', () => {
    const model = build({ ...web, 'apps/web/test/demo.test.ts': 'test()' }, [fact('test', 'apps/web/test/demo.test.ts'), fact('main', 'apps/web/src/main.ts')], [relation('test-call', 'test', 'main')]);
    expect(architectureScopeGraph(model).edges).toHaveLength(0);
    expect(architectureScopeGraph(model, undefined, '', true).architectureView?.internalRelations).toHaveLength(1);
    const mock = build({ ...web, 'apps/web/src/__mocks__/api.ts': 'fetch(url)', 'apps/web/src/generated/value.g.ts': 'export const value=1;' });
    expect(mock.nodes.filter(n => n.architecture?.kind === 'component' && n.architecture.auxiliary).flatMap(n => n.architecture!.files)).toHaveLength(2);
    expect(architectureScopeGraph(mock).nodes.every(n => !n.architecture?.auxiliary)).toBe(true);
  });
  it('T14 isolated nodes and empty input are supported', () => {
    expect(architectureScopeGraph(build({})).nodes).toEqual([]);
    expect(architectureScopeGraph(build(web)).nodes.some(n => n.label === 'Web')).toBe(true);
  });
  it('T15 same names in different projects retain distinct IDs and deterministic ancestry', () => {
    const sources = { 'a/a.csproj': '<Project><OutputType>Exe</OutputType><AssemblyName>same</AssemblyName></Project>', 'b/b.csproj': '<Project><AssemblyName>same</AssemblyName></Project>' };
    const a = build(sources), b = build(sources); expect(a).toEqual(b);
    expect(new Set(a.nodes.map(n => n.id)).size).toBe(2); expect(a.nodes.map(n => n.architecture?.kind).sort()).toEqual(['application', 'code-package']);
  });
  it('keeps the same architectural grain and deterministic positions in the shared renderer', () => {
    const model = build({ ...web, 'apps/web/src/main.ts': 'fetch(url)' }, [fact('request', 'apps/web/src/main.ts', { kind: 'request' })]);
    const root = architectureScopeGraph(model), before = JSON.stringify(root), input = semanticFlow3DInput(root);
    expect(input.allPositions.map(p => p.node.id).sort()).toEqual(root.nodes.map(n => n.id).sort());
    expect(input.presentation.aggregate).toBeUndefined();
    expect(input.presentation.memberIds.size).toBe(0);
    expect(layoutSemanticFlow(root, '2d').map(p => p.node.id).sort()).toEqual(root.nodes.map(n => n.id).sort());
    expect(semanticFlow3DInput(root).allPositions).toBe(input.allPositions);
    expect(JSON.stringify(root)).toBe(before);
  });
});
