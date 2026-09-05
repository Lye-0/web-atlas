import type { AnalyzerProjectStore } from '../types';
import type { SemanticAnalysis, SemanticInput } from './types';

export function semanticInput(store: AnalyzerProjectStore): SemanticInput {
  return { sources: store.semanticSources ?? store.sources,
    imports: store.facts.flatMap(fact => fact.kind === 'module-dependency' ? [{ from: fact.sourcePath, to: fact.targetPath, specifier: fact.specifier }] : []),
    resources: store.facts.flatMap(fact => fact.kind === 'runtime' || fact.kind === 'resource' ? [{ id: fact.id, label: fact.label, type: fact.kind === 'runtime' ? 'runtime' : fact.resourceType, path: fact.filePath, binding: fact.kind === 'resource' ? fact.binding : undefined,
      entryPath: typeof fact.metadata.main === 'string' ? `${fact.filePath?.split('/').slice(0, -1).join('/')}/${fact.metadata.main}`.replace(/^\//, '').replaceAll('/./', '/') : undefined,
      evidence: store.evidence.filter(item => fact.evidenceIds.includes(item.id)).map(item => { const line = item.highlightRanges[0]?.start.line ?? item.contextStartLine; const source = store.sources[item.filePath] ?? ''; const start = source.split('\n').slice(0, line - 1).reduce((offset, value) => offset + value.length + 1, 0); return { path: item.filePath, start, end: start + (source.split('\n')[line - 1]?.length ?? 0), line, endLine: line, description: item.description ?? 'Runtime / resource configuration' }; }),
    }] : []),
  };
}
type Progress = { done: number; total: number };
interface AnalysisJob { promise: Promise<SemanticAnalysis>; listeners: Set<(progress: Progress) => void>; cancel: () => void; progress: Progress }
const jobs = new WeakMap<AnalyzerProjectStore, AnalysisJob>();
export function cancelSemanticAnalysis(store: AnalyzerProjectStore) { jobs.get(store)?.cancel(); jobs.delete(store); }

export function getSemanticAnalysis(store: AnalyzerProjectStore, onProgress?: (progress: Progress) => void) {
  let job = jobs.get(store);
  if (!job) {
    const worker = new Worker(new URL('./semantic.worker.ts', import.meta.url), { type: 'module' });
    const listeners = new Set<(progress: Progress) => void>();
    const progress = { done: 0, total: Object.keys(store.sources).length };
    let cancel = () => {};
    const promise = new Promise<SemanticAnalysis>((resolve, reject) => {
      cancel = () => { worker.terminate(); reject(new Error('解析を中止しました。再実行できます。')); };
      worker.onmessage = ({ data }) => {
        if (data.type === 'progress') { Object.assign(progress, { done: data.done, total: data.total }); listeners.forEach(listener => listener(progress)); }
        if (data.type === 'complete') { worker.terminate(); resolve(data.analysis as SemanticAnalysis); }
        if (data.type === 'error') { worker.terminate(); jobs.delete(store); reject(new Error(String(data.message))); }
      };
      worker.onerror = event => { worker.terminate(); jobs.delete(store); reject(new Error(event.message || '解析エンジンでエラーが発生しました')); };
      worker.postMessage(semanticInput(store));
    });
    job = { promise, listeners, cancel, progress }; jobs.set(store, job);
  }
  if (onProgress) { job.listeners.add(onProgress); onProgress(job.progress); }
  return { promise: job.promise, unsubscribe: () => { if (onProgress) job!.listeners.delete(onProgress); } };
}
