import type {SemanticFlowRegion} from './flowRegions';
import type {SemanticPosition} from './presentation';

export interface ArchitectureHeading {id:string;label:string;left:number;top:number;width:number;height:number;lines:string[];borderTop:number}
const overlaps=(a:ArchitectureHeading,b:{left:number;top:number;width:number;height:number})=>a.left<b.left+b.width+12&&a.left+a.width+12>b.left&&a.top<b.top+b.height+6&&a.top+a.height+6>b.top;

/** World-space text inside the header padding; camera changes never rearrange it. */
export function architectureBoundaryHeadings(regions:readonly SemanticFlowRegion[],positions:readonly SemanticPosition[]=[]):ArchitectureHeading[]{
 const headings:ArchitectureHeading[]=[];
 const nodes=positions.map(p=>({left:p.x-124,top:p.y-62,width:248,height:124}));
 for(const r of [...regions].sort((a,b)=>a.id.localeCompare(b.id))){
  const maxWidth=Math.max(24,Math.min(320,r.width-4)),lines:string[]=[];let line='',length=0,maxLine=0;
  for(const char of r.label){const size=char.codePointAt(0)!>127?12:8;if(char==='\n'||length+size>maxWidth){lines.push(line);maxLine=Math.max(maxLine,length);line='';length=0;if(char==='\n')continue;}line+=char;length+=size;}
  lines.push(line);maxLine=Math.max(maxLine,length);
  const height=lines.length*16,width=Math.min(maxWidth,maxLine+2);
  const h:ArchitectureHeading={id:r.id,label:r.label,left:r.x+2,top:r.y-height-8,width,height,lines,borderTop:0};
  // Prefer a neighbouring position on the same top edge. If it cannot fit,
  // add only another line of header padding, without moving any member node.
  const occupied=[...headings,...nodes];
  let other=occupied.find(o=>overlaps(h,o));
  while(other){
   const next=other.left+other.width+12;
   if(next+width<=r.x+r.width-2&&next-r.x<=Math.max(160,width+12))h.left=next;
   else {h.left=r.x+2;h.top=Math.min(h.top,other.top-height-6);}
   other=occupied.find(o=>overlaps(h,o));
  }
  h.borderTop=Math.min(r.y-20,h.top-12);headings.push(h);
 }
 return headings;
}
