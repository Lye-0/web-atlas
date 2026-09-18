import type {SemanticGraph,SemanticNode} from './types';
import type {SimpleUnit} from './architectureSimple';
import {semanticDepths} from './presentation';
type Point={x:number;y:number;z:number};

/** Pack connected primary diagrams; reserve support space locally rather than stretching every row. */
export function layoutSimpleArchitecture(graph:SemanticGraph,units:ReadonlyMap<string,SimpleUnit>,owners:ReadonlyMap<string,string>){
 const primary=graph.nodes.filter(n=>units.get(n.id)?.role==='primary'&&n.architecture?.kind!=='shared-code'),mainIds=new Set(primary.map(n=>n.id)),byId=new Map(graph.nodes.map(n=>[n.id,n]));
 const mainEdges=graph.edges.filter(e=>mainIds.has(e.source)&&mainIds.has(e.target)&&!e.details?.structural&&!e.kind.startsWith('flow-'));
 const positions2d=new Map<string,Point>(),positions=new Map<string,Point>(),supportByOwner=new Map<string,SemanticNode[]>(),shared:SemanticNode[]=[],context:SemanticNode[]=[],database:SemanticNode[]=[];
  for(const n of graph.nodes){const unit=units.get(n.id)!;if(mainIds.has(n.id))continue;const targets=[...new Set(unit.targetIds.map(id=>owners.get(id)).filter((id):id is string=>Boolean(id&&mainIds.has(id))))];
  if(n.attributes.simpleSupportPurpose==='DB構造変更'){database.push(n);continue;}
  if(unit.role==='support'&&targets.length===1){const list=supportByOwner.get(targets[0]!)??[];list.push(n);supportByOwner.set(targets[0]!,list);}else if(unit.role==='support')shared.push(n);else context.push(n);
 }
 const neighbours=new Map(primary.map(n=>[n.id,new Set<string>()]));for(const e of mainEdges){neighbours.get(e.source)!.add(e.target);neighbours.get(e.target)!.add(e.source);}
 const pending=new Set(primary.map(n=>n.id)),components:string[][]=[];
 while(pending.size){const ids=[pending.values().next().value!];pending.delete(ids[0]!);for(let i=0;i<ids.length;i++)for(const id of neighbours.get(ids[i]!)??[])if(pending.delete(id))ids.push(id);components.push(ids);}
 components.sort((a,b)=>b.length-a.length||a[0]!.localeCompare(b[0]!));let xOffset=0,yOffset=0,shelfHeight=0;
 for(const ids of components){const nodes=ids.map(id=>byId.get(id)!),set=new Set(ids),edges=mainEdges.filter(e=>set.has(e.source)&&set.has(e.target)),depths=semanticDepths({view:'architecture-map',nodes,edges}),levels=new Map<number,SemanticNode[]>();
  for(const n of nodes){const depth=depths.get(n.id)??0,list=levels.get(depth)??[];list.push(n);levels.set(depth,list);}
  const local=new Map<string,Point>();let column=0,width=0,height=0;
  for(const [,list]of [...levels].sort(([a],[b])=>a-b)){
   list.sort((a,b)=>Number(b.architecture?.kind==='application')-Number(a.architecture?.kind==='application')||(neighbours.get(b.id)!.size-neighbours.get(a.id)!.size)||a.id.localeCompare(b.id));
   for(let start=0;start<list.length;start+=3){let y=0;for(const n of list.slice(start,start+3)){const x=column*480+115;local.set(n.id,{x,y,z:0});const support=(supportByOwner.get(n.id)??[]).sort((a,b)=>a.label.localeCompare(b.label)||a.id.localeCompare(b.id));support.forEach((s,i)=>local.set(s.id,{x:x+(i%2)*230-115,y:y+110+Math.floor(i/2)*95,z:-90}));y+=145+Math.ceil(support.length/2)*100;height=Math.max(height,y);}column++;}
  }
  width=Math.max(260,column*480);
  if(xOffset&&xOffset+width>2400){xOffset=0;yOffset+=shelfHeight+130;shelfHeight=0;}
  for(const [id,p]of local){positions2d.set(id,{x:p.x+xOffset,y:p.y+yOffset,z:0});positions.set(id,{x:(p.x+xOffset)*.55,y:(p.y+yOffset)*.55,z:p.z});}
  xOffset+=width+100;shelfHeight=Math.max(shelfHeight,height);
 }
 // Group only overlapping recorded DB targets; this is a layout branch, not a new owner or execution path.
 const remaining=new Set(database),stage=(n:SemanticNode)=>n.architecture?.kind==='code-definition'?0:units.get(n.id)?.purposes.includes('generate')?1:n.architecture?.kind==='artifact'?2:3;
 while(remaining.size){const first=remaining.values().next().value!,branch=[first],targets=new Set(units.get(first.id)!.targetIds);remaining.delete(first);
  for(let i=0;i<branch.length;i++)for(const n of remaining)if(units.get(n.id)!.targetIds.some(id=>targets.has(id))){branch.push(n);remaining.delete(n);for(const id of units.get(n.id)!.targetIds)targets.add(id);}
  branch.sort((a,b)=>stage(a)-stage(b)||a.id.localeCompare(b.id));const anchors=[...targets].map(id=>positions2d.get(owners.get(id)??'')).filter((p):p is Point=>Boolean(p));
  const center=anchors.length?anchors.reduce((sum,p)=>sum+p.x,0)/anchors.length:0,bottom=anchors.length?Math.max(...anchors.map(p=>p.y))+135:Math.max(0,...[...positions2d.values()].map(p=>p.y))+135;
  const slots=(x:number,y:number)=>branch.map((_,i)=>({x:x+(i%3)*245,y:y+Math.floor(i/3)*100,z:0}));let chosen:Point[]|undefined;
  for(let row=0;row<12&&!chosen;row++)for(const offset of [0,-245,245,-490,490]){const candidate=slots(center-245+offset,bottom+row*100);if(candidate.every(p=>[...positions2d.values()].every(other=>Math.abs(p.x-other.x)>=235||Math.abs(p.y-other.y)>=90))){chosen=candidate;break;}}
  chosen??=slots(center-245,Math.max(bottom,...[...positions2d.values()].map(p=>p.y))+135);
  branch.forEach((n,i)=>{const p=chosen![i]!;positions2d.set(n.id,p);positions.set(n.id,{x:p.x*.55,y:p.y*.55,z:-90});});
 }
 const placeNear=(n:SemanticNode,targets:Point[],fallbackIndex:number)=>{
  const center=targets.length?{x:targets.reduce((sum,p)=>sum+p.x,0)/targets.length,y:targets.reduce((sum,p)=>sum+p.y,0)/targets.length}:{x:(fallbackIndex%4)*280,y:Math.max(0,...[...positions2d.values()].map(p=>p.y))+140};
  const secondary=Boolean(n.attributes.simpleSupportPurpose),candidates=[];for(let row=secondary?1:-3;row<=6;row++)for(let col=-3;col<=3;col++)candidates.push({x:center.x+col*250,y:center.y+row*110,z:0,score:Math.abs(col)*1.5+Math.abs(row)+(row<0?.5:0)});
  candidates.sort((a,b)=>a.score-b.score||a.y-b.y||a.x-b.x);const spot=candidates.find(p=>[...positions2d.values()].every(other=>Math.abs(p.x-other.x)>=235||Math.abs(p.y-other.y)>=90))??{x:center.x,y:center.y+550,z:0};
  positions2d.set(n.id,{x:spot.x,y:spot.y,z:0});positions.set(n.id,{x:spot.x*.55,y:spot.y*.55,z:units.get(n.id)?.role==='support'?-90:90});
 };
 shared.sort((a,b)=>a.id.localeCompare(b.id)).forEach((n,i)=>placeNear(n,units.get(n.id)!.targetIds.map(id=>positions2d.get(owners.get(id)??'')).filter((p):p is Point=>Boolean(p)),i));
 context.sort((a,b)=>a.id.localeCompare(b.id)).forEach((n,i)=>{const neighbours=graph.edges.flatMap(e=>e.source===n.id?[e.target]:e.target===n.id?[e.source]:[]);placeNear(n,neighbours.map(id=>positions2d.get(id)).filter((p):p is Point=>Boolean(p)),i);});
 return {positions,positions2d};
}
