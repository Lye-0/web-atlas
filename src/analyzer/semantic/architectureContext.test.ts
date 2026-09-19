import { describe,it,expect } from 'vitest';
import { architectureEnvironmentContext,architectureTargetSummary,architectureUsageContext,finalizeArchitectureContext } from './architectureContext';
import { layoutArchitectureRelations } from './architectureLayout';
import { explorerRelations } from './semanticExplorer';
import { architectureRelationLabel,architectureRelationOriginals } from './architectureRelations';
import type { ArchitectureModel,ArchitectureKind } from './architecture';
import type { SemanticNode,SemanticEdge } from './types';
const ev={path:'api/package.json',line:3,endLine:3,start:5,end:20,description:'explicit script'};
const node=(id:string,kind:ArchitectureKind,environments:string[]=[],attributes:SemanticNode['attributes']={}):SemanticNode=>({id,label:id,kind:'subsystem',group:'project',confidence:'source',evidence:[ev],attributes,architecture:{kind,environments,entryPaths:[],roles:[],context:[],memberIds:[],files:[],technologyNames:[],auxiliary:false}});
const edge=(id:string,source:string,target:string,kind='flow-input',environment=''):SemanticEdge=>({id,source,target,kind,label:kind,views:['architecture-map'],confidence:'source',evidence:[ev],details:{environment}});
describe('Architecture context and relation-aware layout',()=>{
 it('distinguishes a logical definition, confirmed shared input, default and unknown request',()=>{
  const nodes=[node('app','application',['development','production']),node('code','code-definition'),node('dev','execution-config',['development'],{logicalOwnerId:'app'}),node('prod','execution-config',['production'],{logicalOwnerId:'app'}),node('unknown','unresolved'),node('default','execution-config',['default'])];
  const model:ArchitectureModel={view:'architecture-map',nodes,edges:[edge('d','code','dev','flow-input','development'),edge('p','code','prod','flow-input','production')],environments:[],limitations:[]};finalizeArchitectureContext(model);
  expect(architectureEnvironmentContext(nodes[0]!).meaning).toBe('definition');expect(architectureEnvironmentContext(nodes[1]!).meaning).toBe('shared');expect(architectureEnvironmentContext(nodes[4]!).meaning).toBe('unknown');expect(architectureEnvironmentContext(nodes[5]!).meaning).toBe('default');
  expect(model.edges.filter(e=>e.kind==='flow-definition')).toHaveLength(2);
  expect(explorerRelations(model,'dev',4).nodes.map(n=>n.id)).not.toContain('app');
 });
 it('keeps a known deploy target distinct from an unknown CLI execution location',()=>{
  const op=node('publish','tool-operation',['production'],{executionPlace:'unconfirmed',targetPlace:'unconfirmed'}),target=node('prod','execution-config',['production']);
  expect(architectureTargetSummary(op,[edge('p',op.id,target.id,'flow-deploys')],new Map([[target.id,target]]))).toEqual([target]);
  expect(op.attributes.executionPlace).toBe('unconfirmed');
 });
 it('identifies same-name uses by script and invocation without numbering',()=>{
  const a=node('a','tool-operation',['development'],{scriptName:'dev'}),b=node('b','tool-operation',['development'],{scriptName:'start'}),c=node('c','tool-operation',['development'],{scriptName:'dev',invocationLabel:'root / dev:web'});
  expect(new Set([a,b,c].map(architectureUsageContext)).size).toBe(3);
 });
 it('keeps repeated forwarded calls distinguishable by their real call sites',()=>{
  const nodes=[node('a','tool-operation',[],{scriptName:'dev',invocationLabel:'root / start'}),node('b','tool-operation',[],{scriptName:'dev',invocationLabel:'root / start'})];
  for(const [i,n] of nodes.entries()){n.label='Wrangler：起動';n.evidence.push({...ev,path:'package.json',start:40+i*20,end:50+i*20});}
  finalizeArchitectureContext({view:'architecture-map',nodes,edges:[],environments:[],limitations:[]});
  expect(new Set(nodes.map(architectureUsageContext)).size).toBe(2);
  expect(architectureUsageContext(nodes[1]!)).toContain('60–70');
 });
 it('does not describe a mixed aggregate using only its first relation kind',()=>{
  const a=edge('http','app','service','http-request'),b=edge('setting','app','service','deployment-config');
  const aggregate={...a,id:'aggregate',provenance:{edges:[a,b]}};
  expect(architectureRelationLabel(aggregate)).toBe('複数種別の関係');
  expect(architectureRelationOriginals([aggregate]).map(e=>e.id)).toEqual(['http','setting']);
 });
 it('packs related paths independently of environment with deterministic nonoverlapping slots',()=>{
  const nodes=Array.from({length:20},(_,i)=>node(String(i),'tool-operation',[i%2?'production':'development'],{unifiedFlow:true}));
  const edges=nodes.slice(1).map((n,i)=>edge(String(i),nodes[i]!.id,n.id));const graph={view:'architecture-map' as const,nodes,edges};
  const a=layoutArchitectureRelations(graph),b=layoutArchitectureRelations({...graph,nodes:[...nodes].reverse(),edges:[...edges].reverse()});
  expect(a.map(p=>[p.node.id,p.x,p.y])).toEqual(b.map(p=>[p.node.id,p.x,p.y]));
  for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++)expect(Math.abs(a[i]!.x-a[j]!.x)>=248||Math.abs(a[i]!.y-a[j]!.y)>=108).toBe(true);
 });
});
