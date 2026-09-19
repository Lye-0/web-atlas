import type {SemanticGraph,SemanticNode} from './types';
import {semanticDepths} from './presentation';
import {layoutUnroutedSimple} from './architectureSimpleUnrouted';
import {separateSimpleShelves} from './architectureSimpleShelfBounds';
import {simplePurposes} from './architectureSimpleUsage';

type Point={x:number;y:number;z:number};
export const simplePipelineKinds=new Set(['flow-loads','flow-input','flow-generates','flow-starts','flow-deploys','flow-applies','simple-artifact-path','build-output','publishes-artifact']);
const purposeOrder=['serve','start','build','generate','deploy','apply'];
/** Recorded route bands first; compact context second. Never enumerate all paths or invent edges. */
export function layoutSimpleArchitecture(graph:SemanticGraph){
 const stage=(n:SemanticNode)=>String(n.attributes.simpleStage??'context'),byId=new Map(graph.nodes.map(n=>[n.id,n]));
 const pipeline=graph.edges.filter(e=>simplePipelineKinds.has(e.kind)&&byId.has(e.source)&&byId.has(e.target)&&!['source','context'].includes(stage(byId.get(e.target)!)));
 if(!pipeline.length){const fallback=layoutUnroutedSimple(graph);if(fallback)return fallback;}
 const outgoing=new Map(graph.nodes.map(n=>[n.id,new Set<string>()])),incoming=new Map(graph.nodes.map(n=>[n.id,new Set<string>()]));
 for(const e of pipeline){outgoing.get(e.source)!.add(e.target);incoming.get(e.target)!.add(e.source);}
 const purpose=(n:SemanticNode)=>{const p=purposeOrder.indexOf(String(n.attributes.purpose??''));return p<0?purposeOrder.length:p;};
 const compare=(a:SemanticNode,b:SemanticNode)=>purpose(a)-purpose(b)||String(a.attributes.simpleEnvironmentLabel??'').localeCompare(String(b.attributes.simpleEnvironmentLabel??''))||a.id.localeCompare(b.id);
 const sources=graph.nodes.filter(n=>stage(n)==='source'&&outgoing.get(n.id)!.size>0).sort((a,b)=>Number(a.architecture?.kind==='shared-code')-Number(b.architecture?.kind==='shared-code')||compare(a,b)),origins=new Map(graph.nodes.map(n=>[n.id,new Set<string>()]));
 for(const source of sources){const queue=[source.id];origins.get(source.id)!.add(source.id);for(let i=0;i<queue.length;i++)for(const id of outgoing.get(queue[i]!)!)if(!origins.get(id)!.has(source.id)){origins.get(id)!.add(source.id);queue.push(id);}}
 const routeIds=new Set(pipeline.flatMap(e=>[e.source,e.target])),depths=semanticDepths({view:'architecture-map',nodes:graph.nodes,edges:pipeline});
 const rank=new Map(graph.nodes.map(n=>[n.id,stage(n)==='source'?0:Math.max(1,(depths.get(n.id)??0)+(origins.get(n.id)!.size?0:1))]));
 const positions2d=new Map<string,Point>(),positions=new Map<string,Point>();
 // Source sets describe input provenance, not ownership. Shared suffixes preserve all inputs.
 const buckets=new Map<string,SemanticNode[]>();
 // Bring the recorded feeder stages into the shared section, not only its final operation.
 const feederSections=new Map<string,Set<string>>();
 for(const merge of graph.nodes.filter(n=>origins.get(n.id)!.size>1)){
  const section=JSON.stringify([...origins.get(merge.id)!].sort()),queue=[merge.id],seen=new Set(queue);
  for(let i=0;i<queue.length;i++)for(const id of incoming.get(queue[i]!)!){if(seen.has(id)||stage(byId.get(id)!)==='source')continue;seen.add(id);const own=origins.get(id)!;if(own.size>1&&JSON.stringify([...own].sort())!==section)continue;const keys=feederSections.get(id)??new Set<string>();keys.add(section);feederSections.set(id,keys);queue.push(id);}
 }
 const sectionOrigins=new Map<string,string[]>();
 for(const n of graph.nodes.filter(n=>routeIds.has(n.id))){const own=[...origins.get(n.id)!].sort(),feed=feederSections.get(n.id),key=feed?.size===1?[...feed][0]!:own.length?JSON.stringify(own):'input-unconfirmed',list=buckets.get(key)??[];list.push(n);buckets.set(key,list);if(key!=='input-unconfirmed')sectionOrigins.set(key,JSON.parse(key) as string[]);}
 const sourceOrder=new Map(sources.map((n,i)=>[n.id,i]));
 const bucketOrder=(key:string)=>{const own=sectionOrigins.get(key)??[];return own.length?own.reduce((v,id)=>v+(sourceOrder.get(id)??0),0)/own.length:Number.MAX_SAFE_INTEGER;};
 let top=0;
 const put=(n:SemanticNode,column:number,y:number,placement:string)=>{rank.set(n.id,column);positions2d.set(n.id,{x:column*350,y,z:0});n.attributes.simplePlacement=placement;};
 for(const [bucket,members]of [...buckets].sort(([a],[b])=>bucketOrder(a)-bucketOrder(b)||a.localeCompare(b))){
  const ids=new Set(members.map(n=>n.id)),localChildren=(id:string)=>[...outgoing.get(id)!].filter(target=>ids.has(target)&&rank.get(target)!>rank.get(id)!).sort((a,b)=>compare(byId.get(a)!,byId.get(b)!));
  const roots=members.filter(n=>![...incoming.get(n.id)!].some(id=>ids.has(id)&&rank.get(id)!<rank.get(n.id)!)).sort(compare);
  const rowStep=Math.max(168,...members.filter(n=>stage(n)==='operation').map(n=>{const label=`${simplePurposes[String(n.attributes.purpose)]??'操作'} / ${n.attributes.simpleEnvironmentLabel??'対象環境未特定'}`;return 142+16*Math.ceil([...label].reduce((sum,c)=>sum+(c.codePointAt(0)!>127?12:8),0)/316);}));
  const used=new Map<number,number[]>(),done=new Set<string>();let cursor=top;
  // A shared node is placed once. Edges within one SCC depth never recurse.
  const visit=(n:SemanticNode):number=>{
   if(done.has(n.id))return positions2d.get(n.id)!.y;
   const rows=localChildren(n.id).map(id=>visit(byId.get(id)!));let y=rows.length?rows.reduce((a,b)=>a+b,0)/rows.length:cursor;
   if(!rows.length)cursor+=rowStep;
   const column=rank.get(n.id)!,occupied=used.get(column)??[];
   while(occupied.some(other=>Math.abs(other-y)<112))y+=rowStep;
   occupied.push(y);used.set(column,occupied);cursor=Math.max(cursor,y+rowStep);
   put(n,column,y,bucket==='input-unconfirmed'?'input-unconfirmed':origins.get(n.id)!.size>1?'shared-route':'route');done.add(n.id);return y;
  };
  for(const n of roots)visit(n);for(const n of members.sort(compare))visit(n);
  for(const op of members.filter(n=>stage(n)==='operation')){
   const label=[simplePurposes[String(op.attributes.purpose)]??'操作',String(op.attributes.simpleEnvironmentLabel??'対象環境未特定')].join(' / ');op.attributes.simpleBranchLabel=label;
   const chain=[op.id],seen=new Set(chain);for(let i=0;i<chain.length;i++)for(const id of localChildren(chain[i]!))if(!seen.has(id)&&incoming.get(id)!.size===1&&stage(byId.get(id)!)!=='operation'){seen.add(id);chain.push(id);}
   if(chain.length>1)for(const id of chain){const n=byId.get(id)!;n.attributes.simpleRegionId=`branch:${op.id}`;n.attributes.simpleRegionLabel=label;}
  }
  top=Math.max(...members.map(n=>positions2d.get(n.id)!.y))+200;
 }
 // If a feeder moved upward to a common section, keep its source next to that entry,
 // rather than making readers cross the source's unrelated development rows first.
 for(const source of sources){const point=positions2d.get(source.id)!;const feederRows=[...outgoing.get(source.id)!].filter(id=>feederSections.get(id)?.size===1).map(id=>positions2d.get(id)!.y);if(!feederRows.length)continue;let y=Math.min(point.y,...feederRows);while([...positions2d].some(([id,p])=>id!==source.id&&p.x===point.x&&Math.abs(p.y-y)<112))y+=140;point.y=y;}
 const remaining=graph.nodes.filter(n=>!positions2d.has(n.id));
 const relatedRows=(n:SemanticNode)=>graph.edges.flatMap(e=>e.source===n.id?[positions2d.get(e.target)?.y]:e.target===n.id?[positions2d.get(e.source)?.y]:[]).filter((y):y is number=>y!==undefined);
 const kind=(n:SemanticNode)=>n.architecture?.kind==='shared-code'?'shared':stage(n)==='source'?'no-route':stage(n)==='context'?'context':'service';
 const groups=new Map<string,SemanticNode[]>();for(const n of remaining){const k=kind(n),list=groups.get(k)??[];list.push(n);groups.set(k,list);}
 const width=Math.max(3,Math.min(5,1+Math.max(0,...rank.values())));
 const sideColumn=1+Math.max(1,...[...positions2d.keys()].map(id=>rank.get(id)!)),sideRows:number[]=[];
 // Place all independent users before shared code; otherwise no-route users fall back to the far service column.
 for(const category of ['service','no-route','context','shared']){
  const list=groups.get(category)??[];if(!list.length)continue;
  list.sort((a,b)=>{const ar=relatedRows(a),br=relatedRows(b);return (ar.length?Math.min(...ar):Infinity)-(br.length?Math.min(...br):Infinity)||compare(a,b);});
  // Service families without a preparation route keep their recorded containment together.
  // Families already participating in a route never enter this remaining-node shelf.
  if(category==='service'){
   const ids=new Set(list.map(n=>n.id)),contains=graph.edges.filter(e=>e.kind==='contains'&&ids.has(e.source)&&ids.has(e.target));
   if(contains.length){const neighbours=new Map(list.map(n=>[n.id,new Set<string>()]));for(const e of contains){neighbours.get(e.source)!.add(e.target);neighbours.get(e.target)!.add(e.source);}const pending=new Set(ids),families:SemanticNode[][]=[];
    while(pending.size){const first=pending.values().next().value!,members=[first];pending.delete(first);for(let i=0;i<members.length;i++)for(const id of neighbours.get(members[i]!)!)if(pending.delete(id))members.push(id);families.push(members.map(id=>byId.get(id)!));}
    const columns=Math.min(3,Math.max(1,Math.ceil(Math.sqrt(families.length))));
    const levels=Array.from({length:columns},()=>top);
    for(const family of families.sort((a,b)=>b.length-a.length||a[0]!.id.localeCompare(b[0]!.id))){const col=levels.indexOf(Math.min(...levels));family.sort((a,b)=>Number(contains.some(e=>e.target===a.id))-Number(contains.some(e=>e.target===b.id))||compare(a,b));family.forEach((n,index)=>{put(n,col+1,levels[col]!+index*140,'service');n.attributes.simplePlacementLabel=contains.some(e=>e.target===n.id)?'内包される構成':'利用・接続先';});levels[col]!+=family.length*140+60;}
    top=Math.max(...levels);
    continue;
   }
  }
  if(category==='shared'||category==='service'){
   for(const n of list){const userIds=[...new Set(graph.edges.filter(e=>e.target===n.id&&e.kind==='simple-reference'&&e.source!==n.id).map(e=>e.source))],primary=userIds.filter(id=>byId.get(id)?.attributes.simpleRole!=='context'&&byId.get(id)?.architecture?.kind!=='shared-code'),users=(primary.length?primary:userIds).map(id=>positions2d.get(id)).filter((p):p is Point=>Boolean(p));const rows=(category==='shared'&&users.length?users.map(p=>p.y):relatedRows(n)).sort((a,b)=>a-b);let y=rows.length?rows[Math.floor(rows.length/2)]!:top;
    let column=category==='shared'&&users.length?Math.round(users.map(p=>p.x/350).sort((a,b)=>a-b)[Math.floor(users.length/2)]!)-1:sideColumn;
    const desired=y,occupied=[...positions2d.values()],free=(c:number,row:number)=>occupied.every(p=>p.x!==c*350||Math.abs(p.y-row)>=140);
    if(category==='shared'&&!free(column,y)){const candidates:{column:number;y:number;score:number}[]=[];for(const c of [column,column+1,column-1])for(let distance=0;distance<=graph.nodes.length;distance++)for(const row of distance?[desired-distance*140,desired+distance*140]:[desired])if(free(c,row))candidates.push({column:c,y:row,score:users.length?users.reduce((sum,p)=>sum+Math.abs(p.x-c*350)+Math.abs(p.y-row),0):Math.abs(c-column)*350+Math.abs(row-desired)});const closest=candidates.sort((a,b)=>a.score-b.score)[0];if(closest){column=closest.column;y=closest.y;}}
    else if(category!=='shared')while(!free(column,y))y+=140;
    sideRows.push(y);put(n,column,y,category);n.attributes.simplePlacementLabel=category==='shared'?'共有部分':'利用・接続先';}
   top=Math.max(top,...sideRows.map(y=>y+180));continue;
  }
  // A compact shelf beside the users; it must not split an existing route band.
  const rows=list.flatMap(relatedRows),wanted=category==='shared'&&rows.length?Math.max(...rows)+170:top;
  let yStart=Math.min(top,wanted);
  for(const members of buckets.values()){const ys=members.map(n=>positions2d.get(n.id)!.y);if(yStart>Math.min(...ys)&&yStart<Math.max(...ys)+150)yStart=Math.max(...ys)+170;}
  const height=Math.ceil(list.length/width)*140+80;for(const p of positions2d.values())if(p.y>=yStart)p.y+=height;
  for(let i=0;i<list.length;i++){const n=list[i]!;put(n,i%width,yStart+Math.floor(i/width)*140,category);n.attributes.simplePlacementLabel=category==='shared'?'共有部分':category==='no-route'?'起動・公開経路は未確認':category==='context'?String(n.attributes.simpleSupportPurpose||'役割・所属未判定'):'利用・接続先';n.attributes.simpleRegionId=`shelf:${category}`;n.attributes.simpleRegionLabel=category==='context'?'補助・未確認の構成':String(n.attributes.simplePlacementLabel);}
  top=Math.max(top+height,...[...positions2d.values()].map(p=>p.y+180));
 }
 separateSimpleShelves(graph,positions2d);
 for(const n of graph.nodes){const p=positions2d.get(n.id)!,own=[...origins.get(n.id)!],sourceYs=own.map(id=>positions2d.get(id)?.y).filter((y):y is number=>y!==undefined),center=sourceYs.length?sourceYs.reduce((a,b)=>a+b,0)/sourceYs.length:p.y;
  positions.set(n.id,{x:p.x*.62,y:p.y*.52,z:stage(n)==='source'||stage(n)==='arrival'?0:Math.max(-150,Math.min(150,(p.y-center)*.45))});n.attributes.simpleSourceIds=own;n.attributes.simpleColumn=rank.get(n.id)!;
 }
 return {positions,positions2d};
}
