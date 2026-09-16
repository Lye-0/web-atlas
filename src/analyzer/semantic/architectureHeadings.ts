import {semanticRegionIdentity,type SemanticFlowRegion} from './flowRegions';
import type {SemanticNode} from './types';
import type {SemanticPosition} from './presentation';

/** The legend and boundary marks share stable identity/order, never selection order. */
export function architectureEnvironmentHeadings(nodes:readonly SemanticNode[]){
 const groups=new Map(nodes.map(n=>{const r=semanticRegionIdentity(n);return[r.id,r] as const;}));
 return [...groups.values()].sort((a,b)=>a.id.localeCompare(b.id)).map((r,i)=>({...r,number:i+1}));
}
export function architectureBoundaryMarks(regions:readonly SemanticFlowRegion[],positions:readonly SemanticPosition[],scale:number){
 const size=24/Math.max(scale,.000001),gap=6/Math.max(scale,.000001),marks:{id:string;x:number;y:number;anchorX:number;anchorY:number}[]=[];
 for(const r of [...regions].sort((a,b)=>a.id.localeCompare(b.id))){
  const x=r.x-size/2-gap,anchorY=r.y-20;let y=r.y+size+gap;
  const occupied=()=>marks.some(m=>Math.abs(x-m.x)<size+gap&&Math.abs(y-m.y)<size+gap)||positions.some(p=>Math.abs(x-p.x)<124+size/2+gap&&Math.abs(y-p.y)<62+size/2+gap);
  while(occupied())y+=size+gap;
  marks.push({id:r.id,x,y,anchorX:r.x,anchorY});
 }
 return marks;
}
