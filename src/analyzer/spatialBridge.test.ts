import { describe, expect, it } from 'vitest';
import { spatialBridgeRoute, spatialPathIntersectsViewport, assignSpatialBridgeLanes } from './spatialBridge';
import { projectSpatialPoint, spatialCameraModel } from './spatialCoordinates';

describe('spatial bridge connections', () => {
  it('connects real ports over an intervening block without a floor detour', () => {
    const start = { x: 150, y: 100, z: 30 }, end = { x: 950, y: 100, z: 30 };
    const obstacle = { x: 300, y: 60, width: 450, height: 100, z: 45 };
    const points = spatialBridgeRoute(start, end, [obstacle], 2);
    expect(points[0]).toEqual(start); expect(points.at(-1)).toEqual(end);
    const above = points.filter(p => p.x >= obstacle.x && p.x <= obstacle.x + obstacle.width);
    expect(above.length).toBeGreaterThan(5);
    expect(above.every(p => p.z > obstacle.z + 20)).toBe(true);
    expect(points).toEqual(spatialBridgeRoute(start, end, [obstacle], 2));
  });

  it('uses different elevated lanes and keeps them stable through pan and zoom', () => {
    const start={x:0,y:0,z:30}, end={x:900,y:400,z:30};
    const a=spatialBridgeRoute(start,end,[],1), b=spatialBridgeRoute(start,end,[],2);
    expect(a[16]!.z).not.toBe(b[16]!.z);
    const crossings = [{ id: 'a', start:{x:0,y:0}, end:{x:100,y:100}}, {id:'b',start:{x:0,y:100},end:{x:100,y:0}}];
    const lanes = assignSpatialBridgeLanes(crossings);
    expect(lanes.get('a')).not.toBe(lanes.get('b'));
    expect(assignSpatialBridgeLanes([...crossings].reverse())).toEqual(lanes);
    const camera=spatialCameraModel({x:10,y:20,scale:.2},1000,600);
    const projected=a.map(p=>projectSpatialPoint(p,camera));
    expect(projected.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))).toBe(true);
    expect(a[0]).toEqual(start); expect(a.at(-1)).toEqual(end);
  });

  it('leaves a bottom port outward on screen while rising over the floor', () => {
    const start={x:75,y:36,z:30},end={x:75,y:900,z:30};
    const points=spatialBridgeRoute(start,end,[],0,{x:0,y:1},{x:0,y:-1});
    const camera=spatialCameraModel({x:0,y:0,scale:1},1000,600);
    const port=projectSpatialPoint(start,camera),stem=projectSpatialPoint(points[4]!,camera);
    expect(stem.y).toBeGreaterThan(port.y);
    expect(points[4]!.z).toBeGreaterThan(start.z);
    expect(points).toHaveLength(65);
  });

  it('has smooth projected tangents and a visible elevated arch', () => {
    const start = {x:0,y:0,z:30}, end = {x:800,y:0,z:30};
    const points = spatialBridgeRoute(start,end,[],0,{x:1,y:0},{x:-1,y:0});
    const camera = spatialCameraModel({x:0,y:0,scale:1},1000,600);
    const projected = points.map(point => projectSpatialPoint(point,camera));
    const midpoint = projected[32]!;
    expect(midpoint.y).toBeLessThan(projected[0]!.y - 25);
    const angles = projected.slice(1).map((point,i) => Math.atan2(point.y-projected[i]!.y,point.x-projected[i]!.x));
    for(let i=1;i<angles.length;i++) expect(Math.abs(angles[i]!-angles[i-1]!)).toBeLessThan(.2);
    expect(Math.abs(angles[0]!)).toBeLessThan(.12);
    expect(Math.abs(angles.at(-1)!)).toBeLessThan(.12);
  });

  it('retains a visible segment with one or both endpoints outside the viewport', () => {
    expect(spatialPathIntersectsViewport([{x:100,y:50},{x:3000,y:50}],1000,600)).toBe(true);
    expect(spatialPathIntersectsViewport([{x:-500,y:50},{x:3000,y:50}],1000,600)).toBe(true);
    expect(spatialPathIntersectsViewport([{x:50,y:-500},{x:50,y:3000}],1000,600)).toBe(true);
    expect(spatialPathIntersectsViewport([{x:-500,y:-10},{x:3000,y:-10}],1000,600)).toBe(false);
    expect(spatialPathIntersectsViewport([{x:-100,y:0},{x:0,y:-100}],1000,600)).toBe(false);
    expect(spatialPathIntersectsViewport([],1000,600)).toBe(false);
  });
});
