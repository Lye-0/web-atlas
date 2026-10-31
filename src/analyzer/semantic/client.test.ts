import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cancelSemanticAnalysis, getSemanticAnalysis } from './client';
import type { AnalyzerProjectStore } from '../types';
const workers: FakeWorker[] = [];
class FakeWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  terminate = vi.fn(); postMessage = vi.fn();
  constructor() { workers.push(this); }
}
const store = (): AnalyzerProjectStore => ({ files: [], facts: [], relations: [], evidence: [], sources: {}, warnings: [], scannedAt: 'test' });
beforeEach(() => { workers.length = 0; vi.stubGlobal('Worker', FakeWorker); });
afterEach(() => vi.unstubAllGlobals());
it('releases worker handlers after completion while reusing the result for the same store', async () => {
  const project = store(), job = getSemanticAnalysis(project), worker = workers[0]!, analysis = { nodes: [], edges: [] };
  worker.onmessage!({ data: { type: 'complete', analysis } });
  expect(await job.promise).toBe(analysis); expect(worker.onmessage).toBeNull(); expect(worker.onerror).toBeNull(); expect(worker.terminate).toHaveBeenCalledTimes(1);
  expect(getSemanticAnalysis(project).promise).toBe(job.promise); expect(workers).toHaveLength(1);
  cancelSemanticAnalysis(project); expect(worker.terminate).toHaveBeenCalledTimes(1);
});
it('disposes a cancelled job and creates a fresh job on retry', async () => {
  const project = store(), job = getSemanticAnalysis(project), rejected = expect(job.promise).rejects.toThrow('解析を中止');
  cancelSemanticAnalysis(project); await rejected;
  expect(workers[0]!.onmessage).toBeNull(); expect(workers[0]!.onerror).toBeNull(); expect(workers[0]!.terminate).toHaveBeenCalledTimes(1);
  const retry = getSemanticAnalysis(project); expect(retry.promise).not.toBe(job.promise); expect(workers).toHaveLength(2);
  const cancelled = expect(retry.promise).rejects.toThrow(); cancelSemanticAnalysis(project); await cancelled;
});
it('disposes an engine error before allowing a fresh request', async () => {
  const project = store(), job = getSemanticAnalysis(project), rejected = expect(job.promise).rejects.toThrow('failed');
  workers[0]!.onerror!({ message: 'failed' }); await rejected;
  expect(workers[0]!.onmessage).toBeNull(); expect(workers[0]!.onerror).toBeNull();
});

it('defers command projection to the Worker and excludes file reader functions from its payload', async () => {
  const project = store(); project.files.push({ relativePath: 'input.ts', name: 'input.ts', extension: '.ts', size: 1, readText: async () => 'x' });
  const job = getSemanticAnalysis(project), payload = workers[0]!.postMessage.mock.calls[0]![0] as import('./types').SemanticInput;
  expect(payload.commands).toBeUndefined(); expect(payload.commandStore).toBeDefined(); expect(payload.commandStore).not.toHaveProperty('files');
  expect(() => structuredClone(payload)).not.toThrow();
  const cancelled = expect(job.promise).rejects.toThrow(); cancelSemanticAnalysis(project); await cancelled;
});
it('disposes a synchronous postMessage failure and permits retry instead of caching the rejection', async () => {
  const original = FakeWorker;
  class FailingWorker extends original { constructor() { super(); this.postMessage.mockImplementation(() => { throw new Error('cannot clone'); }); } }
  vi.stubGlobal('Worker', FailingWorker);
  const project = store(), job = getSemanticAnalysis(project);
  await expect(job.promise).rejects.toThrow('cannot clone'); expect(workers[0]!.terminate).toHaveBeenCalledTimes(1); expect(workers[0]!.onmessage).toBeNull();
  vi.stubGlobal('Worker', FakeWorker);
  const retry = getSemanticAnalysis(project); expect(workers).toHaveLength(2);
  const cancelled = expect(retry.promise).rejects.toThrow(); cancelSemanticAnalysis(project); await cancelled;
});
