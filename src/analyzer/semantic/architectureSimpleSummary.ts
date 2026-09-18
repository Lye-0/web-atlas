import type {ArchitectureSimple,SimpleRelation} from './architectureSimple';
import type {SemanticEdge,SemanticNode} from './types';
import {architectureRelationLabel} from './architectureRelations';
import {simplePurposes,simplePurposeOrder} from './architectureSimpleUsage';

export function simpleUsageSummary(nodes:SemanticNode[]){
 const uses=[...new Map(nodes.filter(n=>n.architecture?.kind==='tool-operation'&&n.attributes.purpose!=='script').map(n=>[n.id,n])).values()];
 if(!uses.length)return '';
 const representative=uses[0]!.attributes.scriptName;
 return `${uses.length}使用${representative?`（${representative}${uses.length>1?`ほか${uses.length-1}使用`:''}）`:''}`;
}
export function simplePeers(simple:ArchitectureSimple,id:string,edges:SemanticEdge[]){
 const groups=new Map<string,{id:string;direction:'incoming'|'outgoing';kind:string;label:string;environment:string;confidence:string}>();
 for(const e of edges){const source=simple.owners.get(e.source),target=simple.owners.get(e.target);if(source===target||source!==id&&target!==id)continue;
  const peer=source===id?target:source;if(!peer)continue;
  const direction=source===id?'outgoing':'incoming',environment=e.details?.environment??'',key=JSON.stringify([peer,direction,e.kind,environment,e.confidence]);
  groups.set(key,{id:peer,direction,kind:e.kind,label:architectureRelationLabel(e),environment,confidence:e.confidence});
 }
 const priority=(kind:string)=>['http-request','data-operation','message','process-start'].includes(kind)?0:kind==='deployment-config'?2:1;
 return [...groups.values()].sort((a,b)=>priority(a.kind)-priority(b.kind));
}
export function simpleRelationOverview(simple:ArchitectureSimple,edge:SemanticEdge,relation:SimpleRelation){
 const ids=new Set(relation.edgeIds),edges=simple.original.edges.filter(e=>ids.has(e.id)),byId=new Map(simple.original.nodes.map(n=>[n.id,n]));
 const source=simple.graph.nodes.find(n=>n.id===edge.source)?.label??'元の対象',target=simple.graph.nodes.find(n=>n.id===edge.target)?.label??'相手';
 const uses=[...new Set(edges.flatMap(e=>[e.source,e.target]))].map(id=>byId.get(id)!).filter(n=>n?.architecture?.kind==='tool-operation'&&n.attributes.purpose!=='script');
 const purposes=simplePurposeOrder.filter(p=>uses.some(n=>n.attributes.purpose===p)).map(p=>simplePurposes[p]).join('・');
 const allInput=edges.length>0&&edges.every(e=>e.kind==='flow-input'),codeInput=allInput&&edges.every(e=>byId.get(e.source)?.architecture?.kind==='code-definition');
 const inputTarget=uses.length?target.split('：')[0]:target;
 const sentence=relation.kind==='path'?`${source}から${target}への、元の段階を短縮した経路です。`:allInput?`${source}${codeInput?'側のコード':''}を、${inputTarget}の${purposes?`${purposes}操作で`:''}入力として使う${edges.length>1?'関係をまとめています':'関係です'}。`:`${source} → ${target}の「${architectureRelationLabel(edge)}」${edges.length>1?'をまとめています':'の記述です'}。`;
 const variants=new Set(edges.map(e=>JSON.stringify([e.kind,e.details?.environment??'',e.confidence])));
 return {sentence,usage:simpleUsageSummary(uses),records:ids.size,variants:variants.size,kind:relation.kind==='path'?'複数段階の経路':relation.kind==='aggregate'?'複数関係の束':'直接関係'};
}
export function simplePeerGroups(simple:ArchitectureSimple,id:string,edges:SemanticEdge[]){
 const groups=new Map<string,{id:string;relations:ReturnType<typeof simplePeers>}>();
 for(const relation of simplePeers(simple,id,edges)){const group=groups.get(relation.id)??{id:relation.id,relations:[]};group.relations.push(relation);groups.set(relation.id,group);}
 const secondary=(peer:string)=>simple.units.get(id)?.role==='context'?0:simple.units.get(peer)?.role==='context'?1:0;
 return [...groups.values()].sort((a,b)=>secondary(a.id)-secondary(b.id));
}
