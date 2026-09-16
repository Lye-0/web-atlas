import {describe,it,expect} from 'vitest';
import {architectureEnvironmentHeadings,architectureBoundaryMarks} from '../../analyzer/semantic/architectureHeadings';
import {semanticFlowRegions} from '../../analyzer/semantic/flowRegions';
import {describeArchitecturePositioning} from '../../analyzer/semantic/architecturePositioning';
import {architecturePartners,architecturePeerSummary} from './architectureSummary';
import {architectureShortPath} from './architectureShortPath';
import type {SemanticNode,SemanticEdge,SemanticInput} from '../../analyzer/semantic/types';
const ev={path:'package.json',start:0,end:12,line:1,endLine:1,description:'definition'};
const node=(id:string,kind:NonNullable<SemanticNode['architecture']>['kind']='application',path=''):SemanticNode=>({id,label:'same',kind:'subsystem',group:'project',confidence:'source',evidence:[{...ev,path:path?path+'/definition':'package.json'}],attributes:{},architecture:{kind,ownerPath:path,entryPaths:[],roles:[],environments:[],context:[],files:[],memberIds:[],technologyNames:[],auxiliary:false}});
const edge=(id:string,target:string,confidence:SemanticEdge['confidence']='source'):SemanticEdge=>({id,source:'app',target,kind:'service-use',label:'relation',confidence,views:['architecture-map'],evidence:[ev]});
describe('Architecture environment, definition and peer presentation',()=>{
 it('keeps overlapping and long environment headings distinct with stable keyed marks',()=>{
  const nodes=['stage-one','stage-two','unknown','a very long environment identity that must remain readable'].map((label,i)=>({...node(String(i)),attributes:{flowEnvironment:label}}));
  const positions=nodes.map(n=>({node:n,x:0,y:0,z:0})),regions=semanticFlowRegions(positions,'2d');
  expect(architectureEnvironmentHeadings(nodes)).toEqual(architectureEnvironmentHeadings([...nodes].reverse()));
  expect(architectureEnvironmentHeadings(nodes).map(h=>h.label)).toContain(nodes[3]!.attributes.flowEnvironment);
  for(const scale of [.2,1,3]){const marks=architectureBoundaryMarks(regions,positions,scale);expect(marks).toEqual(architectureBoundaryMarks([...regions].reverse(),positions,scale));for(let i=0;i<marks.length;i++)for(let j=i+1;j<marks.length;j++)expect(Math.abs(marks[i]!.y-marks[j]!.y)).toBeGreaterThanOrEqual(24/scale);}
 });
 it.each(['tools/deep/package','renamed/place'])('keeps independent definitions in %s separate from the project root',path=>{
  const root=node('architecture:["package","package.json"]'),nested=node(`architecture:["manifest","${path}/Package.swift","${path}"]`,'code-package',path),child=node('child','component',path+'/Sources');nested.evidence=[{...ev,path:path+'/Package.swift'}];child.architecture!.parentId=nested.id;
  const model={view:'architecture-map' as const,nodes:[root,nested,child],edges:[],environments:[],limitations:[]};const identities=JSON.stringify(model.nodes.map(n=>[n.id,n.evidence,n.architecture]));
  describeArchitecturePositioning(model,{sources:{'package.json':'{"name":"main"}'},imports:[],resources:[]} as SemanticInput);
  expect(root.attributes.definitionLocation).toBe('読込プロジェクト直下の定義');expect(nested.attributes.definitionPath).toBe(path+'/Package.swift');expect(child.attributes.definitionPath).toBe(nested.attributes.definitionPath);expect(nested.attributes.compositionRole).toBe('位置づけ未判定');
  expect(JSON.stringify(model.nodes.map(n=>[n.id,n.evidence,n.architecture]))).toBe(identities);
 });
 it('shows distinguishing suffixes instead of the common prefix without changing full paths',()=>{
  const paths=['records/group/after/extension','records/group/before/extension','other/after/extension'];
  expect(paths.map(p=>architectureShortPath(p,paths))).toEqual(['group/after','group/before','other/after']);expect(architectureShortPath('',paths)).toBe('プロジェクト直下');
 });
 it('separates known peers from unresolved requests and deduplicates group/individual IDs',()=>{
  const api=node('api'),resource=node('resource','resource'),a=node('r1','unresolved'),b=node('r2','unresolved'),group=node('group','unresolved');resource.architecture!.identity={type:'DB',status:'unconfirmed',reason:'unknown identity',configurations:[]};
  a.architecture!.request={kind:'http',ownerId:'app',sourceId:'call-1',expression:'one'};b.architecture!.request={kind:'http',ownerId:'app',sourceId:'call-2',expression:'two'};group.attributes={architectureRequestGroup:true,requestIds:['r1','r2']};
  const nodes=new Map([api,resource,a,b,group].map(n=>[n.id,n]));const edges=[edge('a','api','inferred'),edge('b','resource'),edge('g','group'),edge('r','r1'),{...edge('reverse','app'),source:'api'}];const before=JSON.stringify(edges);
  const peers=architecturePeerSummary(architecturePartners(edges,'app'),nodes);
  expect(peers.known.map(p=>p.otherId)).toEqual(['api','resource']);expect(peers.known[0]!.direction).toBe('相手から・相手への関係あり');expect(peers.targets).toBe(2);expect(peers.groups).toBe(1);expect(peers.sites).toBe(1);expect(JSON.stringify(edges)).toBe(before);
  expect(architecturePeerSummary(architecturePartners([edge('g','group')],'app'),nodes).known).toHaveLength(0);
  expect(architecturePeerSummary(architecturePartners([edge('a','api')],'app'),nodes).unresolved).toHaveLength(0);
 });
});
