import type {SemanticGraph,SemanticNode} from './types';
import {semanticDepths} from './presentation';

type Point={x:number;y:number;z:number};
const pipelineKinds=new Set(['flow-input','flow-generates','flow-starts','flow-deploys','flow-applies','simple-artifact-path','build-output','publishes-artifact']);
const purposeOrder=['serve','start','build','generate','deploy','apply'];
/** Finite source/branch layout. Runtime references stay visible but do not rank the preparation pipeline. */
export function layoutSimpleArchitecture(graph:SemanticGraph){
 const stage=(n:SemanticNode)=>String(n.attributes.simpleStage??'context'),byId=new Map(graph.nodes.map(n=>[n.id,n]));
 const pipeline=graph.edges.filter(e=>pipelineKinds.has(e.kind)&&byId.has(e.source)&&byId.has(e.target)&&!['source','context'].includes(stage(byId.get(e.target)!)));
 const outgoing=new Map(graph.nodes.map(n=>[n.id,[] as string[]])),incoming=new Map(graph.nodes.map(n=>[n.id,[] as string[]]));
 for(const edge of pipeline){outgoing.get(edge.source)!.push(edge.target);incoming.get(edge.target)!.push(edge.source);}
 const sources=graph.nodes.filter(n=>stage(n)==='source').sort((a,b)=>Number(outgoing.get(b.id)!.length>0)-Number(outgoing.get(a.id)!.length>0)||Number(a.architecture?.kind==='shared-code')-Number(b.architecture?.kind==='shared-code')||a.id.localeCompare(b.id));
 const origins=new Map(graph.nodes.map(n=>[n.id,new Set<string>()]));
 for(const source of sources){const queue=[source.id];origins.get(source.id)!.add(source.id);for(let i=0;i<queue.length;i++)for(const id of outgoing.get(queue[i]!)??[])if(!origins.get(id)!.has(source.id)){origins.get(id)!.add(source.id);queue.push(id);}}
 const depths=semanticDepths({view:'architecture-map',nodes:graph.nodes,edges:pipeline});
 const rank=new Map(graph.nodes.map(n=>[n.id,stage(n)==='source'?0:Math.max(1,depths.get(n.id)??0)]));
 const arrivalRank=Math.max(2,...graph.nodes.filter(n=>stage(n)!=='arrival'&&stage(n)!=='context').map(n=>(rank.get(n.id)??0)+1),...graph.nodes.filter(n=>stage(n)==='arrival').map(n=>rank.get(n.id)??1));
 for(const n of graph.nodes)if(stage(n)==='arrival')rank.set(n.id,arrivalRank);
 const positions2d=new Map<string,Point>(),positions=new Map<string,Point>(),occupied=new Map<number,number[]>(),centers=new Map<string,number>();
 const purpose=(n:SemanticNode)=>{const index=purposeOrder.indexOf(String(n.attributes.purpose??''));return index<0?purposeOrder.length:index;};
 const compare=(a:SemanticNode,b:SemanticNode)=>(rank.get(a.id)!-rank.get(b.id)!)||purpose(a)-purpose(b)||a.id.localeCompare(b.id);
 const place=(n:SemanticNode,wanted:number,base:number)=>{const column=rank.get(n.id)!,used=occupied.get(column)??[];let y=wanted,found=false;
  for(let distance=0;distance<=graph.nodes.length+2;distance++){const candidates=distance?[wanted+distance*116,wanted-distance*116]:[wanted];const free=candidates.find(value=>value>=base&&used.every(other=>Math.abs(other-value)>=108));if(free!==undefined){y=free;found=true;break;}}
  if(!found)y=Math.max(base,wanted,...used)+116;
  used.push(y);occupied.set(column,used);const x=column*350;positions2d.set(n.id,{x,y,z:0});
  const own=[...origins.get(n.id)!],center=own.length===1?centers.get(own[0]!)??y:y,z=stage(n)==='source'||stage(n)==='arrival'?0:Math.max(-150,Math.min(150,(y-center)*.45));
  positions.set(n.id,{x:x*.62,y:y*.52,z});
 };
 let top=0;
 for(const source of sources){const exclusive=graph.nodes.filter(n=>n.id!==source.id&&origins.get(n.id)!.size===1&&origins.get(n.id)!.has(source.id)),counts=new Map<number,number>();for(const n of exclusive)counts.set(rank.get(n.id)!,1+(counts.get(rank.get(n.id)!)??0));
  const rows=Math.max(1,...counts.values()),center=top+(rows-1)*58;centers.set(source.id,center);place(source,center,top);
  const byRank=new Map<number,SemanticNode[]>();for(const n of exclusive.sort(compare)){const list=byRank.get(rank.get(n.id)!)??[];list.push(n);byRank.set(rank.get(n.id)!,list);}
  for(const list of byRank.values())for(let i=0;i<list.length;i++){const n=list[i]!,parents=(incoming.get(n.id)??[]).map(id=>positions2d.get(id)).filter((p):p is Point=>Boolean(p));const direct=parents.length&&parents.every(p=>p.x===0),preferred=direct?top+i*116:parents.length?parents.reduce((sum,p)=>sum+p.y,0)/parents.length:top+i*116;place(n,preferred,top);}
  top=Math.max(center,...exclusive.map(n=>positions2d.get(n.id)?.y??center))+180;
 }
 // Shared operations and arrivals have one point; all recorded inputs remain incoming edges.
 const remaining=graph.nodes.filter(n=>!positions2d.has(n.id)&&stage(n)!=='context').sort(compare);
 for(const n of remaining){const parents=(incoming.get(n.id)??[]).map(id=>positions2d.get(id)).filter((p):p is Point=>Boolean(p)),rootRows=[...origins.get(n.id)!].map(id=>centers.get(id)!).filter(Number.isFinite);
  const related=parents.length?parents:stage(n)==='arrival'?graph.edges.flatMap(e=>e.target===n.id?[positions2d.get(e.source)]:e.source===n.id?[positions2d.get(e.target)]:[]).filter((p):p is Point=>Boolean(p)):[];
  const preferred=related.length?related.reduce((sum,p)=>sum+p.y,0)/related.length:rootRows.length?rootRows.reduce((sum,y)=>sum+y,0)/rootRows.length:top;
  place(n,preferred,0);if(!related.length&&!rootRows.length)top+=130;
 }
 for(const n of graph.nodes.filter(n=>stage(n)==='context').sort((a,b)=>a.id.localeCompare(b.id))){rank.set(n.id,0);place(n,top,top);top+=140;}
 for(const source of sources){const members=graph.nodes.filter(n=>origins.get(n.id)!.size===1&&origins.get(n.id)!.has(source.id));if(members.length<2)continue;for(const n of members){n.attributes.simpleRegionId=`source:${source.id}`;n.attributes.simpleRegionLabel=`${source.label} · 経路`;}}
 for(const n of graph.nodes){n.attributes.simpleSourceIds=[...origins.get(n.id)!];n.attributes.simpleColumn=rank.get(n.id)!;}
 return {positions,positions2d};
}
