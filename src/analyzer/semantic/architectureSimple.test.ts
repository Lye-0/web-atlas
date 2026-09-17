// @vitest-environment node
import {it,expect} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import {architectureSimpleOverview} from './architectureSimple';
import {prepareArchitectureScope,architectureScopeGraph} from './architectureProjection';
import type {SemanticGraph,SemanticNode,SemanticEdge} from './types';
const node=(id:string,kind:NonNullable<SemanticNode['architecture']>['kind']='application',parentId?:string):SemanticNode=>({id,label:'same',kind:'subsystem',group:'test',confidence:'source',evidence:[],attributes:{},architecture:{kind,parentId,entryPaths:[],roles:[],environments:[],context:[],memberIds:[],files:[],technologyNames:[],auxiliary:false}});
const edge=(id:string,source:string,target:string,kind='http-request'):SemanticEdge=>({id,source,target,kind,label:kind,views:['architecture-map'],confidence:'source',evidence:[]});
it('keeps distinct same-named entities and conserves every member and relation without new reachability',()=>{
 const a=node('a'),b=node('b'),c=node('c','component','a'),db1=node('db1','resource'),db2=node('db2','resource'),config=node('config','execution-config');config.attributes.logicalOwnerId='a';config.architecture!.environments=['任意環境'];
 const model:SemanticGraph={view:'architecture-map',nodes:[a,b,c,db1,db2,config],edges:[edge('one','c','db1'),edge('two','config','db2'),edge('cycle','db2','config'),edge('internal','a','c')]};
 const before=JSON.stringify(model),base=prepareArchitectureScope(model),simple=architectureSimpleOverview(base);
 expect(simple.owners.get('a')).not.toBe(simple.owners.get('b'));expect(simple.owners.get('db1')).not.toBe(simple.owners.get('db2'));expect(simple.owners.get('a')).toBe(simple.owners.get('config'));expect(simple.owners.get('c')).toBe(simple.owners.get('a'));
 expect([...simple.units.values()].flatMap(u=>u.members).sort()).toEqual(model.nodes.map(n=>n.id).sort());
 expect([...simple.relations.values()].flatMap(r=>r.edgeIds).concat([...simple.units.values()].flatMap(u=>u.internalEdges)).sort()).toEqual(model.edges.map(e=>e.id).sort());
 expect(architectureSimpleOverview(base)).toBe(simple);expect(JSON.stringify(model)).toBe(before);
});
it('groups equivalent tools but preserves distinct purposes, targets, owners and environments',()=>{
 const tools=['one','two','other-purpose','other-owner','other-env','other-output'].map(id=>({...node(id,'tool-operation'),attributes:{dictionaryStackId:'tool',purpose:id==='other-purpose'?'deploy':'build',ownerPath:id==='other-owner'?'b':'a',targetPlace:'unconfirmed'}}));tools[4]!.architecture!.environments=['staging'];
 const model:SemanticGraph={view:'architecture-map',nodes:[...tools,node('output','artifact'),node('other','artifact')],edges:tools.map(n=>edge(n.id,n.id,n.id==='other-output'?'other':'output','flow-generates'))};const simple=architectureSimpleOverview(prepareArchitectureScope(model));
 expect(simple.owners.get('one')).toBe(simple.owners.get('two'));for(const id of tools.slice(2).map(n=>n.id))expect(simple.owners.get(id)).not.toBe(simple.owners.get('one'));
});
it('retains isolated applications and incomplete operations without inventing services',()=>{
 const model:SemanticGraph={view:'architecture-map',nodes:[node('only')],edges:[]};const simple=architectureSimpleOverview(prepareArchitectureScope(model));expect(simple.graph.nodes).toHaveLength(1);expect(simple.graph.edges).toHaveLength(0);
 const script=node('unowned-script','tool-operation');script.attributes.purpose='script';const incomplete=architectureSimpleOverview(prepareArchitectureScope({...model,nodes:[...model.nodes,script]}));expect(incomplete.owners.get(script.id)).not.toBe(incomplete.owners.get('only'));expect(incomplete.graph.edges).toHaveLength(0);
});
it('keeps real scopes and environment distinctions while making unknown ownership inspectable',()=>{
 const app=node('app'),child=node('child','component','app'),outside=node('outside'),unknown=node('unknown','code-definition');
 const shared=node('shared','resource'),defaultNode=node('default','resource');shared.architecture!.environments=['staging-東','production'];defaultNode.architecture!.environments=['default'];
 const model:SemanticGraph={view:'architecture-map',nodes:[app,child,outside,unknown,shared,defaultNode],edges:[edge('peer','child','outside')]};
 const simple=architectureSimpleOverview(prepareArchitectureScope(model,'app'),false);
 expect(simple.graph.architectureView?.scopeId).toBe('app');expect(simple.graph.nodes.some(n=>simple.units.get(n.id)?.anchorId==='child')).toBe(true);expect(simple.graph.nodes.some(n=>simple.units.get(n.id)?.anchorId==='outside')).toBe(true);
 expect(simple.owners.has('unknown')).toBe(true);expect(simple.owners.get('shared')).not.toBe(simple.owners.get('default'));expect(shared.architecture!.environments).toEqual(['staging-東','production']);
});
it.skipIf(!process.env.SIMPLE_REVIEW)('reports actual summary conservation and warm response for three snapshots',()=>{
 const reports=[];
 for(const project of ['vehicle-management','git-lines','web-atlas']){
  const model:SemanticGraph=JSON.parse(readFileSync(`.cache/simple-overview/${project}-model.json`,'utf8')),before=JSON.stringify(model),base=prepareArchitectureScope(model,undefined,'',true);
  const start=performance.now(),simple=architectureSimpleOverview(base),cold=performance.now()-start;const warm=performance.now();for(let i=0;i<100;i++)architectureSimpleOverview(base);const warmMs=performance.now()-warm;
  expect([...simple.owners.keys()].sort()).toEqual(base.allowed.map(n=>n.id).sort());
  const valid=new Set(base.allowed.map(n=>n.id)),expected=model.edges.filter(e=>valid.has(e.source)&&valid.has(e.target)).map(e=>e.id).sort();
  expect([...simple.relations.values()].flatMap(r=>r.edgeIds).concat([...simple.units.values()].flatMap(u=>u.internalEdges)).sort()).toEqual(expected);
  expect(JSON.stringify(model)).toBe(before);
  const detailed=architectureScopeGraph(model,undefined,'',true),fullStart=performance.now();for(let i=0;i<100;i++)architectureScopeGraph(model,undefined,'',true);const fullWarmMs=performance.now()-fullStart;
  reports.push({project,originalNodes:model.nodes.length,originalEdges:model.edges.length,detailedNodes:detailed.nodes.length,detailedEdges:detailed.edges.length,allowed:base.allowed.length,nodes:simple.graph.nodes.length,edges:simple.graph.edges.length,coldMs:cold,warm100Ms:warmMs,fullWarm100Ms:fullWarmMs,units:[...simple.units.values()].map(u=>({...u,label:simple.graph.nodes.find(n=>n.id===u.id)?.label})),relations:[...simple.relations],display:simple.graph});
 }
 writeFileSync('.cache/simple-overview/summary-report.json',JSON.stringify(reports,(_key,value)=>value instanceof Map?[...value]:value,2));
});
