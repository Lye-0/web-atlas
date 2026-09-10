// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { analyzeSemanticSources } from './analyze';
import type { SemanticInput } from './types';
import { initializeTestParser, testLanguage, testParser } from './testRuntime';
beforeAll(initializeTestParser);
const analyze = (sources: Record<string, string>, imports: SemanticInput['imports'] = []) => analyzeSemanticSources({ sources, imports, resources: [] }, testLanguage, undefined, testParser);

describe('semantic source analysis', () => {
  it('resolves imported and local calls, arguments, return values and model references', async () => {
    const result = await analyze({
      'main.ts': `import { normalize as clean } from './service';\ninterface User { id: string; org: Organization }\ninterface Organization { id: string }\nexport function handle(input: string) { const value = clean(input); return value; }`,
      'service.ts': `export function normalize(raw: string) { const trimmed = raw.trim(); return trimmed; }`,
    }, [{ from: 'main.ts', to: 'service.ts', specifier: './service' }]);
    const handle = result.nodes.find(node => node.kind === 'function' && node.label === 'handle')!;
    const normalize = result.nodes.find(node => node.kind === 'function' && node.label === 'normalize')!;
    expect(handle).toBeDefined(); expect(normalize).toBeDefined();
    expect(result.edges.some(edge => edge.kind === 'calls' && edge.source === handle.id && edge.target === normalize.id && edge.confidence === 'source')).toBe(true);
    expect(result.edges.some(edge => edge.kind === 'passes-to')).toBe(true);
    expect(result.edges.some(edge => edge.kind === 'returns')).toBe(true);
    expect(result.nodes.find(node => node.kind === 'model' && node.label === 'User')?.fields).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'org', type: 'Organization' })]));
    expect(result.edges.some(edge => edge.kind === 'field-type' && edge.label.includes('org'))).toBe(true);
  });

  it.each([
    ['python', 'py', 'def save(value):\n    return value\ndef run(input):\n    return save(input)'],
    ['java', 'java', 'class App { int save(int value) { return value; } int run(int input) { return save(input); } }'],
    ['c_sharp', 'cs', 'class App { int Save(int value) { return value; } int Run(int input) { return Save(input); } }'],
    ['go', 'go', 'package app\nfunc save(value string) string { return value }\nfunc run(input string) string { return save(input) }'],
    ['rust', 'rs', 'fn save(value: i32) -> i32 { value }\nfn run(input: i32) -> i32 { save(input) }'],
    ['ruby', 'rb', 'def save(value)\n value\nend\ndef run(input)\n save(input)\nend'],
    ['php', 'php', '<?php function save($value) { return $value; } function run($input) { return save($input); }'],
    ['c', 'c', 'int save(int value) { return value; } int run(int input) { return save(input); }'],
    ['cpp', 'cpp', 'int save(int value) { return value; } int run(int input) { return save(input); }'],
    ['swift', 'swift', 'func save(_ value: Int) -> Int { return value }\nfunc run(_ input: Int) -> Int { return save(input) }'],
    ['kotlin', 'kt', 'fun save(value: Int): Int { return value }\nfun run(input: Int): Int { return save(input) }'],
    ['scala', 'scala', 'def save(value: Int): Int = value\ndef run(input: Int): Int = save(input)'],
    ['dart', 'dart', 'int save(int value) { return value; } int run(int input) { return save(input); }'],
  ])('parses %s function declarations and call sites', async (_language, ext, source) => {
    const result = await analyze({ [`app.${ext}`]: source });
    expect(result.coverage[0]?.status, result.coverage[0]?.message).not.toBe('skipped');
    expect(result.stats.functions).toBeGreaterThanOrEqual(2);
    expect(result.edges.filter(edge => edge.kind === 'calls').length).toBeGreaterThan(0);
    expect(result.edges.some(edge => edge.kind === 'calls' && edge.confidence === 'source')).toBe(true);
  });
});
