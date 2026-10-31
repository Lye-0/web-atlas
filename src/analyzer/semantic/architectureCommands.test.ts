// @vitest-environment node
import { beforeAll, expect, it } from 'vitest';
import { scanProjectFiles } from '../scan';
import { projectCommand, projectCommandCatalog } from '../projectors';
import { architectureCommands } from './architectureCommands';
import { semanticInput } from './client';
import { analyzeSemanticSources } from './analyze';
import { initializeTestParser, testLanguage, testParser } from './testRuntime';
beforeAll(initializeTestParser);
const scan = (sources: Record<string, string>) => scanProjectFiles(Object.entries(sources).map(([relativePath, source]) => ({ relativePath, name: relativePath.split('/').at(-1)!, extension: '.json', size: source.length, readText: async () => source })));
it('preserves the union of independently projected commands, targets, calls and exact Evidence', async () => {
  const store = await scan({ 'package.json': JSON.stringify({ name: 'fixture', scripts: { dev: 'concurrently "npm run shared" "npm run other"', shared: 'vite --mode development', other: 'npm run shared && wrangler deploy --env production', lone: 'tsc', loop: 'npm run loop' }, devDependencies: { vite: '*', wrangler: '*' } }) });
  const commands = architectureCommands(store), catalog = projectCommandCatalog(store), originals = new Map<string, { label: string; targets: string[]; calls: string[]; evidence: string[] }>();
  for (const script of store.facts.filter(f => f.kind === 'package-script')) {
    const graph = projectCommand(store, script.id);
    for (const node of graph.nodes) {
      if (!graph.edges.some(e => e.kind === 'expands-to' && e.targetId === node.id) || originals.has(node.id)) continue;
      originals.set(node.id, { label: node.label, targets: graph.edges.filter(e => e.sourceId === node.id && ['starts', 'uses'].includes(e.kind)).map(e => e.targetId).sort(), calls: graph.edges.filter(e => e.sourceId === node.id && ['resolves-to', 'starts'].includes(e.kind)).map(e => e.targetId).sort(), evidence: node.evidenceIds });
    }
  }
  expect(commands).toHaveLength(originals.size);
  for (const command of commands) {
    const original = originals.get(command.id)!; expect(command.label).toBe(original.label); expect(command.targets.sort()).toEqual(original.targets); expect(command.calls.map(c => c.target).sort()).toEqual(original.calls);
    expect(command.evidence.length).toBe(original.evidence.length);
    for (const ev of command.evidence) expect(store.sources[ev.path]!.slice(ev.start, ev.end)).toBe(JSON.stringify(command.label).slice(1, -1));
  }
  expect(catalog.warnings.some(w => w.message.includes('cycle'))).toBe(true);
});
it('keeps forwarded arguments distinct from their original script', async () => {
  const store = await scan({ 'package.json': JSON.stringify({ scripts: { dev: 'vite', prod: 'npm run dev -- --mode production' }, devDependencies: { vite: '*' } }) });
  const commands = architectureCommands(store), base = commands.find(c => c.label === 'vite')!, context = commands.find(c => c.sourceCommandId === base.id)!;
  expect(base.argv).toEqual(['vite']); expect(context.argv).toEqual(['vite', '--mode', 'production']); expect(context.evidence.length).toBeGreaterThan(base.evidence.length);
});
it('produces identical semantic graphs when commands are expanded eagerly or deferred to the Worker path', async () => {
  const store = await scan({ 'package.json': JSON.stringify({ name: 'fixture', scripts: { dev: 'vite', build: 'vite build' }, devDependencies: { vite: '*' } }), 'index.html': '<script type="module" src="/src/main.ts"></script>', 'src/main.ts': 'export function f() { return 1; }' });
  const eager = await analyzeSemanticSources(semanticInput(store), testLanguage, undefined, testParser), deferred = await analyzeSemanticSources(semanticInput(store, true), testLanguage, undefined, testParser);
  expect(deferred.nodes).toEqual(eager.nodes); expect(deferred.edges).toEqual(eager.edges); expect(deferred.architecture).toEqual(eager.architecture);
});

it.skipIf(!process.env.WEB_ATLAS_STABILITY_BENCH)('compares repeated root projections with one command catalogue', async () => {
  const store = await scan({ 'package.json': JSON.stringify({ name: 'many-scripts', scripts: Object.fromEntries([['shared', 'vite'], ...Array.from({length: 500}, (_, i) => [`job-${i}`, 'npm run shared'])]), devDependencies: { vite: '*' } }) });
  const sample = store.evidence[0]!;
  store.evidence.push(...Array.from({length: 10000}, (_, i) => ({ ...sample, id: `synthetic-evidence-${i}` })));
  const scripts = store.facts.filter(f => f.kind === 'package-script');
  const before = performance.now(); let oldCommandCount = 0;
  for (const script of scripts) oldCommandCount += projectCommand(store, script.id).nodes.filter(n => n.metadata.commandType === 'cli').length;
  const repeatedProjectionMs = performance.now() - before, after = performance.now(), commands = architectureCommands(store), catalogueMs = performance.now() - after;
  expect(oldCommandCount).toBe(501); expect(commands.filter(c => c.argv[0] === 'vite')).toHaveLength(1);
  const { mkdir, writeFile } = await import('node:fs/promises'); await mkdir('.cache/stability-review', {recursive: true});
  await writeFile('.cache/stability-review/commands.json', JSON.stringify({ scripts: scripts.length, evidence: store.evidence.length, repeatedProjectionMs, catalogueMs, commands: commands.length }, null, 2));
});

