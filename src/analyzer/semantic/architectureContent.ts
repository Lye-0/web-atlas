import type {SemanticGraph,SemanticNode,SemanticEdge} from './types';
import {architectureEnvironmentContext} from './architectureContext';

export interface ArchitectureContentChoice {id:string;label:string;group:'overview'|'environment'|'composition'|'path';environment?:string;meaning?:string;members?:string[];path?:'start'|'publish'|'runtime'|'database'}
export interface ArchitectureContentRange {graph:SemanticGraph;roles:ReadonlyMap<string,'core'|'peer'|'support'>;edgeIds:ReadonlySet<string>}
const runtime=new Set(['http-request','service-use','data-operation','message','process-start','deployment-config','selects-workload','routes-to-service','proxy-pass','upstream-server','cdn-domain','delivery-origin']);
const io=new Set(['flow-input','flow-starts','flow-deploys','flow-generates','flow-applies','flow-serves','flow-artifact','build-output','publishes-artifact']);
const order=new Set(['flow-invokes','flow-precedes']);
const structural=new Set(['flow-definition','flow-configures']);
const purpose=(n:SemanticNode|undefined)=>String(n?.attributes.purpose??'');
const isOp=(n:SemanticNode|undefined)=>n?.architecture?.kind==='tool-operation';
const paths={start:['start','serve'],publish:['build','deploy'],database:['generate','apply']} as const;
const cache=new WeakMap<SemanticGraph,{choices:ArchitectureContentChoice[];ranges:Map<string,ArchitectureContentRange>}>();

export function architectureContentChoices(model:SemanticGraph):ArchitectureContentChoice[]{
 const old=cache.get(model);if(old)return old.choices;
 const choices:ArchitectureContentChoice[]=[{id:'all',label:'全体',group:'overview'}],env=new Map<string,ArchitectureContentChoice>(),nodesById=new Map(model.nodes.map(n=>[n.id,n]));
 for(const n of model.nodes){const e=architectureEnvironmentContext(n);
  if(e.meaning==='explicit')for(const name of e.environments)env.set(JSON.stringify(['environment',name]),{id:JSON.stringify(['environment',name]),label:name,group:'environment',environment:name,meaning:'explicit'});
  else {const members=e.meaning==='shared'?[...e.environments].sort():undefined,id=JSON.stringify(['partition',e.meaning,members??[]]);env.set(id,{id,label:e.meaning==='shared'?`共有（${members!.join(' / ')}）`:e.meaning==='unknown'?'対象環境未特定':e.label,group:e.meaning==='shared'||e.meaning==='definition'?'composition':'environment',meaning:e.meaning,members});}
 }
 choices.push(...[...env.values()].sort((a,b)=>a.id.localeCompare(b.id)));
 for(const [path,label] of [['start','開発時の起動'],['publish','ビルド・公開'],['runtime','アプリ動作時の接続'],['database','DB構造変更']] as const){
  const exists=path==='runtime'?model.edges.some(e=>runtime.has(e.kind)&&nodesById.has(e.source)&&nodesById.has(e.target)&&!isOp(nodesById.get(e.source))&&!isOp(nodesById.get(e.target))):model.nodes.some(n=>isOp(n)&&(paths[path] as readonly string[]).includes(purpose(n)));
  if(exists)choices.push({id:`path:${path}`,label,group:'path',path});
 }
 const counts=new Map<string,number>();for(const c of choices)counts.set(c.label,(counts.get(c.label)??0)+1);
 if([...counts.values()].some(count=>count>1))for(const c of choices)if(c.meaning==='explicit')c.label=`環境「${c.environment}」`;
 cache.set(model,{choices,ranges:new Map()});return choices;
}

