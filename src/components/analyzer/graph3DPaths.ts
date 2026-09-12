import { spatialRelationCurve, type SpatialRelationPoint } from '../../analyzer/spatialRelationPath';
import type { SpatialRelationPath } from './SpatialRelationLines';
interface Edge { id:string; source:string; target:string; color:string; intensity:number; animate:boolean }
type Path=SpatialRelationPath & {animate:boolean};
/** World-space curves are independent of camera projection; retain their GPU inputs. */
export class Graph3DPathCache {
 private entries=new Map<string,{key:string;path:Path}>();
 project(edges:readonly Edge[],points:ReadonlyMap<string,SpatialRelationPoint>):Map<string,Path>{
  const pairs=new Map<string,Edge[]>();
  for(const e of edges){const k=JSON.stringify([e.source,e.target].sort());const pair=pairs.get(k)??[];pair.push(e);pairs.set(k,pair);}
  const next=new Map<string,{key:string;path:Path}>(),result=new Map<string,Path>();
  for(const e of edges){const a=points.get(e.source),b=points.get(e.target);if(!a||!b)continue;
   const pair=pairs.get(JSON.stringify([e.source,e.target].sort()))!,index=pair.indexOf(e),spacing=Math.min(32,80/Math.max(1,pair.length-1));
   const bend=pair.length>1?(index-(pair.length-1)/2+(pair.length%2?.25:0))*spacing*(e.source.localeCompare(e.target)>0?-1:1):undefined;
   const key=JSON.stringify([a.x,a.y,a.z,b.x,b.y,b.z,bend,e.color,e.intensity,e.animate]);
   const old=this.entries.get(e.id),entry=old?.key===key?old:{key,path:{id:e.id,color:e.color,intensity:e.intensity,animate:e.animate,points:spatialRelationCurve(a,b,bend,'3d').points}};
   next.set(e.id,entry);result.set(e.id,entry.path);
  }
  this.entries=next;return result;
 }
}
