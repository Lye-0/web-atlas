import type {SemanticGraph} from './types';
import {semanticFlowRegions,type SemanticMapRect} from './flowRegions';
import {architectureBoundaryHeadings} from './architectureHeadings';
type Point={x:number;y:number;z:number};
const intersects=(a:SemanticMapRect,b:SemanticMapRect)=>a.x<b.x+b.width+24&&a.x+a.width+24>b.x&&a.y<b.y+b.height+24&&a.y+a.height+24>b.y;
/** Only independent compact shelves move, once, after nearby shared code is placed.
 * Route bands and membership stay unchanged. This is not a general parent/child boundary solver. */
export function separateSimpleShelves(graph:SemanticGraph,points:Map<string,Point>){
 const byId=new Map(graph.nodes.map(n=>[n.id,n])),shelves=new Map<string,Set<string>>();
 for(const n of graph.nodes){const region=String(n.attributes.simpleRegionId??'');if(region.startsWith('shelf:')){const ids=shelves.get(region)??new Set<string>();ids.add(n.id);shelves.set(region,ids);}}
 for(const n of graph.nodes.filter(n=>n.attributes.simplePlacement==='shared')){
  const users=[...new Set(graph.edges.filter(e=>e.target===n.id&&e.kind==='simple-reference').map(e=>e.source))],primary=users.filter(id=>byId.get(id)?.attributes.simpleRole!=='context'&&byId.get(id)?.architecture?.kind!=='shared-code'),owners=primary.length?primary:users;
  for(const ids of shelves.values())if(owners.length&&owners.every(id=>ids.has(id))){ids.add(n.id);break;}
 }
 // Keep related shared code outside the shelf's membership boundary. Reserve header
 // space before evaluating global collisions, so headings need not jump above that code.
 for(const [regionId,cohort] of shelves){
  const members=new Set(graph.nodes.filter(n=>n.attributes.simpleRegionId===regionId).map(n=>n.id)),nearby=[...cohort].filter(id=>!members.has(id));
  for(let pass=0;pass<=nearby.length;pass++){
   const positions=graph.nodes.filter(n=>members.has(n.id)).map(node=>({node,...points.get(node.id)!})),region=semanticFlowRegions(positions,'2d')[0];if(!region)break;
   const heading=architectureBoundaryHeadings([region],positions)[0]!,box={x:region.x-12,y:heading.borderTop,width:region.width+24,height:region.y+region.height+20-heading.borderTop};let shift=0;
   for(const id of nearby){const p=points.get(id)!,other={x:p.x-144,y:p.y-68,width:288,height:136};if(intersects(box,other))shift=Math.max(shift,other.y+other.height+24-box.y);}
   if(shift<=0)break;for(const id of members)points.get(id)!.y+=shift;
  }
 }
 const ordered=[...shelves.values()].sort((a,b)=>Math.min(...[...a].map(id=>points.get(id)!.y))-Math.min(...[...b].map(id=>points.get(id)!.y)));
 for(let index=0;index<ordered.length;index++){
  const own=ordered[index]!,later=new Set(ordered.slice(index+1).flatMap(ids=>[...ids]));
  // Each pass clears at least one fixed obstacle. Later shelves are settled afterwards.
  for(let pass=0;pass<=graph.nodes.length;pass++){
   const positions=graph.nodes.filter(n=>!later.has(n.id)).map(node=>({node,...points.get(node.id)!})),regions=semanticFlowRegions(positions,'2d'),headings=new Map(architectureBoundaryHeadings(regions,positions).map(h=>[h.id,h]));
   const boxes=positions.map(p=>({ids:[p.node.id],x:p.x-144,y:p.y-68,width:288,height:136}));
   for(const r of regions){const top=headings.get(r.id)?.borderTop??r.y-20;boxes.push({ids:r.nodeIds,x:r.x-12,y:top,width:r.width+24,height:r.y+r.height+20-top});}
   const moving=boxes.filter(b=>b.ids.some(id=>own.has(id))),fixed=boxes.filter(b=>b.ids.every(id=>!own.has(id)));
   let shift=0;
   for(const a of moving)for(const b of fixed)if(intersects(a,b))shift=Math.max(shift,b.y+b.height+24-a.y);
   if(shift<=0)break;
   for(const id of own)points.get(id)!.y+=shift;
  }
 }
}
