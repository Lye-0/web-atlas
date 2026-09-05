import type { SpatialWorldPoint } from './spatialCoordinates';
import type { SpatialRouteObstacle } from './spatialRouting';
import { ANALYZER_SPATIAL_TILT_DEGREES } from './spatialPresentation';

export function spatialPortNormal(point: SpatialWorldPoint, rect: { x:number; y:number; width:number; height:number }): {x:number;y:number} {
  return [
    { distance:Math.abs(point.x-rect.x), x:-1,y:0 },
    { distance:Math.abs(point.x-rect.x-rect.width), x:1,y:0 },
    { distance:Math.abs(point.y-rect.y), x:0,y:-1 },
    { distance:Math.abs(point.y-rect.y-rect.height), x:0,y:1 },
  ].sort((a,b)=>a.distance-b.distance)[0]!;
}

/** The entire world-space connection is retained, independently of the viewport. */
export function spatialBridgeRoute(start: SpatialWorldPoint, end: SpatialWorldPoint, obstacles: readonly (SpatialRouteObstacle & { z?: number })[], lane = 0, startNormal?: {x:number;y:number}, endNormal?: {x:number;y:number}): SpatialWorldPoint[] {
  const dx = end.x - start.x, dy = end.y - start.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const terrain = obstacles.reduce((height, item) => Math.max(height, item.z ?? 34), Math.max(start.z, end.z));
  const height = terrain + 42 + Math.min(150, Math.sqrt(length) * 3) + lane * 20;
  const points: SpatialWorldPoint[] = [];
  const normalA=startNormal ?? {x:dx/length,y:dy/length}, normalB=endNormal ?? {x:-dx/length,y:-dy/length};
  const lead = Math.min(100, length * .32);
  const a = { x: start.x + normalA.x * lead, y: start.y + normalA.y * lead };
  const b = { x: end.x + normalB.x * lead, y: end.y + normalB.y * lead };
  const tilt = Math.tan(ANALYZER_SPATIAL_TILT_DEGREES * Math.PI / 180);
  const visibleLift = Math.min(120, length * .42) + lane * 14;
  const samples = 64;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples, u = 1 - t;
    // C1-continuous arch: flat, outward endpoint tangents, with no elbow joins.
    const arch = Math.sin(Math.PI * t) ** 2;
    const floor = start.z * u + end.z * t;
    const rise = (height - floor) * arch;
    points.push({
      x: u ** 3 * start.x + 3 * u * u * t * a.x + 3 * u * t * t * b.x + t ** 3 * end.x,
      y: u ** 3 * start.y + 3 * u * u * t * a.y + 3 * u * t * t * b.y + t ** 3 * end.y
        + (rise - visibleLift * arch) * tilt,
      z: floor + rise,
    });
  }
  points[0] = { ...start }; points[samples] = { ...end };
  return points;
}

export function assignSpatialBridgeLanes(edges: readonly {id:string;start:{x:number;y:number};end:{x:number;y:number}}[]): Map<string, number> {
  const assigned = new Map<string,number>();
  const ordered = [...edges].sort((a,b)=>Math.min(a.start.x,a.end.x)-Math.min(b.start.x,b.end.x)||a.id.localeCompare(b.id));
  const active: typeof ordered = [];
  const turn=(a:{x:number;y:number},b:{x:number;y:number},c:{x:number;y:number})=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  for(const edge of ordered){
    const occupied=new Set<number>();
    for(let i=active.length-1;i>=0;i--){
      const other=active[i]!;
      if(Math.max(other.start.x,other.end.x)<Math.min(edge.start.x,edge.end.x)){active.splice(i,1);continue;}
      if(turn(edge.start,edge.end,other.start)*turn(edge.start,edge.end,other.end)<0 && turn(other.start,other.end,edge.start)*turn(other.start,other.end,edge.end)<0) occupied.add(assigned.get(other.id)!);
    }
    let lane=0;while(occupied.has(lane))lane++;
    assigned.set(edge.id,lane);active.push(edge);
  }
  return assigned;
}

/** Segment clipping, rather than endpoint culling, includes both-offscreen crossings. */
export function spatialPathIntersectsViewport(points: readonly { x: number; y: number }[], width: number, height: number): boolean {
  for (let i = 1; i < points.length; i++) {
    const a = points[i-1]!, b = points[i]!;
    let lower = 0, upper = 1;
    const dx = b.x-a.x, dy=b.y-a.y;
    let hit = true;
    for (const [p,q] of [[-dx,a.x],[dx,width-a.x],[-dy,a.y],[dy,height-a.y]]) {
      if (p === 0) { if (q! < 0) { hit = false; break; } }
      else {
        const t = q! / p!;
        if(p! < 0) lower=Math.max(lower,t); else upper=Math.min(upper,t);
        if(lower>upper) {hit=false;break;}
      }
    }
    if(hit)return true;
  }
  return false;
}
