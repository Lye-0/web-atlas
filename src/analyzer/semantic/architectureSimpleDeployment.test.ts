// @vitest-environment node
import {expect,it} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {architectureSimpleOverview} from './architectureSimple';
import {prepareArchitectureScope} from './architectureProjection';
import {simplePeerGroups} from './architectureSimpleSummary';
import type {SemanticGraph,SemanticNode,SemanticEdge} from './types';
const n=(id:string,kind:NonNullable<SemanticNode['architecture']>['kind']='application'):SemanticNode=>({id,label:id,kind:'subsystem',group:'test',confidence:'source',evidence:[],attributes:{},architecture:{kind,entryPaths:[],roles:[],environments:[],context:[],memberIds:[],files:[],technologyNames:[],auxiliary:false}});
const e=(id:string,source:string,target:string,kind='flow-input'):SemanticEdge=>({id,source,target,kind,label:kind,confidence:'source',evidence:[],views:['architecture-map']});
const tool=(id:string,purpose:string)=>({...n(id,'tool-operation'),attributes:{purpose,dictionaryStackId:'tool',configurationPath:'deploy.config'}});
const destination=(id:string,owner:string,environment:string,config='deploy.config')=>{const node=n(id,'execution-config');node.attributes={logicalOwnerId:owner,configurationPath:config,executionPlace:'cloud',providedContent:'recorded content'};node.architecture!.environments=[environment];return node;};
it('retains combined code/artifact deployment arrivals and their exact original stages',()=>{
 const app=n('api'),web=n('browser'),code=n('code','code-definition'),build=tool('build','build'),deploy=tool('deploy','deploy'),start=tool('start','start'),asset=n('asset','artifact'),prod=destination('production','api','release'),local=destination('local','api','preview');code.attributes.logicalOwnerId='api';local.attributes.executionPlace='local';
 const graph:SemanticGraph={view:'architecture-map',nodes:[app,web,code,build,deploy,start,asset,prod,local],edges:[e('build-input','browser','build'),e('generate','build','asset','flow-generates'),e('assets','asset','deploy'),e('code','code','deploy'),e('start-input','code','start'),e('start','start','local','flow-starts'),e('publish','deploy','production','flow-deploys')]};
 const before=JSON.stringify(graph),simple=architectureSimpleOverview(prepareArchitectureScope(graph)),line=simple.graph.edges.find(edge=>edge.kind==='flow-deploys')!;
 expect(line.target).toBe(simple.owners.get('production'));expect(line.target).not.toBe(simple.owners.get('api'));expect(simple.owners.get('local')).not.toBe(simple.owners.get('api'));expect(simple.relations.get(line.id)!.edgeIds).toEqual(['publish']);expect([...simple.relations.values()].some(r=>r.paths?.some(p=>p.nodeIds.join(',')==='build,asset,deploy'))).toBe(true);expect(JSON.stringify(graph)).toBe(before);
});
it('retains environment branches of one setting and different deployment settings',()=>{
 const app=n('app'),deploy=tool('publish','deploy'),a=destination('a','app','default'),b=destination('b','app','staging'),other=destination('other','app','staging','other.config');
 const simple=architectureSimpleOverview(prepareArchitectureScope({view:'architecture-map',nodes:[app,deploy,a,b,other],edges:[e('a','publish','a','flow-deploys'),e('b','publish','b','flow-deploys'),e('other','publish','other','flow-deploys')]}));
 expect(simple.owners.get('a')).not.toBe(simple.owners.get('b'));expect(simple.owners.get('other')).not.toBe(simple.owners.get('b'));expect(simple.units.get(simple.owners.get('a')!)!.anchorId).toBeUndefined();
 const duplicate=destination('same-environment-other-target','app','staging');const distinct=architectureSimpleOverview(prepareArchitectureScope({view:'architecture-map',nodes:[app,deploy,b,duplicate],edges:[e('first','publish','b','flow-deploys'),e('second','publish',duplicate.id,'flow-deploys')]}));expect(distinct.owners.get('b')).not.toBe(distinct.owners.get(duplicate.id));
});
it('does not invent a destination for build-only, disconnected artifacts, or unresolved publication',()=>{
 const app=n('app'),build=tool('build','build'),artifact=n('dist','artifact');const graph:SemanticGraph={view:'architecture-map',nodes:[app,build,artifact],edges:[e('input','app','build'),e('build','build','dist','flow-generates')]};
 const first=architectureSimpleOverview(prepareArchitectureScope(graph));expect(first.graph.nodes.some(n=>n.attributes.simpleCategory==='destination')).toBe(false);expect(first.graph.nodes.find(n=>n.id===first.owners.get('dist'))!.attributes.simplePublicationNote).toBe('公開操作は未検出');
 const deploy=tool('unresolved-publish','deploy'),second=architectureSimpleOverview(prepareArchitectureScope({...graph,nodes:[...graph.nodes,deploy]}));expect(second.graph.nodes.find(n=>n.id===second.owners.get(deploy.id))!.attributes.simplePublicationNote).toContain('未解決');expect(second.graph.edges.some(e=>e.source===second.owners.get('dist')&&e.target===second.owners.get(deploy.id))).toBe(false);
});
it('keeps same-named artifacts in different environments and separately published apps distinct',()=>{
 const a=n('app-a'),b=n('app-b'),buildA=tool('build-a','build'),buildB=tool('build-b','build'),deployA=tool('publish-a','deploy'),deployB=tool('publish-b','deploy'),artifactA=n('artifact-a','artifact'),artifactB=n('artifact-b','artifact'),targetA=destination('destination-a','app-a','preview'),targetB=destination('destination-b','app-b','release');
 buildA.attributes.dictionaryStackId='builder';buildB.attributes.dictionaryStackId='builder';
 for(const artifact of [artifactA,artifactB]){artifact.label='dist';artifact.attributes.artifactPath='same/dist';}artifactA.architecture!.environments=['preview'];artifactB.architecture!.environments=['release'];
 const graph:SemanticGraph={view:'architecture-map',nodes:[a,b,buildA,buildB,deployA,deployB,artifactA,artifactB,targetA,targetB],edges:[e('a-input','app-a','build-a'),e('b-input','app-b','build-b'),e('a-output','build-a','artifact-a','flow-generates'),e('b-output','build-b','artifact-b','flow-generates'),e('publication-input','artifact-b','publish-b'),e('a-target','publish-a','destination-a','flow-deploys'),e('b-target','publish-b','destination-b','flow-deploys')]};
 const simple=architectureSimpleOverview(prepareArchitectureScope(graph));expect(simple.owners.get('destination-a')).not.toBe(simple.owners.get('destination-b'));expect(simple.owners.get('artifact-a')).not.toBe(simple.owners.get('artifact-b'));expect([...simple.relations.values()].flatMap(r=>r.paths??[]).map(p=>p.nodeIds)).toEqual([['build-b','artifact-b','publish-b']]);
});
const resource=(id:string,environment:string,path='config.json',type='SQL',binding='DATA')=>{const node=n(id,'resource');node.label='same name';node.architecture!.environments=[environment];node.architecture!.identity={status:'unconfirmed',type,reason:'configured',configurations:[{id:`setting-${id}`,path,binding,environment,evidence:[{path,line:1,endLine:1,start:0,end:2,description:'binding'}]}]};return node;};
it('groups resource roles without merging IDs or creating cross-environment connections',()=>{
 const a=n('client-a'),b=n('client-b'),dev=resource('dev','development'),prod=resource('prod','production'),other=resource('other','production','other.json'),service=resource('different','production','config.json','DifferentSQL');
 const graph:SemanticGraph={view:'architecture-map',nodes:[a,b,dev,prod,other,service],edges:[e('dev','client-a','dev','data-operation'),e('prod','client-b','prod','data-operation')]},simple=architectureSimpleOverview(prepareArchitectureScope(graph));
 expect(simple.owners.get('dev')).toBe(simple.owners.get('prod'));expect(simple.owners.get('other')).not.toBe(simple.owners.get('prod'));expect(simple.owners.get('different')).not.toBe(simple.owners.get('prod'));expect(simple.graph.edges).toHaveLength(2);for(const r of simple.relations.values())expect(r.edgeIds).toHaveLength(1);
 const ambiguous=architectureSimpleOverview(prepareArchitectureScope({...graph,nodes:[...graph.nodes,resource('duplicate','production')]}));expect(ambiguous.owners.get('dev')).not.toBe(ambiguous.owners.get('prod'));
});
it('requires ownership as well as usage to absorb libraries and keeps independent executables',()=>{
 const app=n('main'),cli=n('cli'),privateLib=n('private','shared-code'),shared=n('shared','shared-code'),unknown=n('unknown','code-package'),another=n('another','code-package');privateLib.architecture!.parentId=app.id;
 const graph:SemanticGraph={view:'architecture-map',nodes:[app,cli,privateLib,shared,unknown,another],edges:[e('private','main','private','code-reference'),e('shared','main','shared','code-reference')]},simple=architectureSimpleOverview(prepareArchitectureScope(graph));
 expect(simple.owners.get('private')).toBe(simple.owners.get('main'));expect(simple.owners.get('shared')).not.toBe(simple.owners.get('main'));expect(simple.owners.get('cli')).not.toBe(simple.owners.get('main'));expect(simple.owners.get('unknown')).toBe(simple.owners.get('another'));
 expect(simple.graph.nodes.find(n=>n.id===simple.owners.get('unknown'))!.attributes.simpleSupportPurpose).toBe('実行用途未確認');
 const multi=architectureSimpleOverview(prepareArchitectureScope({...graph,edges:[...graph.edges,e('other-consumer','cli','private','code-reference')]}));expect(multi.owners.get('private')).not.toBe(multi.owners.get('main'));
});
it('summarizes a peer once and keeps directions, meanings and environments inside it',()=>{
 const graph:SemanticGraph={view:'architecture-map',nodes:[n('a'),n('b')],edges:[e('input','a','b'),{...e('back','b','a','flow-starts'),details:{environment:'staging'}},e('code','a','b','code-reference')]},simple=architectureSimpleOverview(prepareArchitectureScope(graph)),groups=simplePeerGroups(simple,simple.owners.get('a')!,graph.edges);
 expect(groups).toHaveLength(1);expect(groups[0]!.relations).toHaveLength(3);expect(new Set(groups[0]!.relations.map(r=>r.direction)).size).toBe(2);
});
it.skipIf(!process.env.SIMPLE_DEPLOYMENT)('checks three snapshot projections and canonical conservation',async()=>{
 const reports=[];
 const oldProjection=await import(/* @vite-ignore */ resolve('.cache/simple-deployment/baseline-src/src/analyzer/semantic/architectureProjection.ts')),oldSimple=await import(/* @vite-ignore */ resolve('.cache/simple-deployment/baseline-src/src/analyzer/semantic/architectureSimple.ts'));
 for(const project of ['vehicle-management','git-lines','web-atlas']){
  const model:SemanticGraph=JSON.parse(readFileSync(`.cache/simple-polish/${project}.model.json`,'utf8')),before=createHash('sha256').update(JSON.stringify(model)).digest('hex'),base=prepareArchitectureScope(model,undefined,'',true),start=performance.now(),simple=architectureSimpleOverview(base),coldMs=performance.now()-start;
  expect(createHash('sha256').update(JSON.stringify(model)).digest('hex')).toBe(before);expect([...simple.owners.keys()].sort()).toEqual(base.allowed.map(n=>n.id).sort());
  expect([...new Set([...simple.units.values()].flatMap(u=>u.internalEdges).concat([...simple.relations.values()].flatMap(r=>r.edgeIds)))].sort()).toEqual(model.edges.map(e=>e.id).sort());
  const byId=new Map(model.nodes.map(n=>[n.id,n]));for(const edge of model.edges.filter(e=>e.kind==='flow-deploys'&&byId.get(e.target)?.architecture?.kind==='execution-config'))expect(simple.owners.get(edge.target)).not.toBe(simple.owners.get(String(byId.get(edge.target)!.attributes.logicalOwnerId)));
  const warm=performance.now();for(let i=0;i<100;i++)architectureSimpleOverview(base);const warm100Ms=performance.now()-warm;
  const oldBase=oldProjection.prepareArchitectureScope(model,undefined,'',true),oldStart=performance.now(),old=oldSimple.architectureSimpleOverview(oldBase),oldColdMs=performance.now()-oldStart;
  reports.push({project,coldMs,oldColdMs,warm100Ms,beforeNodes:old.graph.nodes.length,beforeEdges:old.graph.edges.length,nodes:simple.graph.nodes.length,edges:simple.graph.edges.length,originalNodes:model.nodes.length,originalEdges:model.edges.length,destinations:simple.graph.nodes.filter(n=>n.attributes.simpleCategory==='destination').map(n=>({label:n.label,rows:n.attributes.simpleRows,members:simple.units.get(n.id)!.members})),resources:simple.graph.nodes.filter(n=>n.attributes.simpleCategory==='resources').map(n=>({label:n.label,rows:n.attributes.simpleRows,members:simple.units.get(n.id)!.members}))});
 }
 writeFileSync('.cache/simple-deployment/results.json',JSON.stringify(reports,null,2));
},120000);
