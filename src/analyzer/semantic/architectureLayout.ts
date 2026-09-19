import { semanticDepths, type SemanticPosition } from './presentation';
import type { SemanticGraph, SemanticNode } from './types';

/** Bounded deterministic crossing reduction. Only immutable graph input owns this layout. */
export function layoutArchitectureRelations(graph:SemanticGraph):SemanticPosition[] {
 const nodes=[...graph.nodes].sort((a,b)=>a.id.localeCompare(b.id)),byId=new Map(nodes.map(n=>[n.id,n]));
 const edges=graph.edges.filter(e=>e.source!==e.target&&byId.has(e.source)&&byId.has(e.target));
 const neighbours=new Map(nodes.map(n=>[n.id,new Map<string,number>()]));
 for(const e of edges){const weight=e.details?.structural?1:e.kind.startsWith('flow-')?4:['http-request','data-operation','service-use','deployment-config'].includes(e.kind)?3:1;
  for(const [a,b]of [[e.source,e.target],[e.target,e.source]])neighbours.get(a!)!.set(b!,Math.max(neighbours.get(a!)!.get(b!)??0,weight));
 }
 const components:SemanticNode[][]=[],seen=new Set<string>();
 for(const n of nodes){if(seen.has(n.id))continue;const pending=[n.id];seen.add(n.id);for(let i=0;i<pending.length;i++)for(const id of neighbours.get(pending[i]!)!.keys())if(!seen.has(id)){seen.add(id);pending.push(id);}components.push(pending.map(id=>byId.get(id)!));}
 components.sort((a,b)=>b.length-a.length||a[0]!.id.localeCompare(b[0]!.id));
 const points:SemanticPosition[]=[];let offset=0;
 for(const members of components){
  const ids=new Set(members.map(n=>n.id));
  const depths=semanticDepths({...graph,nodes:members,edges:edges.filter(e=>ids.has(e.source)&&ids.has(e.target)&&!e.details?.structural)});
  const levels=new Map<number,SemanticNode[]>();for(const n of members){const depth=depths.get(n.id)??0,list=levels.get(depth)??[];list.push(n);levels.set(depth,list);}
  const ordered=[...levels].sort(([a],[b])=>a-b),rank=new Map<string,number>();
  const update=()=>{for(const [,list]of ordered)list.forEach((n,i)=>rank.set(n.id,(i+.5)/list.length));};update();
  for(let pass=0;pass<8;pass++)for(const [,list]of pass%2?[...ordered].reverse():ordered){
   const score=(id:string)=>{let sum=0,total=0;for(const [other,w]of neighbours.get(id)!){sum+=(rank.get(other)??.5)*w;total+=w;}return total?sum/total:rank.get(id)!;};
   const scores=new Map(list.map(n=>[n.id,score(n.id)]));list.sort((a,b)=>scores.get(a.id)!-scores.get(b.id)!||a.id.localeCompare(b.id));update();
  }
  const maxRows=Math.min(6,Math.max(1,...ordered.map(([,ns])=>ns.length)));let x=0;
  for(const [,list]of ordered){const columns=Math.ceil(list.length/maxRows),rows=Math.ceil(list.length/columns);list.forEach((node,i)=>points.push({node,x:x+Math.floor(i/rows)*304,y:offset+(i%rows+(maxRows-rows)/2)*156,z:0}));x+=Math.max(1,columns)*304+44;}
  offset+=maxRows*156+140;
 }
 // Disconnected singletons form one compact auxiliary row, not one row per object.
 const singles=points.filter(p=>neighbours.get(p.node.id)!.size===0),connected=points.filter(p=>neighbours.get(p.node.id)!.size>0);
 const bottom=connected.length?Math.max(...connected.map(p=>p.y))+220:0;
 singles.forEach((p,i)=>{p.x=(i%5)*304;p.y=bottom+Math.floor(i/5)*156;});
 return points;
}
