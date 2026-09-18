// @vitest-environment node
import {expect,it} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {architectureSimpleOverview} from './architectureSimple';
import {prepareArchitectureScope} from './architectureProjection';
import type {SemanticGraph,SemanticNode,SemanticEdge} from './types';
const node=(id:string,kind:NonNullable<SemanticNode['architecture']>['kind']='application'):SemanticNode=>({id,label:id,kind:'subsystem',group:'fixture',confidence:'source',attributes:{},evidence:[],architecture:{kind,entryPaths:[],roles:[],environments:[],context:[],memberIds:[],files:[],technologyNames:[],auxiliary:false}});
const edge=(id:string,source:string,target:string,kind='flow-input'):SemanticEdge=>({id,source,target,kind,label:kind,confidence:'source',evidence:[],views:['architecture-map']});
function fixture(prefix='x',env='review-east'){
 const id=(name:string)=>`${prefix}-${name}`,a=node(id('a')),b=node(id('b')),library=node(id('library'),'shared-code'),schema=node(id('schema'),'code-definition');
 const op=(name:string,purpose:string)=>{const n=node(id(name),'tool-operation');n.label='Fixture engine';n.attributes={purpose,dictionaryStackId:'fixture-engine',configurationPath:`${prefix}/settings`,workingDirectory:prefix};n.architecture!.environments=[env];return n;};
 const serve=op('serve','serve'),alias=op('alias','serve'),build=op('build','build'),start=op('start','start'),publish=op('publish','deploy'),gen=op('gen','generate'),apply=op('apply','apply');
 const arrival=(name:string,place:string)=>{const n=node(id(name),'execution-config');n.attributes={logicalOwnerId:a.id,configurationPath:`${prefix}/settings`,executionPlace:place};n.architecture!.environments=[env];return n;};
 const dev=arrival('dev','server'),local=arrival('local','local'),cloud=arrival('cloud','cloud'),asset=node(id('asset'),'artifact'),sql=node(id('sql'),'artifact'),db=node(id('db'),'resource');
 const edges=[edge('serve',a.id,serve.id),edge('alias',a.id,alias.id),edge('serve-out',serve.id,dev.id,'flow-starts'),edge('alias-out',alias.id,dev.id,'flow-starts'),edge('build',a.id,build.id),edge('asset',build.id,asset.id,'flow-generates'),edge('local-input',asset.id,start.id),edge('local',start.id,local.id,'flow-starts'),edge('publish-assets',asset.id,publish.id),edge('publish-code',b.id,publish.id),edge('publish',publish.id,cloud.id,'flow-deploys'),edge('schema',schema.id,gen.id),edge('sql',gen.id,sql.id,'flow-generates'),edge('apply-input',sql.id,apply.id),edge('apply',apply.id,db.id,'flow-applies'),edge('reference',a.id,library.id,'code-reference'),edge('cycle-reference',library.id,a.id,'code-reference'),edge('runtime',cloud.id,db.id,'data-operation')];
 return {graph:{view:'architecture-map',nodes:[a,b,library,schema,serve,alias,build,start,publish,gen,apply,dev,local,cloud,asset,sql,db],edges} as SemanticGraph,id};
}
it.each([['x','review-east'],['renamed','任意の公開環境']] as const)('aligns sources and keeps real forks/joins after renaming %s', (prefix,env)=>{
 const {graph,id}=fixture(prefix,env),before=JSON.stringify(graph),base=prepareArchitectureScope(graph),simple=architectureSimpleOverview(base),display=(name:string)=>simple.graph.nodes.find(n=>n.id===simple.owners.get(id(name)))!,point=(name:string)=>simple.graph.architectureView!.positions2d!.get(display(name).id)!;
 expect(simple.graph.nodes.filter(n=>n.attributes.simpleStage==='source').map(n=>simple.graph.architectureView!.positions2d!.get(n.id)!.x)).toEqual([0,0,0,0]);
 expect(simple.owners.get(id('serve'))).toBe(simple.owners.get(id('alias')));expect(simple.owners.get(id('serve'))).not.toBe(simple.owners.get(id('build')));expect(simple.owners.get(id('start'))).not.toBe(simple.owners.get(id('publish')));
 expect(point('serve').y).not.toBe(point('build').y);expect(point('asset').x).toBeGreaterThan(point('build').x);expect(point('start').x).toBeGreaterThan(point('asset').x);expect(point('publish').x).toBeGreaterThan(point('asset').x);expect(point('cloud').x).toBeGreaterThan(point('publish').x);
 expect(new Set(display('publish').attributes.simpleSourceIds as string[])).toEqual(new Set([display('a').id,display('b').id]));expect(display('serve').attributes.simpleEnvironmentLabel).toBe(env);expect(display('dev').attributes.simpleStage).toBe('arrival');expect(display('cloud').attributes.simpleStage).toBe('arrival');expect(simple.owners.get(id('dev'))).not.toBe(simple.owners.get(id('a')));
 expect(simple.graph.edges.some(e=>e.source===display('library').id&&e.target===display('a').id)).toBe(true);expect(simple.graph.edges.some(e=>e.source===display('cloud').id&&e.target===display('db').id)).toBe(true);
 const points=[...simple.graph.architectureView!.positions2d!.values()];for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++)expect(Math.abs(points[i]!.x-points[j]!.x)>=300||Math.abs(points[i]!.y-points[j]!.y)>=108).toBe(true);
 expect([...simple.graph.architectureView!.positions!.values()].some(p=>p.z!==0)).toBe(true);expect(architectureSimpleOverview(base)).toBe(simple);expect(JSON.stringify(graph)).toBe(before);
});
it('does not combine a same-named tool with a different input, target condition or arguments',()=>{
 const {graph,id}=fixture(),original=graph.nodes.find(n=>n.id===id('serve'))!,different={...original,id:'different',attributes:{...original.attributes,usageArguments:'--different-condition'}};
 const simple=architectureSimpleOverview(prepareArchitectureScope({...graph,nodes:[...graph.nodes,different],edges:[...graph.edges,edge('different-in',id('a'),'different'),edge('different-out','different',id('dev'),'flow-starts')]}));expect(simple.owners.get('different')).not.toBe(simple.owners.get(id('serve')));
});
it('keeps unknown and cyclic pipelines finite without inventing an origin or destination',()=>{
 const cli=node('isolated-cli'),a=node('op-a','tool-operation'),b=node('op-b','tool-operation');a.attributes.purpose='build';b.attributes.purpose='build';const graph:SemanticGraph={view:'architecture-map',nodes:[cli,a,b],edges:[edge('a','op-a','op-b'),edge('b','op-b','op-a')]};const simple=architectureSimpleOverview(prepareArchitectureScope(graph));
 expect(simple.graph.nodes).toHaveLength(3);expect(simple.graph.edges).toHaveLength(2);expect(simple.graph.nodes.some(n=>n.attributes.simpleStage==='arrival')).toBe(false);for(const n of simple.graph.nodes.filter(n=>n.attributes.simpleStage==='operation'))expect(n.attributes.simpleSourceIds).toEqual([]);for(const p of simple.graph.architectureView!.positions2d!.values())expect([p.x,p.y,p.z].every(Number.isFinite)).toBe(true);
});
it.skipIf(!process.env.SOURCE_BRANCHES)('checks three original inputs, old comparison, alignment and conservation',async()=>{
 const oldProjection=await import(/* @vite-ignore */ resolve('.cache/source-branches/baseline-src/src/analyzer/semantic/architectureProjection.ts')),oldSimple=await import(/* @vite-ignore */ resolve('.cache/source-branches/baseline-src/src/analyzer/semantic/architectureSimple.ts')),reports=[];
 for(const project of ['vehicle-management','git-lines','web-atlas']){
  const model:SemanticGraph=JSON.parse(readFileSync(`.cache/simple-polish/${project}.model.json`,'utf8')),before=createHash('sha256').update(JSON.stringify(model)).digest('hex'),base=prepareArchitectureScope(model,undefined,'',true),start=performance.now(),simple=architectureSimpleOverview(base),coldMs=performance.now()-start;
  expect(createHash('sha256').update(JSON.stringify(model)).digest('hex')).toBe(before);expect([...simple.owners.keys()].sort()).toEqual(base.allowed.map(n=>n.id).sort());expect([...new Set([...simple.units.values()].flatMap(u=>u.internalEdges).concat([...simple.relations.values()].flatMap(r=>r.edgeIds)))].sort()).toEqual(model.edges.map(e=>e.id).sort());
  const sources=simple.graph.nodes.filter(n=>n.attributes.simpleStage==='source');for(const n of sources)expect(simple.graph.architectureView!.positions2d!.get(n.id)!.x).toBe(0);
  const originalNodes=new Map(model.nodes.map(n=>[n.id,n]));for(const e of model.edges.filter(e=>['flow-starts','flow-deploys'].includes(e.kind)&&originalNodes.get(e.target)?.architecture?.kind==='execution-config'))expect(simple.owners.get(e.target)).not.toBe(simple.owners.get(String(originalNodes.get(e.target)!.attributes.logicalOwnerId)));
  const warm=performance.now();for(let i=0;i<100;i++)architectureSimpleOverview(base);const warm100Ms=performance.now()-warm,oldBase=oldProjection.prepareArchitectureScope(model,undefined,'',true),oldStart=performance.now(),old=oldSimple.architectureSimpleOverview(oldBase),oldColdMs=performance.now()-oldStart;
  reports.push({project,originalNodes:model.nodes.length,originalEdges:model.edges.length,beforeNodes:old.graph.nodes.length,beforeEdges:old.graph.edges.length,nodes:simple.graph.nodes.length,edges:simple.graph.edges.length,coldMs,oldColdMs,warm100Ms,display:simple.graph.nodes.map(n=>({id:n.id,label:n.label,stage:n.attributes.simpleStage,environment:n.attributes.simpleEnvironmentLabel,sources:n.attributes.simpleSourceIds,position:simple.graph.architectureView!.positions2d!.get(n.id),memberCount:simple.units.get(n.id)!.members.length}))});
 }
 writeFileSync('.cache/source-branches/results.json',JSON.stringify(reports,null,2));
},120000);