/** A typed edge slice. Peers and ownership context never become unrestricted traversal seeds. */
export function architectureContentRange(model:SemanticGraph,key:string):ArchitectureContentRange|undefined{
 if(key==='all')return undefined;
 const choice=architectureContentChoices(model).find(c=>c.id===key);if(!choice)return undefined;
 const cached=cache.get(model)!,old=cached.ranges.get(key);if(old)return old;
 const byId=new Map(model.nodes.map(n=>[n.id,n])),roles=new Map<string,'core'|'peer'|'support'>(),edges=new Map<string,SemanticEdge>();
 const rank={support:0,peer:1,core:2};
 const add=(id:string,role:'core'|'peer'|'support')=>{if(byId.has(id)&&rank[role]>rank[roles.get(id)??'support']||byId.has(id)&&!roles.has(id))roles.set(id,role);};
 const include=(e:SemanticEdge)=>{if(!byId.has(e.source)||!byId.has(e.target))return;edges.set(e.id,e);add(e.source,'peer');add(e.target,'peer');};
 const envMatch=(n:SemanticNode)=>{const e=architectureEnvironmentContext(n);return choice.meaning==='explicit'?e.meaning==='explicit'&&e.environments.includes(choice.environment!):e.meaning===choice.meaning&&(e.meaning!=='shared'||JSON.stringify([...e.environments].sort())===JSON.stringify(choice.members));};
 const envCompatible=(n:SemanticNode)=>{const e=architectureEnvironmentContext(n);return e.meaning==='unknown'||e.meaning==='definition'||e.meaning==='shared'&&(choice.environment?e.environments.includes(choice.environment):true)||envMatch(n);};
 const ops=new Set<string>();
 const logical=choice.meaning==='definition';
 if(logical){
  // The diagram's definition region also contains source fragments. Only logical units seed this preset.
  const unitKinds=new Set(['application','component','code-package','shared-code']);
  const units=new Set(model.nodes.filter(n=>unitKinds.has(n.architecture?.kind??'')).map(n=>n.id));
  for(const id of units)add(id,'core');
  for(const e of model.edges)if(e.kind==='flow-definition'||e.kind==='flow-serves'){
   const other=units.has(e.source)?e.target:units.has(e.target)?e.source:undefined;
   if(other&&byId.get(other)?.architecture?.kind==='execution-config')include(e);
  }
  // Keep an actual code-to-configuration bridge, but never use it to reach tools or resources.
  for(const e of model.edges)if(e.kind==='flow-configures'){
   const source=byId.get(e.source),target=byId.get(e.target);
   if(source?.architecture?.kind==='code-definition'&&target?.architecture?.kind==='execution-config'&&typeof source.attributes.logicalOwnerId==='string'&&units.has(source.attributes.logicalOwnerId)&&target.attributes.logicalOwnerId===source.attributes.logicalOwnerId){
    edges.set(e.id,e);add(source.id,'support');add(target.id,'peer');
    for(const definition of model.edges)if(definition.kind==='flow-definition'&&definition.source===source.attributes.logicalOwnerId&&definition.target===source.id)edges.set(definition.id,definition);
   }
  }
 }else if(choice.path==='runtime'){
  for(const e of model.edges)if(runtime.has(e.kind)&&!isOp(byId.get(e.source))&&!isOp(byId.get(e.target))){include(e);add(e.source,'core');add(e.target,'core');}
 }else if(choice.path){
  for(const n of model.nodes)if(isOp(n)&&(paths[choice.path] as readonly string[]).includes(purpose(n))){add(n.id,'core');ops.add(n.id);}
 }else {
  for(const n of model.nodes)if(envMatch(n)){add(n.id,'core');if(isOp(n))ops.add(n.id);}
  const seeds=new Set(roles.keys());
  for(const e of model.edges)if((seeds.has(e.source)||seeds.has(e.target))&&(runtime.has(e.kind)||io.has(e.kind)||structural.has(e.kind))){
   // A recorded runtime connection may cross environments. Its peer is retained, never expanded.
   if(!runtime.has(e.kind)&&e.details?.environment&&choice.environment&&e.details.environment!==choice.environment)continue;
   if(!runtime.has(e.kind)&&[e.source,e.target].some(id=>isOp(byId.get(id))&&!envCompatible(byId.get(id)!)))continue;
   include(e);for(const id of [e.source,e.target])if(isOp(byId.get(id))&&envCompatible(byId.get(id)!))ops.add(id);
  }
 }
 const processed=new Set<string>(),artifacts=new Set<string>();
 const allowedOp=(n:SemanticNode)=>choice.path==='start'?['start','serve'].includes(purpose(n)):choice.path&&choice.path!=='runtime'?(paths[choice.path] as readonly string[]).includes(purpose(n)):envCompatible(n);
 // Only explicit command predecessors/callers and typed input/output artifact links may extend a path.
 while([...ops].some(id=>!processed.has(id))){
  for(const id of [...ops]){if(processed.has(id))continue;processed.add(id);
   for(const e of model.edges){
    if(order.has(e.kind)&&e.target===id&&isOp(byId.get(e.source))){const n=byId.get(e.source)!;
     if(purpose(n)==='script'||allowedOp(n)||choice.path==='start'&&e.kind==='flow-precedes'){include(e);ops.add(n.id);add(n.id,'peer');}
    }
    if(io.has(e.kind)&&(e.source===id||e.target===id)){include(e);for(const endpoint of [e.source,e.target])if(byId.get(endpoint)?.architecture?.kind==='artifact')artifacts.add(endpoint);}
   }
  }
  // Artifacts are the only shared peers through which another matching operation can be reached.
  let changed=true;while(changed){changed=false;for(const e of model.edges)if(e.kind==='flow-artifact'&&(artifacts.has(e.source)||artifacts.has(e.target))){include(e);for(const id of [e.source,e.target])if(!artifacts.has(id)){artifacts.add(id);changed=true;}}}
  for(const e of model.edges)if((e.kind==='flow-input'&&artifacts.has(e.source)||e.kind==='flow-generates'&&artifacts.has(e.target))){const n=byId.get(e.kind==='flow-input'?e.target:e.source);if(n&&isOp(n)&&allowedOp(n)){include(e);ops.add(n.id);}}
 }
 // Configuration/definition correspondence is a terminal explanation, not a new path frontier.
 const substantive=new Set(roles.keys());
 for(const e of model.edges)if(!logical&&e.kind==='flow-serves'&&substantive.has(e.source)){include(e);}
 for(const e of model.edges)if(!logical&&structural.has(e.kind)&&(substantive.has(e.source)||substantive.has(e.target))){
  const other=substantive.has(e.source)?e.target:e.source,n=byId.get(other);
  if(n&&['application','code-package','shared-code','code-definition'].includes(n.architecture?.kind??'')){edges.set(e.id,e);add(other,'support');}
 }
 for(const id of [...roles.keys()]){let parent=byId.get(id)?.architecture?.parentId;const seen=new Set<string>();while(parent&&!seen.has(parent)){seen.add(parent);add(parent,'support');parent=byId.get(parent)?.architecture?.parentId;}}
 const graph:SemanticGraph={view:'architecture-map',nodes:model.nodes.filter(n=>roles.has(n.id)),edges:model.edges.filter(e=>edges.has(e.id)),...(logical?{architectureContentLayout:'logical-definitions' as const}:{})};
 const result={graph,roles,edgeIds:new Set(edges.keys())};cached.ranges.set(key,result);return result;
}

export function contentHasScope(range:ArchitectureContentRange,scope:string|undefined){
 if(!scope||scope==='project')return true;
 const byId=new Map(range.graph.nodes.map(n=>[n.id,n]));
 return range.graph.nodes.some(n=>{if(range.roles.get(n.id)==='support')return false;let id:string|undefined=n.id;const seen=new Set<string>();while(id&&!seen.has(id)){if(id===scope)return true;seen.add(id);id=byId.get(id)?.architecture?.parentId;}return false;});
}
