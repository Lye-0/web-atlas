import { projectCommandCatalog } from '../projectors';
import { commandArgv, parseCommandExpression } from '../commandParser';
import type { AnalyzerProjectStore } from '../types';
import type { SemanticEvidence } from './types';

export interface ArchitectureCommand {
  id: string; scriptId: string; label: string; path: string; directory: string;
  scriptName: string; sourceScriptId?: string; sourceCommandId?: string;
  operator?: string;
  invocationLabel?: string;
  argv: string[]; workingDirectory?: string; evidence: SemanticEvidence[];
  targets: string[]; calls: {target:string; id:string; operator?:string; parallel:boolean; evidence:SemanticEvidence[]}[];
}
/** Reuse Command Flow resolution. Run once per immutable scan, never on selection/camera updates. */
export function architectureCommands(store: AnalyzerProjectStore): ArchitectureCommand[] {
  const scripts=store.facts.filter(f=>f.kind==='package-script');
  const output=new Map<string,ArchitectureCommand>();
  const scriptById = new Map(scripts.map(script => [script.id, script]));
  const graph = projectCommandCatalog(store), evidenceById = new Map(graph.evidence.map(e => [e.id, e]));
  const outgoing = new Map<string, typeof graph.edges>(), ownerByCommand = new Map<string, string>();
  for (const edge of graph.edges) {
    const list = outgoing.get(edge.sourceId) ?? []; list.push(edge); outgoing.set(edge.sourceId, list);
    if (edge.kind === 'expands-to') ownerByCommand.set(edge.targetId, edge.sourceId);
  }
  const converted = new Map<string, SemanticEvidence>();
  const lineStarts = new Map<string, number[]>();
  const evidence = (ids: string[]): SemanticEvidence[] => ids.flatMap(id => {
    const cached = converted.get(id); if (cached) return [cached];
    const e = evidenceById.get(id); if (!e) return [];
    const source = store.sources[e.filePath] ?? '';
    let starts = lineStarts.get(e.filePath);
    if (!starts) {
      starts = [0]; for (let i = 0; i < source.length; i++) if (source[i] === '\n') starts.push(i + 1);
      lineStarts.set(e.filePath, starts);
    }
    const range = e.highlightRanges[0], line = range?.start.line ?? e.contextStartLine, endLine = range?.end.line ?? line;
    const offset = (row: number, column: number) => (starts[row - 1] ?? source.length) + column - 1;
    const end = range?.end ? offset(endLine, range.end.column) : (starts[endLine] === undefined ? source.length : starts[endLine]! - 1);
    const value = { path: e.filePath, line, endLine, start: offset(line, range?.start.column ?? 1), end, description: e.description ?? '静的コマンドの記述' };
    converted.set(id, value); return [value];
  });
  for(const node of graph.nodes) {
    if(node.type!=='command'||output.has(node.id))continue;
    const owner=scriptById.get(ownerByCommand.get(node.id) ?? ''); if(!owner)continue;
    const links = outgoing.get(node.id) ?? [];
    const fragment=parseCommandExpression(node.label)[0];if(!fragment)continue;
    output.set(node.id,{id:node.id,scriptId:owner.id,scriptName:owner.scriptName,label:node.label,path:owner.sourcePath,directory:owner.packagePath,
      argv:commandArgv(fragment),operator:typeof node.metadata.operator==='string'?node.metadata.operator:undefined,workingDirectory:typeof node.metadata.workingDirectory==='string'?node.metadata.workingDirectory:fragment.workingDirectory,evidence:evidence(node.evidenceIds),
      targets:links.filter(e=>['starts','uses'].includes(e.kind)).map(e=>e.targetId),
      calls:links.filter(e=>['resolves-to','starts'].includes(e.kind)).map(e=>({target:e.targetId,id:e.id,operator:typeof node.metadata.operator==='string'?node.metadata.operator:undefined,parallel:e.metadata.parallel===true,evidence:evidence(e.evidenceIds)}))});
  }
  // Forwarded literal arguments are an invocation context, not a rewrite of the
  // target script. Keep the original declaration and the call-site evidence.
  for(const wrapper of [...output.values()]) {
    const split=wrapper.argv.indexOf('--');if(split<0||split===wrapper.argv.length-1)continue;
    const extra=wrapper.argv.slice(split+1);if(extra.some(arg=>/[$`]/.test(arg)))continue;
    for(const call of wrapper.calls) {
      const children=[...output.values()].filter(c=>c.scriptId===call.target);if(!children.length)continue;
      const context=`${call.target}:invocation:${wrapper.id}`;
      for(const child of children) output.set(`${child.id}:invocation:${wrapper.id}`,{...child,id:`${child.id}:invocation:${wrapper.id}`,sourceCommandId:child.id,sourceScriptId:child.scriptId,scriptId:context,invocationLabel:`${wrapper.directory||'root'} / ${wrapper.scriptName}`,argv:[...child.argv,...extra],label:`${child.label} ${extra.join(' ')}`,evidence:[...child.evidence,...call.evidence]});
      call.target=context;
    }
  }
  return [...output.values()];
}
