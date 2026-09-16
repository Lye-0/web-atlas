import { localDevelopmentCliIds } from '../localDevelopmentCli';
import { architectureCommands } from './architectureCommands';
import type { AnalyzerProjectStore } from '../types';
import type { SemanticAnalysis, SemanticInput } from './types';
import{stacks}from'../../data';
const stackMetadata=Object.fromEntries(stacks.map(stack=>[stack.id,{name:stack.name,aliases:stack.aliases??[]}]));

export function semanticInput(store: AnalyzerProjectStore): SemanticInput {
  const evidencePaths=new Map(store.evidence.map(e=>[e.id,e.filePath])),workspacePatterns=new Set(store.facts.filter(f=>f.kind==='workspace-pattern').map(f=>f.id)),workspaceDeclarations=new Map<string,Set<string>>();
  for(const r of store.relations)if(r.kind==='matches'&&workspacePatterns.has(r.sourceId)){const paths=workspaceDeclarations.get(r.targetId)??new Set<string>();for(const id of r.evidenceIds){const path=evidencePaths.get(id);if(path)paths.add(path);}workspaceDeclarations.set(r.targetId,paths);}
  return { sources: store.semanticSources ?? store.sources,stackMetadata, commands: architectureCommands(store),
    developmentTools: store.facts.flatMap(fact => fact.kind === 'technology' && localDevelopmentCliIds.some(id => id === fact.dictionaryStackId) ? store.evidence.filter(item => fact.evidenceIds.includes(item.id)).map(item => {
      const range = item.highlightRanges[0], line = range?.start.line ?? item.contextStartLine, endLine = range?.end.line ?? line;
      const lines = (store.sources[item.filePath] ?? '').split('\n');
      const offset = (row: number, column: number) => lines.slice(0, row - 1).reduce((n, value) => n + value.length + 1, 0) + column - 1;
      return { stackId: fact.dictionaryStackId!, path: item.filePath, declaration: item.role === 'declaration', evidence: { path: item.filePath, line, endLine, start: offset(line, range?.start.column ?? 1), end: offset(endLine, range?.end.column ?? (lines[endLine - 1]?.length ?? 0) + 1), description: item.description ?? '開発CLIの宣言・使用' } };
    }) : []),
    projectScopes:store.facts.flatMap(fact=>fact.kind==='workspace-package'?[{id:fact.id,path:fact.manifestPath,directory:fact.packagePath,workspaceDeclarations:[...workspaceDeclarations.get(fact.id)??[]].sort()}]:[]),
    imports: store.facts.flatMap(fact => fact.kind === 'module-dependency'&&fact.dependencyKind!=='build-entry' ? [{ from: fact.sourcePath, to: fact.targetPath, specifier: fact.specifier }] : []),
    resources: store.facts.flatMap(fact => fact.kind === 'runtime' || fact.kind === 'resource' ? [{ id: fact.id, label: fact.label, type: fact.kind === 'runtime' ? 'runtime' : fact.resourceType, path: fact.filePath, binding: fact.kind === 'resource' ? fact.binding : undefined,
      attributes: Object.fromEntries(Object.entries(fact.metadata).filter((entry): entry is [string, string | number | boolean | string[]] => entry[1] !== undefined)),
      entryPath: typeof fact.metadata.entryPath === 'string' ? fact.metadata.entryPath : typeof fact.metadata.main === 'string' ? `${fact.filePath?.split('/').slice(0, -1).join('/')}/${fact.metadata.main}`.replace(/^\//, '').replaceAll('/./', '/') : undefined,
      evidence: store.evidence.filter(item => fact.evidenceIds.includes(item.id)).map(item => { const range = item.highlightRanges[0]; const line = range?.start.line ?? item.contextStartLine; const endLine = range?.end.line ?? line; const source = store.sources[item.filePath] ?? ''; const lines = source.split('\n'); const start = lines.slice(0, line - 1).reduce((offset, value) => offset + value.length + 1, 0) + (range?.start.column ?? 1) - 1; const end = lines.slice(0, endLine - 1).reduce((offset, value) => offset + value.length + 1, 0) + (range?.end.column ?? (lines[endLine - 1]?.length ?? 0) + 1) - 1; return { path: item.filePath, start, end, line, endLine, description: item.description ?? 'Runtime / resource configuration' }; }),
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
    let stopped = false;
    const stopWorker = () => {
      if (stopped) return;
      stopped = true; worker.onmessage = null; worker.onerror = null; listeners.clear(); worker.terminate();
    };
    let cancel = () => {};
    const promise = new Promise<SemanticAnalysis>((resolve, reject) => {
      cancel = () => { stopWorker(); reject(new Error('解析を中止しました。再実行できます。')); };
      worker.onmessage = ({ data }) => {
        if (data.type === 'progress') { Object.assign(progress, { done: data.done, total: data.total }); listeners.forEach(listener => listener(progress)); }
        if (data.type === 'complete') { stopWorker(); resolve(data.analysis as SemanticAnalysis); }
        if (data.type === 'error') { stopWorker(); jobs.delete(store); reject(new Error(String(data.message))); }
      };
      worker.onerror = event => { stopWorker(); jobs.delete(store); reject(new Error(event.message || '解析エンジンでエラーが発生しました')); };
      worker.postMessage(semanticInput(store));
    });
    job = { promise, listeners, cancel, progress }; jobs.set(store, job);
  }
  if (onProgress) { job.listeners.add(onProgress); onProgress(job.progress); }
  return { promise: job.promise, unsubscribe: () => { if (onProgress) job!.listeners.delete(onProgress); } };
}
