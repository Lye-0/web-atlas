// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { analyzeSemanticSources } from './analyze';
import { initializeTestParser, testLanguage, testParser } from './testRuntime';

beforeAll(initializeTestParser);

describe('independent explorer source accuracy review', () => {
  it.each([
    "await apiFetch<{ items: string[] }>('/api/items')",
    "apiFetch<{ items: string[] }>('/api/items')",
    "await apiFetch('/api/items')",
  ])('resolves an imported call and preserves its argument range: %s', async (expression) => {
    // Minimized from vehicle-management customerApi.ts -> api.ts, without project data.
    const callerSource = `import { apiFetch } from './api';\nexport async function fetchCustomers() {\n  return ${expression};\n}`;
    const analysis = await analyzeSemanticSources({
      sources: {
        'src/api.ts': 'export async function apiFetch<T>(path: string) { return path as T; }',
        'src/customerApi.ts': callerSource,
      },
      imports: [{ from: 'src/customerApi.ts', to: 'src/api.ts', specifier: './api' }],
      resources: [],
    }, testLanguage, undefined, testParser);
    const caller = analysis.nodes.find(node => node.kind === 'function' && node.label === 'fetchCustomers')!;
    const callee = analysis.nodes.find(node => node.kind === 'function' && node.label === 'apiFetch')!;
    const edge = analysis.edges.find(edge => edge.kind === 'calls' && edge.source === caller.id)!;
    expect(edge).toMatchObject({
      target: callee.id, confidence: 'source', evidence: [expect.objectContaining({ path: 'src/customerApi.ts', line: 3 })],
    });
    expect(callerSource.slice(edge.evidence[0]!.start, edge.evidence[0]!.end)).toContain("('/api/items')");
  });

  it('keeps an awaited generic call on an unknown receiver unresolved', async () => {
    const analysis = await analyzeSemanticSources({
      sources: { 'src/receiver.ts': 'function apiFetch() {}\nexport async function run(client: unknown) { return await client.apiFetch<string>("value"); }' },
      imports: [], resources: [],
    }, testLanguage, undefined, testParser);
    const caller = analysis.nodes.find(node => node.kind === 'function' && node.label === 'run')!;
    const edge = analysis.edges.find(edge => edge.kind === 'calls' && edge.source === caller.id)!;
    expect(edge.confidence).toBe('unresolved');
    expect(analysis.nodes.find(node => node.id === edge.target)).toMatchObject({ kind: 'external', label: 'client.apiFetch' });
  });
});