it('forwards literal arguments through multiple wrapper scripts without changing the originals or siblings', async () => {
  const store = await scan({'package.json':JSON.stringify({scripts:{dev:'vite',via:'npm run dev --',prod:'npm run via -- --mode production',stage:'npm run via -- --mode staging'},devDependencies:{vite:'*'}})});
  const commands = architectureCommands(store), vite = commands.filter(c => c.argv[0] === 'vite');
  expect(vite.map(c => c.argv)).toEqual(expect.arrayContaining([['vite'],['vite','--mode','production'],['vite','--mode','staging']]));
  expect(vite.filter(c => c.argv.includes('production'))).toHaveLength(1); expect(vite.filter(c => c.argv.includes('staging'))).toHaveLength(1);
  expect(vite.find(c => c.argv.includes('production'))?.sourceCommandId).toBe(vite.find(c => c.argv.length === 1)?.id);
});
it('appends arguments to the last shell command, not every command in the target script', async () => {
  const store = await scan({'package.json':JSON.stringify({scripts:{build:'tsc && vite build',prod:'npm run build -- --mode production'},devDependencies:{vite:'*',typescript:'*'}})});
  const commands = architectureCommands(store).filter(c => c.sourceCommandId);
  expect(commands.find(c => c.argv[0] === 'tsc')?.argv).toEqual(['tsc']);
  expect(commands.find(c => c.argv[0] === 'vite')?.argv).toEqual(['vite','build','--mode','production']);
});
it('keeps a cyclic forwarding path finite and explains why further forwarding is unresolved', async () => {
  const store = await scan({'package.json':JSON.stringify({scripts:{a:'npm run b -- --flag a',b:'npm run a -- --flag b'}})});
  const commands = architectureCommands(store);
  expect(commands.length).toBeLessThan(20);
  expect(commands.some(c => c.argumentResolution?.includes('循環'))).toBe(true);
});

it('keeps simultaneous child calls inside their own invocation context', async () => {
  const store = await scan({'package.json':JSON.stringify({scripts:{dev:'concurrently "vite" "node server.js"',wrap:'npm run dev -- --raw'},devDependencies:{vite:'*'}})});
  const commands = architectureCommands(store), group = commands.find(c => c.sourceCommandId && c.argv[0] === 'concurrently')!;
  expect(group.argv.at(-1)).toBe('--raw'); expect(group.calls).toHaveLength(2);
  for (const call of group.calls) {
    const child = commands.find(c => c.id === call.target)!;
    expect(child.sourceCommandId).toBeDefined(); expect(child.scriptId).toBe(group.scriptId); expect(child.argv).not.toContain('--raw');
  }
});
it('keeps dynamic forwarding and unknown concurrently options explicit in analysis warnings', async () => {
  const store = await scan({'package.json':JSON.stringify({scripts:{dev:'vite',wrap:'npm run dev -- --mode $MODE',unknown:'concurrently --unknown "vite"'},devDependencies:{vite:'*'}})});
  const analysis = await analyzeSemanticSources(semanticInput(store, true), testLanguage, undefined, testParser);
  expect(analysis.warnings.some(w => w.includes('動的な転送'))).toBe(true); expect(analysis.warnings.some(w => w.includes('未対応オプション'))).toBe(true);
  expect(architectureCommands(store).filter(c => c.argv[0] === 'vite')).toHaveLength(1);
});
it('bounds deep forwarding without deleting the original script commands', async () => {
  const scripts = Object.fromEntries(Array.from({length:36}, (_, i) => [`step${i}`, i === 35 ? 'vite' : `npm run step${i+1} -- --flag${i}`]));
  const store = await scan({'package.json':JSON.stringify({scripts,devDependencies:{vite:'*'}})}), commands = architectureCommands(store);
  expect(commands.some(c => c.argumentResolution?.includes('上限'))).toBe(true);
  expect(commands.filter(c => !c.sourceCommandId)).toHaveLength(36); expect(commands.length).toBeLessThan(2000);
});
it('carries independently forwarded modes into the actual Architecture operations', async () => {
  const store = await scan({'package.json':JSON.stringify({name:'fixture',scripts:{build:'vite build',via:'npm run build --',prod:'npm run via -- --mode production',stage:'npm run via -- --mode staging'},devDependencies:{vite:'*'}}), 'index.html':'<script type="module" src="/src/main.ts"></script>', 'src/main.ts':'export const value = 1;', 'vite.config.ts':'export default {build:{outDir:"out"}};'});
  const analysis = await analyzeSemanticSources(semanticInput(store, true), testLanguage, undefined, testParser);
  const operations = analysis.architecture!.nodes.filter(n => n.attributes.dictionaryStackId === 'vite' && n.attributes.purpose === 'build');
  expect(operations.some(n => n.architecture?.environments.includes('production'))).toBe(true);
  expect(operations.some(n => n.architecture?.environments.includes('staging'))).toBe(true);
  expect(new Set(operations.map(n => n.id)).size).toBe(operations.length);
});
