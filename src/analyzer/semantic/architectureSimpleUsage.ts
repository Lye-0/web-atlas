import type {SemanticGraph,SemanticNode,SemanticEdge} from './types';

export const simplePurposes:Record<string,string>={serve:'開発',build:'ビルド',start:'起動',deploy:'公開',generate:'SQL生成',apply:'DB適用',script:'開始script'};
export const simplePurposeOrder=['serve','build','start','deploy','generate','apply'];
export interface SimpleUsage {targets:string[];family:string;context:string;tool:string;purpose:string;resolved:boolean}
export function simpleUsageIndex(model:SemanticGraph){
 const byId=new Map(model.nodes.map(n=>[n.id,n])),adjacent=new Map<string,SemanticEdge[]>();
 for(const e of model.edges)for(const id of new Set([e.source,e.target])){const edges=adjacent.get(id)??[];edges.push(e);adjacent.set(id,edges);}
 const logical=(id:string)=>{const n=byId.get(id);if(!n)return undefined;const owner=n.attributes.logicalOwnerId;if(typeof owner==='string'&&byId.has(owner))return owner;return ['application','shared-code','code-package'].includes(n.architecture?.kind??'')?id:undefined;};
 const usages=new Map<string,SimpleUsage>();
 for(const n of model.nodes){if(n.architecture?.kind!=='tool-operation'||n.attributes.purpose==='script')continue;
  const purpose=String(n.attributes.purpose??''),targets=new Set<string>(),edges=adjacent.get(n.id)??[];
  for(const e of edges){
   if(e.source===n.id&&['flow-starts','flow-deploys','flow-applies'].includes(e.kind)){const l=logical(e.target);if(l)targets.add(l);else if(['resource','external-service','external-program'].includes(byId.get(e.target)?.architecture?.kind??''))targets.add(e.target);}

  }
  if(!targets.size&&!['generate','apply'].includes(purpose))for(const e of edges)if(e.target===n.id&&e.kind==='flow-input'){const l=logical(e.source);if(l)targets.add(l);}
  // A schema generator can share DB support, but only via its actual SQL output and apply operation.
  if(purpose==='generate')for(const out of edges.filter(e=>e.source===n.id&&e.kind==='flow-generates'))for(const input of adjacent.get(out.target)??[])if(input.source===out.target&&input.kind==='flow-input')for(const apply of adjacent.get(input.target)??[])if(apply.source===input.target&&apply.kind==='flow-applies')targets.add(apply.target);
  if(!targets.size)for(const e of edges)if(e.source===n.id&&e.kind==='flow-generates'&&byId.get(e.target)?.architecture?.kind==='artifact')targets.add(e.target);
  const applicationTargets=targets.size>0&&[...targets].every(id=>['application','shared-code','code-package'].includes(byId.get(id)?.architecture?.kind??''));
  const family=applicationTargets&&['start','serve','build','deploy'].includes(purpose)?'application-lifecycle':purpose||'unknown';
  usages.set(n.id,{targets:[...targets].sort(),purpose,family,tool:String(n.attributes.dictionaryStackId??n.label.split('：')[0]??n.id),context:JSON.stringify([n.attributes.configurationPath??n.attributes.inputRoot??n.attributes.workingDirectory??n.attributes.ownerPath??n.id,...(applicationTargets?[]:[n.attributes.targetPlace,n.architecture?.environments])]),resolved:targets.size>0});
 }
 const outputs=new Map<string,string[]>(),contexts=new Map<string,Set<string>>();
 for(const [id,u] of usages){if(u.family!=='application-lifecycle')continue;const paths=(adjacent.get(id)??[]).filter(e=>e.source===id&&e.kind==='flow-generates').map(e=>String(byId.get(e.target)?.attributes.artifactPath??e.target)).sort();outputs.set(id,paths);const k=JSON.stringify([u.tool,u.targets,u.context]),set=contexts.get(k)??new Set<string>();for(const path of paths)set.add(path);contexts.set(k,set);}
 for(const [id,u]of usages){const set=contexts.get(JSON.stringify([u.tool,u.targets,u.context]));if(set&&set.size>1)u.context=JSON.stringify([u.context,outputs.get(id)??[]]);}
 return {byId,adjacent,usages};
}

/** Script context is source metadata, never parsed out of a generated ID. */
export function simpleMemberCaption(n:SemanticNode){
 const at=n.evidence[0],file=(n.path??at?.path??'').split('/').slice(-2).join('/');
 const context=n.architecture?.kind==='tool-operation'?[n.attributes.scriptName,n.attributes.invocationLabel,n.attributes.usageArguments].filter(Boolean).join(' · '):n.architecture?.request?.expression??'';
 return [context,file+(at?`:${at.line}${at.endLine!==at.line?`–${at.endLine}`:''}`:'')].filter(Boolean).join(' · ');
}
