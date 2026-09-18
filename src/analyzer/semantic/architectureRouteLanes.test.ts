// @vitest-environment node
import {expect,it} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {architectureSimpleOverview} from './architectureSimple';
import {prepareArchitectureScope} from './architectureProjection';
import {semanticFlowRegions} from './flowRegions';
import {architectureBoundaryHeadings} from './architectureHeadings';
import type {SemanticGraph,SemanticNode,SemanticEdge} from './types';
const node=(id:string,kind:NonNullable<SemanticNode['architecture']>['kind']='application'):SemanticNode=>({id,label:id,kind:'subsystem',group:'fixture',confidence:'source',attributes:{},evidence:[],architecture:{kind,entryPaths:[],roles:[],environments:[],context:[],memberIds:[],files:[],technologyNames:[],auxiliary:false}});
const edge=(id:string,source:string,target:string,kind='flow-input'):SemanticEdge=>({id,source,target,kind,label:kind,confidence:'source',evidence:[],views:['architecture-map']});
const tool=(id:string,purpose:string,environment:string)=>({...node(id,'tool-operation'),label:'Same tool',attributes:{purpose,configurationPath:'settings',dictionaryStackId:'generic'},architecture:{...node(id).architecture!,kind:'tool-operation' as const,environments:[environment]}});
it.each(['preview','任意の環境'])('keeps each branch and its destination in one row: %s',environment=>{
 const source=node('source'),uses=[tool('start','start',environment),tool('default','deploy','default'),tool('publish','deploy','arbitrary-release')],destinations=uses.map(n=>node(`${n.id}-target`,'execution-config'));
 const graph:SemanticGraph={view:'architecture-map',nodes:[source,...uses,...destinations],edges:uses.flatMap((n,i)=>[edge(n.id,source.id,n.id),edge(`${n.id}-out`,n.id,destinations[i]!.id,n.attributes.purpose==='start'?'flow-starts':'flow-deploys')])};
 const simple=architectureSimpleOverview(prepareArchitectureScope(graph)),point=(id:string)=>simple.graph.architectureView!.positions2d!.get(simple.owners.get(id)!)!;
 for(const n of uses){expect(point(n.id).y).toBe(point(`${n.id}-target`).y);expect(point(`${n.id}-target`).x-point(n.id).x).toBe(350);}
 expect(new Set(uses.map(n=>point(n.id).y)).size).toBe(3);expect(Math.max(...uses.map(n=>point(n.id).y))-Math.min(...uses.map(n=>point(n.id).y))).toBe(336);
 expect(simple.graph.nodes.filter(n=>n.attributes.simpleBranchLabel).every(n=>String(n.attributes.simpleBranchLabel).includes(' / '))).toBe(true);
 const positions=simple.graph.nodes.map(n=>({node:n,...simple.graph.architectureView!.positions2d!.get(n.id)!})),regions=semanticFlowRegions(positions,'2d'),headings=architectureBoundaryHeadings(regions,positions);
 for(const h of headings){const r=regions.find(r=>r.id===h.id)!;expect(h.top).toBeGreaterThanOrEqual(r.y-50);}
});
it('keeps shared publication and its arrival together, with both inputs and no copies',()=>{
 const a=node('a'),b=node('b'),shared=tool('shared','deploy','release'),target=node('target','execution-config'),build=tool('build','build','release'),artifact=node('dist','artifact');
 const graph:SemanticGraph={view:'architecture-map',nodes:[a,b,shared,target,build,artifact],edges:[edge('a','a','shared'),edge('b','b','build'),edge('dist','build','dist','flow-generates'),edge('input','dist','shared'),edge('out','shared','target','flow-deploys')]};
 const simple=architectureSimpleOverview(prepareArchitectureScope(graph)),point=(id:string)=>simple.graph.architectureView!.positions2d!.get(simple.owners.get(id)!)!,operation=simple.graph.nodes.find(n=>n.id===simple.owners.get('shared'))!;
 expect(point('shared').y).toBe(point('target').y);expect(operation.attributes.simpleSourceIds).toHaveLength(2);expect(operation.attributes.simplePlacement).toBe('shared-route');expect(simple.graph.nodes.filter(n=>n.id===simple.owners.get('target'))).toHaveLength(1);
 expect(point('shared').y).toBeGreaterThanOrEqual(Math.min(point('a').y,point('b').y));expect(point('shared').y).toBeLessThanOrEqual(Math.max(point('a').y,point('b').y));
});
it('packs many independent no-route actors while preserving identity, and groups references by direction',()=>{
 const actors=Array.from({length:18},(_,i)=>node(`actor-${i}`)),library=node('shared','shared-code');
 const graph:SemanticGraph={view:'architecture-map',nodes:[...actors,library],edges:[edge('one',actors[0]!.id,library.id,'code-reference'),edge('two',actors[0]!.id,library.id,'declaration-dependency'),edge('opposite',library.id,actors[0]!.id,'code-reference')]};
 const before=JSON.stringify(graph),simple=architectureSimpleOverview(prepareArchitectureScope(graph)),points=actors.map(n=>simple.graph.architectureView!.positions2d!.get(simple.owners.get(n.id)!)!);
 expect(new Set(points.map(p=>p.x)).size).toBeGreaterThan(1);expect(Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y))).toBeLessThan(900);expect(simple.owners.size).toBe(19);expect(simple.graph.edges).toHaveLength(2);expect([...simple.relations.values()].flatMap(r=>r.edgeIds).sort()).toEqual(['one','opposite','two']);expect(JSON.stringify(graph)).toBe(before);
});
it('keeps external startup targets after their operation, without fabricating a source',()=>{
 const op=tool('op','start','unknown'),a=node('service-a','external-service'),b=node('service-b','external-service');b.architecture!.parentId=a.id;
 const graph:SemanticGraph={view:'architecture-map',nodes:[op,a,b],edges:[edge('a','op','service-a','flow-starts'),edge('b','op','service-b','flow-starts')]},simple=architectureSimpleOverview(prepareArchitectureScope(graph)),point=(id:string)=>simple.graph.architectureView!.positions2d!.get(simple.owners.get(id)!)!;
 for(const target of [a,b]){expect(point(target.id).x).toBeGreaterThan(point('op').x);const display=simple.graph.nodes.find(n=>n.id===simple.owners.get(target.id))!;expect(display.attributes.simpleStage).toBe('arrival');expect(display.attributes.simpleRole).toBe('primary');expect(display.architecture?.kind).toBe('external-service');}
 expect(simple.graph.nodes.some(n=>n.attributes.simpleStage==='source')).toBe(false);expect(Math.abs(point(a.id).y-point(b.id).y)).toBe(168);
});
it('groups equivalent aliases but exposes different arguments in canvas and peer names',()=>{
 const source=node('source'),a=tool('a','serve','preview'),alias=tool('alias','serve','preview'),b={...tool('b','serve','preview'),attributes:{...a.attributes,usageArguments:'--host localhost'}},target=node('target','execution-config');
 const graph:SemanticGraph={view:'architecture-map',nodes:[source,a,alias,b,target],edges:[...[a,alias,b].flatMap(n=>[edge(n.id,'source',n.id),edge(`${n.id}-out`,n.id,'target','flow-starts')]),edge('repeat-evidence','source','alias')]},simple=architectureSimpleOverview(prepareArchitectureScope(graph));
 expect(simple.owners.get('a')).toBe(simple.owners.get('alias'));expect(simple.owners.get('a')).not.toBe(simple.owners.get('b'));const names=simple.graph.nodes.filter(n=>n.architecture?.kind==='tool-operation').map(n=>n.label);expect(names.some(n=>n.includes('--host localhost'))).toBe(true);expect(names.some(n=>n.includes('追加引数なし'))).toBe(true);
});
it.skipIf(!process.env.ROUTE_LANES)('compares three saved inputs with the start-of-task version',async()=>{
 const oldProjection=await import(/* @vite-ignore */ resolve('.cache/route-lanes/baseline-src/src/analyzer/semantic/architectureProjection.ts')),oldSimple=await import(/* @vite-ignore */ resolve('.cache/route-lanes/baseline-src/src/analyzer/semantic/architectureSimple.ts')),reports=[];
 for(const project of ['vehicle-management','git-lines','web-atlas']){
  const model:SemanticGraph=JSON.parse(readFileSync(`.cache/simple-polish/${project}.model.json`,'utf8')),before=JSON.stringify(model),base=prepareArchitectureScope(model,undefined,'',true),start=performance.now(),simple=architectureSimpleOverview(base),coldMs=performance.now()-start;
  expect(JSON.stringify(model)).toBe(before);expect([...simple.owners.keys()].sort()).toEqual(base.allowed.map(n=>n.id).sort());expect([...new Set([...simple.units.values()].flatMap(u=>u.internalEdges).concat([...simple.relations.values()].flatMap(r=>r.edgeIds)))].sort()).toEqual(model.edges.map(e=>e.id).sort());
  const warm=performance.now();for(let i=0;i<100;i++)expect(architectureSimpleOverview(base)).toBe(simple);const warm100Ms=performance.now()-warm,oldBase=oldProjection.prepareArchitectureScope(model,undefined,'',true),oldStart=performance.now(),old=oldSimple.architectureSimpleOverview(oldBase),oldMs=performance.now()-oldStart;
  const height=(g:SemanticGraph)=>{const ys=[...g.architectureView!.positions2d!.values()].map(p=>p.y);return Math.max(...ys)-Math.min(...ys);};
  reports.push({project,coldMs,oldMs,warm100Ms,beforeNodes:old.graph.nodes.length,nodes:simple.graph.nodes.length,beforeEdges:old.graph.edges.length,edges:simple.graph.edges.length,beforeHeight:height(old.graph),height:height(simple.graph),nodesInfo:simple.graph.nodes.map(n=>({id:n.id,label:n.label,kind:n.architecture?.kind,stage:n.attributes.simpleStage,placement:n.attributes.simplePlacement,sources:n.attributes.simpleSourceIds,position:simple.graph.architectureView!.positions2d!.get(n.id)}))});
 }
 writeFileSync('.cache/route-lanes/results.json',JSON.stringify(reports,null,2));
},120000);
