// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { localDevelopmentCoverageFixtures } from './fixtures/stack-coverage/localDevelopment';
import { scanProjectFiles } from './scan';
import { projectCommand, projectStackMap } from './projectors';
import { localDevelopmentOperation } from './localDevelopmentCli';
import { commandArgv, parseCommandExpression } from './commandParser';
import { registeredStackForDependency } from './stackRegistry';
import { semanticInput } from './semantic/client';
import { analyzeSemanticSources } from './semantic/analyze';
import { initializeTestParser, testLanguage, testParser } from './semantic/testRuntime';
import { getStack, findCanonicalStackByPackageName, categories } from '../data';

const scan = (sources: Record<string, string>) => scanProjectFiles(Object.entries(sources).map(([relativePath, source]) => ({ relativePath, name: relativePath.split('/').at(-1)!, extension: '.' + relativePath.split('.').at(-1), size: source.length, readText: async () => source })));
beforeAll(initializeTestParser);
describe('local development CLI identity and evidence', () => {
  it.each(localDevelopmentCoverageFixtures)('$stackId retains CLI, command and source evidence without a service instance', async fixture => {
    expect(findCanonicalStackByPackageName(fixture.packageName)?.id).toBe(fixture.stackId);
    expect(registeredStackForDependency('npm', fixture.packageName)?.stackId).toBe(fixture.stackId);
    const stack = getStack(fixture.stackId)!;
    expect(stack.categoryId).toBe('local-development-cli');
    for (const id of stack.relatedStackIds ?? []) expect(getStack(id)?.relatedStackIds).toContain(fixture.stackId);
    const store = await scan(fixture.sources), map = projectStackMap(store);
    expect(map.nodes.some(node => node.metadata.stackId === fixture.stackId)).toBe(true);
    const cli = store.facts.find(fact => fact.kind === 'technology' && fact.dictionaryStackId === fixture.stackId)!;
    expect(cli).toBeDefined();
    const script = store.facts.find(fact => fact.kind === 'package-script')!;
    const command = projectCommand(store, script.id);
    expect(command.nodes.some(node => node.type === 'command' && node.metadata.dictionaryStackId === fixture.stackId && node.metadata.commandPurpose === 'local')).toBe(true);
    expect(command.edges.some(edge => edge.targetId === cli.id && edge.kind === 'uses')).toBe(true);
    const analysis = await analyzeSemanticSources(semanticInput(store), testLanguage, undefined, testParser);
    expect(analysis.architecture!.nodes.filter(node => node.attributes.dictionaryStackId === fixture.stackId).every(node => node.architecture?.kind === 'tool-operation')).toBe(true);
    const tools = analysis.architecture!.nodes.flatMap(node => node.architecture?.technologies ?? []).filter(tool => tool.name === fixture.stackId);
    expect(tools.some(tool => tool.usage === 'support' && tool.evidence.some(item => item.path === 'package.json'))).toBe(true);
    expect(store.relations.some(relation => relation.kind === 'depends-on' && relation.targetId === cli.id && relation.metadata.packageName === fixture.packageName)).toBe(true);
  });
  it('keeps package-only declarations separate from usage and PyPI SDK identity', async () => {
    expect(registeredStackForDependency('pypi', 'supabase')?.stackId).toBe('supabase');
    const fixture = localDevelopmentCoverageFixtures[0]!;
    const store = await scan({ 'package.json': JSON.stringify({ name: 'declared', devDependencies: { wrangler: '*' } }) });
    expect(semanticInput(store).developmentTools?.every(tool => tool.declaration)).toBe(true);
    expect(store.facts.some(fact => fact.kind === 'runtime' || fact.kind === 'resource')).toBe(false);
    const onlyConfig = await scan({ [fixture.config]: fixture.source, 'app.ts': fixture.sources['app.ts']! });
    expect(onlyConfig.facts.some(fact => fact.kind === 'technology' && fact.dictionaryStackId === 'wrangler')).toBe(false);
    expect(categories.find(category => category.id === 'runtime')?.relatedCategoryIds).toContain('local-development-cli');
  });
  it.each(['wrangler dev --help', 'firebase --version', 'supabase login', 'vercel help', 'netlify --help'])('%s does not claim a local startup', async command => {
    const store = await scan({ 'package.json': JSON.stringify({ name: 'help', scripts: { check: command } }), 'wrangler.jsonc': '{"main":"app.ts"}', 'app.ts': 'export const n=1;' });
    const script = store.facts.find(fact => fact.kind === 'package-script')!;
    expect(projectCommand(store, script.id).edges.some(edge => edge.kind === 'starts')).toBe(false);
  });
  it('retains distinct local and remote commands without executing them', () => {
    for (const [text, purpose] of [['wrangler --config worker.jsonc dev', 'local'], ['wrangler dev --remote', 'remote'], ['wrangler deploy', 'deploy'], ['firebase emulators:exec "node check.js"', 'local']]) {
      expect(localDevelopmentOperation(commandArgv(parseCommandExpression(text!)[0]!))).toBe(purpose);
    }
  });
  it('resolves only the explicit workspace/config and retains an unresolved config without guessing', async () => {
    const store = await scan({ 'package.json': JSON.stringify({ name: 'workspace', scripts: { other: 'wrangler dev --config other/wrangler.jsonc', unknown: 'wrangler dev --config $FILE' } }), 'wrangler.jsonc': '{"name":"root","main":"app.ts"}', 'app.ts': 'export const n=1;', 'other/package.json': '{"name":"other"}', 'other/wrangler.jsonc': '{"name":"other","main":"app.ts"}', 'other/app.ts': 'export const n=2;' });
    for (const name of ['other', 'unknown']) {
      const script = store.facts.find(fact => fact.kind === 'package-script' && fact.scriptName === name)!;
      const targets = projectCommand(store, script.id).nodes.filter(node => node.type === 'runtime');
      expect(targets).toHaveLength(name === 'other' ? 1 : 0);
      if (name === 'other') expect(store.facts.find(fact => fact.id === targets[0]?.id)?.filePath).toBe('other/wrangler.jsonc');
    }
  });
});
