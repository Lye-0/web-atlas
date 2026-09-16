import type { ArchitectureModel } from './architecture';
import type { SemanticNode, SemanticEdge } from './types';
import { uniqueArchitectureEvidence } from './architectureEvidence';

export type EnvironmentMeaning = 'definition' | 'shared' | 'explicit' | 'default' | 'unknown';
const definitions = new Set(['application','code-package','component','shared-code','code-definition']);
export function architectureEnvironmentContext(node:SemanticNode):{meaning:EnvironmentMeaning;label:string;environments:string[]} {
  const names=(node.architecture?.environments??[]).filter(n=>!n.startsWith('except:'));
  const declared=Array.isArray(node.attributes.sharedEnvironments)?node.attributes.sharedEnvironments:[];
  if(declared.length>1)return {meaning:'shared',label:`共有：${declared.join(' / ')}`,environments:declared};
  if(definitions.has(node.architecture?.kind??''))return {meaning:'definition',label:'論理定義',environments:[]};
  const locationOnly=Boolean(node.attributes.configurationOccurrence)&&names.length===1&&['local','cloud','build','deployment'].includes(names[0]!);
  if(locationOnly||!names.length)return {meaning:'unknown',label:'環境未特定',environments:[]};
  if(names.length>1)return {meaning:'explicit',label:`複数環境の設定：${names.join(' / ')}`,environments:names};
  if(names[0]==='default')return {meaning:'default',label:'既定設定',environments:names};
  return {meaning:'explicit',label:names[0]!,environments:names};
}

/** Stable source context shared by diagram, search, partner rows and details. */
export function architectureUsageContext(node:SemanticNode):string {
  if(node.architecture?.kind!=='tool-operation')return '';
  const owner=node.architecture.ownerPath||'root';
  const script=typeof node.attributes.scriptName==='string'?node.attributes.scriptName:'';
  const invocation=typeof node.attributes.invocationLabel==='string'?node.attributes.invocationLabel:'';
  const suffix=invocation?`呼出 ${invocation}`:'';
  const at=node.evidence[0];
  return [script?`${owner} / ${script}`:owner,suffix,node.attributes.usageSite?String(node.attributes.usageSite):at?`${at.path.split('/').at(-1)}:${at.line}${at.endLine!==at.line?`–${at.endLine}`:''}`:''].filter(Boolean).join(' · ');
}

export function architectureTargetSummary(node:SemanticNode,edges:readonly SemanticEdge[],byId:ReadonlyMap<string,SemanticNode>) {
  const kinds=new Set(['flow-starts','flow-deploys','flow-generates','flow-applies']);
  if(node.attributes.purpose==='script')kinds.add('flow-invokes');
  const ids=new Set(edges.filter(e=>e.source===node.id&&kinds.has(e.kind)).map(e=>e.target));
  return [...ids].sort().map(id=>byId.get(id)).filter((n):n is SemanticNode=>Boolean(n));
}

/** Enrich semantic distinctions without changing identity or copying unknown requests. */
export function finalizeArchitectureContext(model:ArchitectureModel) {
  for(const edge of model.edges)if(edge.kind==='flow-configures')edge.details={...edge.details,structural:true};
  const byId=new Map(model.nodes.map(n=>[n.id,n]));
  const relevant=new Map<string,Set<string>>();
  for(const e of model.edges){if(!e.kind.startsWith('flow-')||e.kind==='flow-precedes'||e.kind==='flow-invokes')continue;
    const env=e.details?.environment;if(!env||env==='default')continue;const set=relevant.get(e.source)??new Set<string>();set.add(env);relevant.set(e.source,set);
  }
  const additions:SemanticEdge[]=[];
  for(const n of model.nodes){
    const environments=relevant.get(n.id);
    if(environments&&environments.size>1&&['code-definition','artifact'].includes(n.architecture?.kind??''))n.attributes.sharedEnvironments=[...environments].sort();
    const env=architectureEnvironmentContext(n);n.attributes.environmentMeaning=env.meaning;
    if(n.attributes.flowEnvironment)n.attributes.flowEnvironment=env.label;
    const owner=typeof n.attributes.logicalOwnerId==='string'?byId.get(n.attributes.logicalOwnerId):undefined;
    if(owner&&['execution-config','code-definition'].includes(n.architecture?.kind??'')){
      const runtimeMatch=n.architecture?.kind==='execution-config'&&(Boolean(n.attributes.configurationPath)||owner.architecture?.context.includes('ブラウザ'));
      n.attributes.logicalAssociation=runtimeMatch?'execution':n.architecture?.kind==='code-definition'?'source':'owner';
      const id=`architecture:definition:${JSON.stringify([owner.id,n.id])}`;
      if(!model.edges.some(e=>e.id===id))additions.push({id,source:owner.id,target:n.id,kind:'flow-definition',label:runtimeMatch?'この論理アプリの実行構成':n.architecture?.kind==='code-definition'?'この論理定義の入力コード':'この構成が所有する配信設定',views:['architecture-map'],confidence:'source',evidence:uniqueArchitectureEvidence([...owner.evidence,...n.evidence]),details:{structural:true,architectureOrigin:'architecture',reason:'元の所有ID・コード/設定の対応。通信・実行順・環境間の実行経路ではない'}});
    }
  }
  model.edges.push(...additions);
  const contexts=new Map<string,SemanticNode[]>();
  for(const n of model.nodes.filter(n=>n.architecture?.kind==='tool-operation')){const key=`${n.label}:${architectureUsageContext(n)}`,list=contexts.get(key)??[];list.push(n);contexts.set(key,list);}
  for(const list of contexts.values())if(list.length>1)for(const n of list){
    const sites=[...new Set(n.evidence.map(e=>`${e.path}:${e.line} · 範囲 ${e.start}–${e.end}`))];
    n.attributes.usageSite=[...sites,n.attributes.usageArguments?`引数 ${n.attributes.usageArguments}`:'',n.attributes.configurationPath?`設定 ${n.attributes.configurationPath}`:''].filter(Boolean).join(' · ');
  }
}
