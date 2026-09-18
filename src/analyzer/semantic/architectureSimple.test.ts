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
it('keeps auxiliary internal code and requests inside their actual app',()=>{
 const app=node('app'),child=node('test-component','component','app'),request=node('request','unresolved');child.architecture!.auxiliary=true;request.architecture!.auxiliary=true;request.architecture!.request={kind:'http',sourceId:'fixture-request',ownerId:'test-component',expression:'fetch(path)'};
 const model:SemanticGraph={view:'architecture-map',nodes:[app,child,request],edges:[edge('internal','app','test-component','code-reference'),edge('request-edge','test-component','request')]};
 const simple=architectureSimpleOverview(prepareArchitectureScope(model,undefined,'',true));expect(new Set(simple.owners.values()).size).toBe(1);expect(simple.graph.edges).toHaveLength(0);expect([...simple.units.values()][0]!.internalEdges).toEqual(['internal','request-edge']);
});
it('combines development and build by resolved app, retaining separate apps and publication settings',()=>{
 const a=node('app'),b=node('other'),code=node('code','code-definition'),otherCode=node('other-code','code-definition');code.attributes.logicalOwnerId='app';otherCode.attributes.logicalOwnerId='other';
 const serve=node('serve','tool-operation'),build=node('build','tool-operation'),other=node('other-build','tool-operation');for(const n of [serve,build,other])n.attributes={purpose:n===serve?'serve':'build',dictionaryStackId:'generic',configurationPath:'config.ts'};
 const graph:SemanticGraph={view:'architecture-map',nodes:[a,b,code,otherCode,serve,build,other],edges:[edge('i1','code','serve','flow-input'),edge('i2','code','build','flow-input'),edge('i3','other-code','other-build','flow-input')]};const simple=architectureSimpleOverview(prepareArchitectureScope(graph));
 expect(simple.owners.get('serve')).toBe(simple.owners.get('build'));expect(simple.owners.get('build')).not.toBe(simple.owners.get('other-build'));expect(simple.graph.nodes.find(n=>n.id===simple.owners.get('serve'))?.label).toContain('開発・ビルド');
});
it('records a real artifact path while leaving ambiguous producers explicit',()=>{
 const app=node('app'),build=node('build','tool-operation'),deploy=node('deploy','tool-operation'),artifact=node('artifact','artifact');build.attributes={purpose:'build',dictionaryStackId:'builder'};deploy.attributes={purpose:'deploy',dictionaryStackId:'publisher'};
 const graph:SemanticGraph={view:'architecture-map',nodes:[app,build,deploy,artifact],edges:[edge('generate','build','artifact','flow-generates'),edge('input','artifact','deploy','flow-input'),edge('target','deploy','app','flow-deploys')]};
 const simple=architectureSimpleOverview(prepareArchitectureScope(graph)),path=[...simple.relations.values()].find(r=>r.kind==='path')!;expect(path.paths).toEqual([{edgeIds:['generate','input'],nodeIds:['build','artifact','deploy']}]);expect(simple.owners.get('artifact')).toBe(simple.owners.get('build'));
 const ambiguous=architectureSimpleOverview(prepareArchitectureScope({...graph,edges:[...graph.edges,edge('other-generate','app','artifact','flow-generates')]}));expect(ambiguous.owners.get('artifact')).not.toBe(ambiguous.owners.get('build'));expect([...ambiguous.relations.values()].some(r=>r.paths)).toBe(false);
});
it('keeps distinct artifact destinations even for the same application and tool',()=>{
 const app=node('renamed-app'),code=node('input','code-definition');code.attributes.logicalOwnerId=app.id;
 const builds=['first','second'].map(id=>({...node(id,'tool-operation'),attributes:{purpose:'build',dictionaryStackId:'compiler',configurationPath:'custom/build.ts'}}));
 const artifacts=['alpha','beta'].map(id=>({...node(id,'artifact'),attributes:{artifactPath:`output/${id}`}}));
 const graph:SemanticGraph={view:'architecture-map',nodes:[app,code,...builds,...artifacts],edges:builds.flatMap((n,i)=>[edge(`input-${i}`,code.id,n.id,'flow-input'),edge(`output-${i}`,n.id,artifacts[i]!.id,'flow-generates')])};
 const simple=architectureSimpleOverview(prepareArchitectureScope(graph));expect(simple.owners.get('first')).not.toBe(simple.owners.get('second'));
});
it('does not combine opposite script conditions and retains mixed environments without an unsupported subject region',()=>{
 const app=node('subject'),a=node('east','execution-config'),b=node('west','execution-config');for(const n of [a,b])n.attributes.logicalOwnerId=app.id;a.architecture!.environments=['preview-東'];b.architecture!.environments=['release-西'];
 const other=node('peer'),ok={...edge('success',app.id,other.id,'flow-precedes'),label:'成功時に続く記述',details:{conditional:true}},fail={...edge('failure',app.id,other.id,'flow-precedes'),label:'失敗時に続く記述',details:{conditional:true}};
 const simple=architectureSimpleOverview(prepareArchitectureScope({view:'architecture-map',nodes:[app,a,b,other],edges:[ok,fail]})),subject=simple.graph.nodes.find(n=>n.id===simple.owners.get(app.id))!;
 expect(simple.graph.edges).toHaveLength(2);expect(subject.attributes.simpleEnvironmentLabel).toContain('preview-東');expect(subject.attributes.simpleEnvironmentLabel).toContain('release-西');expect(subject.attributes.simpleRegionId).toBe('');
});
it('preserves evidence and branching stages when an artifact feeds two operations',()=>{
 const build=node('build','tool-operation'),artifact=node('bundle','artifact'),a=node('publish-a','tool-operation'),b=node('publish-b','tool-operation');build.attributes.purpose='build';a.attributes.purpose='deploy';b.attributes.purpose='deploy';
 const evidence=(line:number)=>({path:'renamed/scripts.json',line,endLine:line,start:line,end:line+1,description:'source'});
 const graph:SemanticGraph={view:'architecture-map',nodes:[build,artifact,a,b],edges:[{...edge('gen',build.id,artifact.id,'flow-generates'),evidence:[evidence(3)]},{...edge('use-a',artifact.id,a.id,'flow-input'),evidence:[evidence(4)]},{...edge('use-b',artifact.id,b.id,'flow-input'),evidence:[evidence(5)]}]};
 const simple=architectureSimpleOverview(prepareArchitectureScope(graph)),paths=[...simple.relations.values()].flatMap(r=>r.paths??[]);
 expect(paths.map(p=>p.nodeIds)).toEqual([[build.id,artifact.id,a.id],[build.id,artifact.id,b.id]]);expect(simple.graph.edges.map(e=>e.evidence.map(v=>v.line))).toEqual([[3,4],[3,5]]);
});
it.skipIf(!process.env.SIMPLE_REVIEW)('reports actual summary conservation and warm response for three snapshots',()=>{
 const reports=[];
 for(const project of ['vehicle-management','git-lines','web-atlas']){
  const model:SemanticGraph=JSON.parse(readFileSync(`.cache/simple-overview/${project}-model.json`,'utf8')),before=JSON.stringify(model),base=prepareArchitectureScope(model,undefined,'',true);
  const start=performance.now(),simple=architectureSimpleOverview(base),cold=performance.now()-start;const warm=performance.now();for(let i=0;i<100;i++)architectureSimpleOverview(base);const warmMs=performance.now()-warm;
  expect([...simple.owners.keys()].sort()).toEqual(base.allowed.map(n=>n.id).sort());
  const valid=new Set(base.allowed.map(n=>n.id)),expected=model.edges.filter(e=>valid.has(e.source)&&valid.has(e.target)).map(e=>e.id).sort();
  expect([...new Set([...simple.relations.values()].flatMap(r=>r.edgeIds).concat([...simple.units.values()].flatMap(u=>u.internalEdges)))].sort()).toEqual(expected);
  expect(JSON.stringify(model)).toBe(before);
  const detailed=architectureScopeGraph(model,undefined,'',true),fullStart=performance.now();for(let i=0;i<100;i++)architectureScopeGraph(model,undefined,'',true);const fullWarmMs=performance.now()-fullStart;
  reports.push({project,originalNodes:model.nodes.length,originalEdges:model.edges.length,detailedNodes:detailed.nodes.length,detailedEdges:detailed.edges.length,allowed:base.allowed.length,nodes:simple.graph.nodes.length,edges:simple.graph.edges.length,coldMs:cold,warm100Ms:warmMs,fullWarm100Ms:fullWarmMs,units:[...simple.units.values()].map(u=>({...u,label:simple.graph.nodes.find(n=>n.id===u.id)?.label})),relations:[...simple.relations],display:simple.graph});
 }
 writeFileSync('.cache/simple-overview/summary-report.json',JSON.stringify(reports,(_key,value)=>value instanceof Map?[...value]:value,2));
});
