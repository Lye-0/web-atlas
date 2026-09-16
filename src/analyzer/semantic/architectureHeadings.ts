import type {SemanticFlowRegion} from './flowRegions';
import type {SemanticPosition} from './presentation';

export interface HeadingBox {left:number;top:number;width:number;height:number}
export interface ArchitectureHeading extends HeadingBox {id:string;label:string;anchorX:number;anchorY:number}
const intersects=(a:HeadingBox,b:HeadingBox)=>a.left<b.left+b.width+6&&a.left+a.width+6>b.left&&a.top<b.top+b.height+6&&a.top+a.height+6>b.top;
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));

/** Screen-space names follow a visible boundary without moving nodes or the camera. */
export function architectureBoundaryHeadings(regions:readonly SemanticFlowRegion[],positions:readonly SemanticPosition[],camera:{x:number;y:number;scale:number},viewport:{width:number;height:number},overlayTop=0,extra:readonly HeadingBox[]=[]):ArchitectureHeading[]{
 const top=Math.max(12,overlayTop+8),bottom=viewport.height-76,right=viewport.width-12;
 if(right<100||bottom-top<50)return [];
 const obstacles:HeadingBox[]=[...extra,...positions.map(p=>({left:camera.x+(p.x-124)*camera.scale,top:camera.y+(p.y-62)*camera.scale,width:248*camera.scale,height:124*camera.scale})).filter(b=>b.left<right&&b.left+b.width>0&&b.top<bottom&&b.top+b.height>top)];
 const placed:ArchitectureHeading[]=[];
 for(const region of [...regions].sort((a,b)=>a.id.localeCompare(b.id))){
  const left=camera.x+(region.x-12)*camera.scale,r=camera.x+(region.x+region.width+12)*camera.scale,t=camera.y+(region.y-20)*camera.scale,b=camera.y+(region.y+region.height+20)*camera.scale;
  if(r<12||left>right||b<top||t>bottom)continue;
  const units=[...region.label].reduce((sum,ch)=>sum+(ch.codePointAt(0)!>127?13:7.5),0);
  const width=Math.min(Math.max(110,units+24),228,right-12),height=units>width-24?48:30;
  const candidates:ArchitectureHeading[]=[];
  const add=(x:number,y:number,ax:number,ay:number)=>{if(x>=12&&x+width<=right&&y>=top&&y+height<=bottom)candidates.push({id:region.id,label:region.label,left:x,top:y,width,height,anchorX:ax,anchorY:ay});};
  // Search along the same visible boundary, never pin an offscreen group to the centre.
  for(const offset of [8,36,72]){
   for(const x of [left,r])if(x>=12&&x<=right){
    const start=clamp(t,top,Math.max(top,bottom-height));
    for(let y=start;y<=Math.min(b,bottom-height);y+=height+8){add(x-width-offset,y,x,clamp(y+height/2,t,b));add(x+offset,y,x,clamp(y+height/2,t,b));}
   }
   for(const y of [t,b])if(y>=top&&y<=bottom){
    const start=clamp(left,12,Math.max(12,right-width));
    for(let x=start;x<=Math.min(r,right-width);x+=width+8){add(x,y-height-offset,clamp(x+width/2,left,r),y);add(x,y+offset,clamp(x+width/2,left,r),y);}
   }
  }
  const candidate=candidates.find(c=>!obstacles.some(o=>intersects(c,o))&&!placed.some(o=>intersects(c,o)));
  if(candidate)placed.push(candidate);
 }
 return placed;
}
