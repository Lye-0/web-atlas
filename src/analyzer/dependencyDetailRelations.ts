import type { AnalyzerViewModel } from './types';
/** Presentation bundles are navigation, never an additional dependency declaration. */
export function dependencyDetailRelations(view: AnalyzerViewModel, nodeId: string) {
  const nodes=new Map(view.nodes.map(node=>[node.id,node]));
  const declarations: AnalyzerViewModel['edges']=[], summaries=new Map<string,{node:AnalyzerViewModel['nodes'][number];relationIds:string[]}>();
  for(const edge of view.edges){
    if(edge.sourceId!==nodeId&&edge.targetId!==nodeId)continue;
    const summary=[nodes.get(edge.sourceId),nodes.get(edge.targetId)].find(node=>node?.presentation?.role==='summary');
    if(summary){const group=summaries.get(summary.id)??{node:summary,relationIds:[]};group.relationIds.push(edge.id);summaries.set(summary.id,group);}
    else if(edge.presentation?.displayKind!=='bundle')declarations.push(edge);
  }
  return {declarations,summaries:[...summaries.values()],outgoingTargets:new Set(declarations.filter(edge=>edge.sourceId===nodeId).map(edge=>edge.targetId)).size,
    incomingSources:new Set(declarations.filter(edge=>edge.targetId===nodeId).map(edge=>edge.sourceId)).size};
}
