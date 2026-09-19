import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {ArchitectureEnvironmentHeadings} from './ArchitectureEnvironmentHeadings';
import {architectureBoundaryHeadings} from '../../analyzer/semantic/architectureHeadings';
import {semanticFlowRegions,semanticFlowRegionIdentity} from '../../analyzer/semantic/flowRegions';
import {architectureDefinitionPresentation} from './architectureDefinitionPresentation';
import {buildSemanticExplorer} from '../../analyzer/semantic/semanticExplorer';
import {describeArchitecturePositioning} from '../../analyzer/semantic/architecturePositioning';
import {architecturePartners,architecturePeerSummary} from './architectureSummary';
import {architectureShortPath} from './architectureShortPath';
import type {SemanticNode,SemanticEdge,SemanticInput} from '../../analyzer/semantic/types';
const ev={path:'package.json',start:0,end:12,line:1,endLine:1,description:'definition'};
const node=(id:string,kind:NonNullable<SemanticNode['architecture']>['kind']='application',path=''):SemanticNode=>({id,label:'same',kind:'subsystem',group:'project',confidence:'source',evidence:[{...ev,path:path?path+'/definition':'package.json'}],attributes:{},architecture:{kind,ownerPath:path,entryPaths:[],roles:[],environments:[],context:[],files:[],memberIds:[],technologyNames:[],auxiliary:false}});
const edge=(id:string,target:string,confidence:SemanticEdge['confidence']='source'):SemanticEdge=>({id,source:'app',target,kind:'service-use',label:'relation',confidence,views:['architecture-map'],evidence:[ev]});
describe('Architecture environment, definition and peer presentation',()=>{
 it('keeps same-name boundary IDs separate inside their own header padding',()=>{
  const n=node('a'),positions=[{node:n,x:0,y:0,z:0}],base=semanticFlowRegions(positions,'2d')[0]!;
  const regions=[{...base,id:'first',label:'共有：日本語 / long-environment-name'},{...base,id:'second',label:'共有：日本語 / long-environment-name'}];
  const before=JSON.stringify(regions),names=architectureBoundaryHeadings(regions);
  expect(names.map(n=>n.id)).toEqual(['first','second']);
  for(const h of names){expect(h.left).toBeGreaterThan(base.x-12);expect(h.left+h.width).toBeLessThanOrEqual(base.x+base.width+12);expect(h.top-h.borderTop).toBe(12);expect(h.top+h.height).toBeLessThan(base.y);}
  expect(JSON.stringify(regions)).toBe(before);
 });
 it('uses one environment identity for wire regions and the mounted 3D region membership',()=>{
  const n={...node('env-node'),attributes:{flowEnvironment:'任意環境'}},positions=[{node:n,x:0,y:0,z:0}];
  const explorer=buildSemanticExplorer({view:'architecture-map',nodes:[n],edges:[]},new Set());
  expect(semanticFlowRegions(positions,'3d',explorer)[0]!.id).toBe(semanticFlowRegionIdentity(n,explorer).id);
  expect(semanticFlowRegionIdentity(n).label).toBe('任意環境');
 });
 it('uses only nearby header space when a different region has a node at the heading',()=>{
  const base=semanticFlowRegions([{node:node('a'),x:0,y:0,z:0}],'2d')[0]!;
  const obstacle={node:node('other'),x:0,y:base.y-20,z:0},before=JSON.stringify([base,obstacle]);
  const h=architectureBoundaryHeadings([base],[obstacle])[0]!;
  expect(h.left-base.x).toBeLessThanOrEqual(160);expect(h.top+h.height).toBeLessThanOrEqual(obstacle.y-62);expect(h.top-h.borderTop).toBe(12);
  expect(JSON.stringify([base,obstacle])).toBe(before);
 });
 it('describes an inherited role as its recorded owner and preserves the entity kind',()=>{
  const owner=node('owner'),artifact=node('artifact','artifact'),tool=node('tool','tool-operation');owner.label='App';owner.attributes={definitionPath:'deep/app/package.json',definitionOwnerId:'owner',compositionRole:'実行構成として定義'};
  artifact.attributes={...owner.attributes};tool.attributes={...owner.attributes};const nodes=new Map([owner,artifact,tool].map(n=>[n.id,n])),before=JSON.stringify([...nodes.values()]);
  for(const n of [artifact,tool]){const d=architectureDefinitionPresentation(n,nodes);expect(d.inherited).toBe(true);expect(d.owner?.label).toBe('App');expect(d.shortPath).toBe('package.json');}
  expect(architectureDefinitionPresentation(owner,nodes).inherited).toBe(false);expect(JSON.stringify([...nodes.values()])).toBe(before);
 });
 it('keeps direct names readable, non-overlapping and keyed independently of input order',()=>{
  const nodes=['stage-one','stage-two','unknown','a very long environment identity that must remain readable'].map((label,i)=>({...node(String(i)),attributes:{flowEnvironment:label}}));
  const positions=nodes.map(n=>({node:n,x:0,y:0,z:0})),regions=semanticFlowRegions(positions,'2d');
  const headings=architectureBoundaryHeadings(regions);
   expect(headings).toHaveLength(4);expect(headings).toEqual(architectureBoundaryHeadings([...regions].reverse()));
   expect(headings.map(h=>h.label)).toContain(nodes[3]!.attributes.flowEnvironment);
   for(let i=0;i<headings.length;i++)for(let j=i+1;j<headings.length;j++){const a=headings[i]!,b=headings[j]!;expect(a.left+a.width<=b.left||b.left+b.width<=a.left||a.top+a.height<=b.top||b.top+b.height<=a.top).toBe(true);}
  expect(headings[3]!.lines.join('')).toBe(headings[3]!.label);
  for(const scale of [.2,1,3]){
   const host=document.createElement('div');host.innerHTML=renderToStaticMarkup(<svg><g transform={`translate(10 20) scale(${scale})`}><ArchitectureEnvironmentHeadings headings={headings}/></g></svg>);
   expect(host.querySelectorAll('text')).toHaveLength(4);expect(host.querySelector('button,rect,path,line,foreignObject')).toBeNull();
   expect(host.querySelector('text')?.closest('g[transform]')?.getAttribute('transform')).toBe(`translate(10 20) scale(${scale})`);
  }
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
