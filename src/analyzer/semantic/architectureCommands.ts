import { projectCommand } from '../projectors';
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
  for(const script of scripts) {
    const graph=projectCommand(store,script.id), evidenceById=new Map(graph.evidence.map(e=>[e.id,e]));
    const evidence=(ids:string[]):SemanticEvidence[]=>ids.flatMap(id=>{
      const e=evidenceById.get(id); if(!e)return[];
      const r=e.highlightRanges[0],line=r?.start.line??e.contextStartLine,endLine=r?.end.line??line;
      const lines=(store.sources[e.filePath]??'').split('\n');
      const offset=(row:number,col:number)=>lines.slice(0,row-1).reduce((n,s)=>n+s.length+1,0)+col-1;
      return[{path:e.filePath,line,endLine,start:offset(line,r?.start.column??1),end:offset(endLine,r?.end.column??(lines[endLine-1]?.length??0)+1),description:e.description??'静的コマンドの記述'}];
    });
    for(const node of graph.nodes) {
      if(node.type!=='command'||output.has(node.id))continue;
      const edge=graph.edges.find(e=>e.targetId===node.id&&e.kind==='expands-to');
      const owner=scripts.find(s=>s.id===edge?.sourceId); if(!owner)continue;
      const fragment=parseCommandExpression(node.label)[0];if(!fragment)continue;
      output.set(node.id,{id:node.id,scriptId:owner.id,scriptName:owner.scriptName,label:node.label,path:owner.sourcePath,directory:owner.packagePath,
        argv:commandArgv(fragment),operator:typeof node.metadata.operator==='string'?node.metadata.operator:undefined,workingDirectory:typeof node.metadata.workingDirectory==='string'?node.metadata.workingDirectory:fragment.workingDirectory,evidence:evidence(node.evidenceIds),
        targets:graph.edges.filter(e=>e.sourceId===node.id&&['starts','uses'].includes(e.kind)).map(e=>e.targetId),
        calls:graph.edges.filter(e=>e.sourceId===node.id&&['resolves-to','starts'].includes(e.kind)).map(e=>({target:e.targetId,id:e.id,operator:typeof node.metadata.operator==='string'?node.metadata.operator:undefined,parallel:e.metadata.parallel===true,evidence:evidence(e.evidenceIds)}))});
    }
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
