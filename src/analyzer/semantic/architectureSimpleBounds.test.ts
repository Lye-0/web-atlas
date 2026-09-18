// @vitest-environment node
import {expect,it} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import {architectureSimpleOverview} from './architectureSimple';
import {prepareArchitectureScope} from './architectureProjection';
import {semanticFlowRegions} from './flowRegions';
import {layoutSemanticFlow} from './flowPresentation';
import {simpleEvidenceStats,simpleMemberLocations} from './architectureSimpleEvidence';
import {simpleMemberCaption} from './architectureSimpleUsage';
import {simplePeers,simpleRelationOverview,simpleUsageSummary} from './architectureSimpleSummary';
import type {SemanticGraph,SemanticNode,SemanticEdge} from './types';
const node=(id:string,kind:NonNullable<SemanticNode['architecture']>['kind']='application'):SemanticNode=>({id,label:id,kind:'subsystem',group:'test',confidence:'source',attributes:{},evidence:[],architecture:{kind,entryPaths:[],roles:[],environments:[],context:[],memberIds:[],files:[],technologyNames:[],auxiliary:false}});
const edge=(id:string,source:string,target:string,kind='http-request'):SemanticEdge=>({id,source,target,kind,label:kind,confidence:'source',evidence:[],views:['architecture-map']});
const tool=(id:string)=>({...node(id,'tool-operation'),attributes:{purpose:'start',dictionaryStackId:'generic',configurationPath:`${id}.config`,scriptName:id}});
it.each(['2d','3d'] as const)('encloses only an app and dedicated operations, never lone peers or shared support (%s)',mode=>{
 const a=node('application-a'),b=node('application-b'),db=node('database','resource'),library=node('library','shared-code'),dedicated=tool('dedicated'),shared=tool('shared');
 const model:SemanticGraph={view:'architecture-map',nodes:[a,b,db,library,dedicated,shared],edges:[edge('start',dedicated.id,a.id,'flow-starts'),edge('both-a',shared.id,a.id,'flow-starts'),edge('both-b',shared.id,b.id,'flow-starts')]};
 const before=JSON.stringify(model),simple=architectureSimpleOverview(prepareArchitectureScope(model)),regions=semanticFlowRegions(layoutSemanticFlow(simple.graph,mode),mode);
 expect(regions).toHaveLength(1);expect(regions[0]!.nodeIds.sort()).toEqual([simple.owners.get(a.id),simple.owners.get(dedicated.id)].sort());expect(new Set(simple.owners.keys()).size).toBe(6);expect(JSON.stringify(model)).toBe(before);
 expect(simple.graph.nodes.find(n=>n.id===simple.owners.get(b.id))!.attributes.simpleRegionId).toBe('');
});
it('keeps DB changes together without reclassifying adjacent app startup as DB support',()=>{
 const app=node('app'),db=node('db','resource'),start=tool('start'),apply={...tool('apply'),attributes:{purpose:'apply'}},generate={...tool('generate'),attributes:{purpose:'generate'}},schema=node('schema','code-definition'),sql=node('sql','artifact');
 const model:SemanticGraph={view:'architecture-map',nodes:[app,db,start,apply,generate,schema,sql],edges:[edge('starts','start','app','flow-starts'),edge('order','apply','start','flow-precedes'),edge('applies','apply','db','flow-applies'),edge('schema','schema','generate','flow-input'),edge('generate','generate','sql','flow-generates'),edge('sql','sql','apply','flow-input')]};
 const simple=architectureSimpleOverview(prepareArchitectureScope(model)),byId=new Map(simple.graph.nodes.map(n=>[n.id,n])),positions=simple.graph.architectureView!.positions2d!;
 expect(byId.get(simple.owners.get('start')!)!.attributes.simpleSupportPurpose).not.toBe('DB構造変更');
 const ids=['schema','generate','sql','apply'].map(id=>simple.owners.get(id)!);expect(ids.every(id=>byId.get(id)!.attributes.simpleSupportPurpose==='DB構造変更')).toBe(true);
 const points=ids.map(id=>positions.get(id)!);expect(Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y))).toBeLessThanOrEqual(100);expect(new Set(simple.owners.keys()).size).toBe(7);
});
it('never attaches evidence line numbers to membership or entry paths',()=>{
 const n=node('component','component');n.path='apps/service';n.evidence=[{path:'apps/service/config.ts',start:21,end:55,line:3,endLine:9,description:'config'}];
 expect(simpleMemberCaption(n)).toContain('service/config.ts · L3–9');expect(simpleMemberCaption(n)).not.toContain('apps/service:');expect(simpleMemberLocations(n)).toEqual([{label:'所属',path:'apps/service'}]);
 n.architecture!.kind='execution-config';n.path='apps/service/main.ts';n.architecture!.entryPaths=[n.path];expect(simpleMemberCaption(n)).not.toContain('main.ts');expect(simpleMemberLocations(n)).toContainEqual({label:'実行入口',path:n.path});
 n.architecture!.entryPaths=[];n.attributes.entryDeclaration='src/main.ts';n.attributes.configurationPath='apps/service/config.json';expect(simpleMemberLocations(n)).toContainEqual({label:'設定上の入口',path:'src/main.ts'});expect(simpleMemberCaption(n)).toContain('config.ts · L3–9');
 n.evidence=[];expect(simpleMemberCaption(n)).toContain('根拠ファイル未確認');
});
it('counts physical ranges independently of descriptions, lines, aliases and other input arrays',()=>{
 const first={path:'./app/a.ts',start:4,end:9,line:2,endLine:2,description:'input'},evidence=[first,{...first,path:'app\\a.ts',description:'output'},{...first,start:5},{...first,path:'other/a.ts'},{...first,start:-1}];
 expect(simpleEvidenceStats(evidence)).toEqual({sites:3,records:5,unlocated:1});expect(simpleEvidenceStats(evidence)).toBe(simpleEvidenceStats(evidence));expect(simpleEvidenceStats([{...first}]).sites).toBe(1);expect(evidence).toHaveLength(5);
});
it('shows incoming and outgoing kinds and environments separately without internal peers',()=>{
 const a=node('a'),b=node('b'),internal=node('inside','component');internal.architecture!.parentId='a';
 const model:SemanticGraph={view:'architecture-map',nodes:[a,b,internal],edges:[{...edge('incoming','b','a'),details:{environment:'preview'}},{...edge('outgoing','a','b','configures-service'),details:{environment:'release'}},edge('internal','a','inside')]};
 const simple=architectureSimpleOverview(prepareArchitectureScope(model)),peers=simplePeers(simple,simple.owners.get('a')!,model.edges);expect(peers.map(p=>[p.direction,p.kind,p.environment])).toEqual([['incoming','http-request','preview'],['outgoing','configures-service','release']]);
});
it.each([1,4,20])('uses canonical operation counts for %i uses, not an arbitrary representative',count=>{
 const app=node('app'),code=node('code','code-definition');code.attributes.logicalOwnerId='app';const uses=Array.from({length:count},(_,i)=>({...tool(`use-${i}`),attributes:{purpose:'start',dictionaryStackId:'generic',configurationPath:'one.config',scriptName:`start-${i}`}}));
 const model:SemanticGraph={view:'architecture-map',nodes:[app,code,...uses],edges:uses.map(n=>edge(n.id,'code',n.id,'flow-input'))},simple=architectureSimpleOverview(prepareArchitectureScope(model)),line=simple.graph.edges[0]!,summary=simpleRelationOverview(simple,line,simple.relations.get(line.id)!);
 expect(summary.sentence).toContain('側のコード');expect(summary.usage).toBe(`${count}使用（start-0${count>1?`ほか${count-1}使用`:''}）`);expect(summary.records).toBe(count);expect(summary.kind).toBe(count>1?'複数関係の束':'直接関係');expect(simpleUsageSummary([...uses,uses[0]!])).toBe(summary.usage);
});
it.skipIf(!process.env.SIMPLE_BOUNDS)('checks all three saved inputs, region reduction and physical site counts',()=>{
 const reports=[];
 for(const project of ['vehicle-management','git-lines','web-atlas']){
  const model:SemanticGraph=JSON.parse(readFileSync(`.cache/simple-polish/${project}.model.json`,'utf8')),base=prepareArchitectureScope(model,undefined,'',true),start=performance.now(),simple=architectureSimpleOverview(base),coldMs=performance.now()-start;
  const regions=semanticFlowRegions(layoutSemanticFlow(simple.graph,'2d'),'2d'),old=JSON.parse(readFileSync(`.cache/simple-bounds/${project}.before.json`,'utf8'));
  expect([...simple.owners.keys()].sort()).toEqual(base.allowed.map(n=>n.id).sort());expect([...new Set([...simple.units.values()].flatMap(u=>u.internalEdges).concat([...simple.relations.values()].flatMap(r=>r.edgeIds)))].sort()).toEqual(model.edges.map(e=>e.id).sort());
  const oldBounds=new Set(old.graph.nodes.filter((n:SemanticNode)=>n.attributes.simpleRole!=='context').map((n:SemanticNode)=>n.attributes.simpleRegionId)).size;
  expect(regions.length).toBeLessThanOrEqual(oldBounds);expect(regions.every(r=>r.count>1)).toBe(true);const evidenceStart=performance.now(),stats=simple.graph.nodes.map(n=>({label:n.label,...simpleEvidenceStats(n.evidence)})),siteMs=performance.now()-evidenceStart;
  const warm=performance.now();for(let i=0;i<100;i++){architectureSimpleOverview(base);for(const n of simple.graph.nodes)simpleEvidenceStats(n.evidence);}const warm100Ms=performance.now()-warm;
  reports.push({bounds3d:semanticFlowRegions(layoutSemanticFlow(simple.graph,'3d'),'3d').map(r=>({label:r.label,count:r.count})),project,coldMs,siteMs,warm100Ms,nodes:simple.graph.nodes.length,edges:simple.graph.edges.length,oldBounds,bounds:regions.map(r=>({label:r.label,count:r.count})),stats});
 }
 writeFileSync('.cache/simple-bounds/results.json',JSON.stringify(reports,null,2));
},120000);
