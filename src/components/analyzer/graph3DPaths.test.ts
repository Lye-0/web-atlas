import {expect,it} from 'vitest';
import {Graph3DPathCache} from './graph3DPaths';
import {spatialRelationCurve} from '../../analyzer/spatialRelationPath';
it('retains paths across camera-only projections and updates changed world endpoints',()=>{
 const cache=new Graph3DPathCache(),edges=[{id:'e',source:'a',target:'b',color:'#ffffff',intensity:1,animate:true}];
 const points=new Map([['a',{x:0,y:0,z:0}],['b',{x:100,y:60,z:40}]]);
 const first=cache.project(edges,points).get('e')!;
 expect(first.points).toEqual(spatialRelationCurve(points.get('a')!,points.get('b')!,undefined,'3d').points);
 expect(cache.project(edges.map(e=>({...e})),new Map(points)).get('e')).toBe(first);
 points.set('b',{x:200,y:60,z:40});const moved=cache.project(edges,points).get('e')!;expect(moved).not.toBe(first);expect(moved.points.at(-1)).toEqual(points.get('b'));
 cache.project([],points);expect(cache.project(edges,points).get('e')).not.toBe(moved);
});
it('updates hover styles and keeps parallel relations distinct',()=>{
 const cache=new Graph3DPathCache(),points=new Map([['a',{x:0,y:0,z:0}],['b',{x:100,y:0,z:0}]]);
 const edges=['one','two'].map(id=>({id,source:'a',target:'b',color:'#ffffff',intensity:1,animate:true}));
 const first=cache.project(edges,points);expect(first.get('one')!.points).not.toEqual(first.get('two')!.points);
 const next=cache.project(edges.map(e=>({...e,intensity:.18,animate:false})),points);expect(next.get('one')!.intensity).toBe(.18);expect(next.get('one')!.animate).toBe(false);
});
