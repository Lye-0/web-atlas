// @vitest-environment node
import {expect,it} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {separateSimpleShelves} from './architectureSimpleShelfBounds';
import {simpleCorrespondencePeers,simpleResourceEndpoints} from './architectureSimpleAnnotations';
import {architectureSimpleOverview} from './architectureSimple';
import {architectureContentChoices,architectureContentRange} from './architectureContent';
import {architectureScopeGraph,prepareArchitectureScope} from './architectureProjection';
import {semanticFlowRegions} from './flowRegions';
import {architectureBoundaryHeadings} from './architectureHeadings';
import {layoutSemanticFlow} from './flowPresentation';
import type {SemanticGraph,SemanticNode,SemanticEdge} from './types';
const node=(id:string,region:string,placement:string):SemanticNode=>({id,label:id,kind:'subsystem',group:'test',confidence:'source',evidence:[],attributes:{simpleOverview:true,simpleRegionId:region,simpleRegionLabel:region,simplePlacement:placement},architecture:{kind:placement==='shared'?'shared-code':'application',entryPaths:[],roles:[],environments:[],context:[],memberIds:[],files:[],technologyNames:[],auxiliary:false}});
const rects=(graph:SemanticGraph)=>{const positions=layoutSemanticFlow(graph,'2d'),regions=semanticFlowRegions(positions,'2d'),headers=new Map(architectureBoundaryHeadings(regions,positions).map(h=>[h.id,h]));return regions.map(r=>({...r,x:r.x-12,y:headers.get(r.id)!.borderTop,width:r.width+24,height:r.y+r.height+20-headers.get(r.id)!.borderTop}));};
const overlap=(a:{x:number;y:number;width:number;height:number},b:typeof a)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
it.each(['arbitrary','名前・長い環境名を変更'])('locally clears final headers and carries nearby shared code: %s',prefix=>{
 const nodes=[node('op','branch:'+prefix,'route'),node('arrival','branch:'+prefix,'route'),node('user','shelf:no-route','no-route'),node('other','shelf:no-route','no-route'),node('shared','','shared'),node('context','shelf:context','context'),node('context2','shelf:context','context')];
 const points=new Map(nodes.map((n,i)=>[n.id,{x:i===0?350:i===1?700:i===3?350:i===4?0:700,y:i<2?100:i===4?200:i<4?340:520,z:0}]));const edges=[{id:'use',source:'user',target:'shared',kind:'simple-reference',label:'uses',confidence:'source',evidence:[],views:['architecture-map']} as SemanticEdge],graph:SemanticGraph={view:'architecture-map',nodes,edges};
 const original=JSON.stringify(graph),distance=points.get('user')!.y-points.get('shared')!.y;separateSimpleShelves(graph,points);
 expect(points.get('op')!.y).toBe(100);expect(points.get('arrival')!.y).toBe(100);expect(points.get('user')!.y-points.get('shared')!.y).toBeGreaterThanOrEqual(distance);expect(points.get('user')!.y-points.get('shared')!.y).toBeLessThanOrEqual(280);expect(JSON.stringify(graph)).toBe(original);
 const positions=nodes.map(n=>({node:n,...points.get(n.id)!})),regions=semanticFlowRegions(positions,'2d'),headers=architectureBoundaryHeadings(regions,positions),rs=regions.map(r=>({...r,y:headers.find(h=>h.id===r.id)!.borderTop,height:r.y+r.height+20-headers.find(h=>h.id===r.id)!.borderTop}));
 for(let i=0;i<rs.length;i++)for(let j=i+1;j<rs.length;j++)expect(overlap(rs[i]!,rs[j]!)).toBe(false);
 const stable=JSON.stringify([...points]);separateSimpleShelves(graph,points);expect(JSON.stringify([...points])).toBe(stable);
});
it('leaves non-simple parent/child layout unchanged',()=>{
 const nodes=[node('parent','parent','route'),node('child','child','route')];nodes.forEach(n=>{n.attributes={};});const points=new Map(nodes.map(n=>[n.id,{x:0,y:0,z:0}])),before=JSON.stringify([...points]);separateSimpleShelves({view:'architecture-map',nodes,edges:[]},points);expect(JSON.stringify([...points])).toBe(before);
});
it('groups by original target ID while retaining directions, uncertainty and all evidence',()=>{
 const a=node('a','','route'),b=node('b','','route'),c=node('c','','route');b.label=c.label='same';const nodes=new Map([a,b,c].map(n=>[n.id,n]));
 const edge=(id:string,source:string,target:string,kind:string,confidence:SemanticEdge['confidence']='source'):SemanticEdge=>({id,source,target,kind,label:kind,confidence,views:['architecture-map'],evidence:[{path:'config',line:2,endLine:2,start:1,end:4,description:id}],details:{environment:'same',conditional:true}});
 const edges=[edge('one','a','b','flow-definition'),edge('two','a','b','flow-configures','inferred'),edge('three','c','a','flow-serves')],before=JSON.stringify(edges),peers=simpleCorrespondencePeers(edges,new Set(['a']),nodes);
 expect(peers.map(p=>p.id)).toEqual(['b','c']);expect(peers[0]!.edges).toEqual(edges.slice(0,2));expect(peers[0]!.labels).toHaveLength(2);expect(peers[1]!.labels).toEqual(['配信する構成']);expect(JSON.stringify(edges)).toBe(before);
});
it.skipIf(!process.env.SHELF_REVIEW)('compares three saved inputs, source identity, routes, resources and rendered bounds',async()=>{
 const old=await import(/* @vite-ignore */resolve('.cache/boundary-review/baseline-src/src/analyzer/semantic/architectureSimple.ts')),oldProjection=await import(/* @vite-ignore */resolve('.cache/boundary-review/baseline-src/src/analyzer/semantic/architectureProjection.ts')),oldContent=await import(/* @vite-ignore */resolve('.cache/boundary-review/baseline-src/src/analyzer/semantic/architectureContent.ts')),reports=[];
 for(const project of ['vehicle-management','git-lines','web-atlas']){
  const model:SemanticGraph=JSON.parse(readFileSync(`.cache/simple-polish/${project}.model.json`,'utf8')),json=JSON.stringify(model),t=performance.now(),before=old.architectureSimpleOverview(oldProjection.prepareArchitectureScope(model,undefined,'',true)),oldMs=performance.now()-t,t2=performance.now(),base=prepareArchitectureScope(model,undefined,'',true),after=architectureSimpleOverview(base),newMs=performance.now()-t2;
  expect(JSON.stringify(model)).toBe(json);expect(after.graph.nodes.map(n=>n.id)).toEqual(before.graph.nodes.map((n:SemanticNode)=>n.id));expect(after.graph.edges).toEqual(before.graph.edges);expect(after.referenceEdges).toEqual(before.referenceEdges);expect([...after.owners]).toEqual([...before.owners]);expect([...after.relations]).toEqual([...before.relations]);expect(architectureSimpleOverview(base)).toBe(after);
  for(const choice of architectureContentChoices(model).filter(c=>c.id!=='simple-overview'))expect(architectureScopeGraph(architectureContentRange(model,choice.id)?.graph??model)).toEqual(oldProjection.architectureScopeGraph(oldContent.architectureContentRange(model,choice.id)?.graph??model));
  const moved=after.graph.nodes.filter(n=>JSON.stringify(after.graph.architectureView!.positions2d!.get(n.id))!==JSON.stringify(before.graph.architectureView!.positions2d.get(n.id)));
  expect(moved.every(n=>['shared','no-route','context'].includes(String(n.attributes.simplePlacement)))).toBe(true);
  const regions=rects(after.graph);for(const region of regions)for(const n of after.graph.nodes.filter(n=>n.attributes.simplePlacement==='shared')){const p=after.graph.architectureView!.positions2d!.get(n.id)!;expect(overlap(region,{x:p.x-124,y:p.y-62,width:248,height:124})).toBe(false);}const collisions=regions.flatMap((a,i)=>regions.slice(i+1).filter(b=>overlap(a,b)).map(b=>[a.label,b.label]));expect(collisions).toEqual([]);
  const endpoints=after.graph.edges.map(e=>({kind:e.kind,source:after.graph.nodes.find(n=>n.id===e.source)?.label,targets:simpleResourceEndpoints(after,e).flatMap(r=>r.labels)})).filter(e=>e.targets.length);
  reports.push({project,oldMs,newMs,moved:moved.map(n=>({label:n.label,before:before.graph.architectureView.positions2d.get(n.id),after:after.graph.architectureView!.positions2d!.get(n.id)})),before:rects(before.graph),after:regions,resources:endpoints});
 }
 writeFileSync('.cache/boundary-review/results.json',JSON.stringify(reports,null,2));
},120000);
