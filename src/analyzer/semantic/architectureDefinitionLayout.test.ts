import {describe,it,expect} from 'vitest';
import type {SemanticGraph,SemanticNode} from './types';
import {layoutArchitectureDefinitions} from './architectureDefinitionLayout';
import {architectureScopeGraph} from './architectureProjection';
import {layoutSemanticFlow} from './flowPresentation';
const n=(id:string,kind='application'):SemanticNode=>({id,label:'same',kind:'subsystem',group:'',confidence:'source',attributes:{unifiedFlow:true},evidence:[],architecture:{kind:kind as NonNullable<SemanticNode['architecture']>['kind'],environments:[],roles:[],files:[],memberIds:[],entryPaths:[],context:[],technologyNames:[],auxiliary:false}});
const model:SemanticGraph={view:'architecture-map',nodes:[n('app'),n('other'),n('isolated'),n('code','code-definition'),n('dev','execution-config'),n('prod','execution-config'),n('shared','execution-config')],edges:[['app','code','flow-definition'],['code','dev','flow-configures'],['app','dev','flow-definition'],['app','prod','flow-definition'],['app','shared','flow-definition'],['other','shared','flow-definition']].map(([source,target,kind],i)=>({id:`e${i}`,source:source!,target:target!,kind:kind!,label:'same',confidence:'source',evidence:[],views:['architecture-map']}))};
describe('definition preset layout',()=>{
 it('separates units, code and one-to-many configurations without duplication or invented edges',()=>{
  const before=JSON.stringify(model),points=layoutArchitectureDefinitions(model),map=new Map(points.map(p=>[p.node.id,p]));
  expect(map.size).toBe(model.nodes.length);expect(map.get('app')!.x).toBeLessThan(map.get('code')!.x);expect(map.get('code')!.x).toBeLessThan(map.get('dev')!.x);
  expect(map.get('dev')!.x).toBe(map.get('prod')!.x);expect(map.get('dev')!.y).not.toBe(map.get('prod')!.y);expect(map.has('isolated')).toBe(true);expect(points.filter(p=>p.node.id==='shared')).toHaveLength(1);
  expect(JSON.stringify(model)).toBe(before);expect(layoutArchitectureDefinitions({...model,nodes:[...model.nodes].reverse(),edges:[...model.edges].reverse()}).map(p=>[p.node.id,p.x,p.y])).toEqual(points.map(p=>[p.node.id,p.x,p.y]));
 });
 it('changes only flagged 2D layout and reuses coordinates for ordinary selection',()=>{
  const tagged={...model,architectureContentLayout:'logical-definitions' as const};const normal=architectureScopeGraph(model),logical=architectureScopeGraph(tagged),selected=architectureScopeGraph(tagged,undefined,'',false,{selectedNodeId:'app'});
  expect(selected.architectureView!.positions2d).toBe(logical.architectureView!.positions2d);expect(logical.nodes.map(n=>n.id)).toEqual(normal.nodes.map(n=>n.id));expect(logical.edges).toEqual(normal.edges);
  const before3d=architectureScopeGraph(model,undefined,'',false,{mode:'3d'}),after3d=architectureScopeGraph(tagged,undefined,'',false,{mode:'3d'});
  expect(layoutSemanticFlow(after3d,'3d')).toEqual(layoutSemanticFlow(before3d,'3d'));expect(after3d.architectureView!.positions2d).toEqual(before3d.architectureView!.positions2d);
 });
});
