import type {SemanticGraph,SemanticNode,SemanticEdge} from './types';
import {simpleEvidenceLocation} from './architectureSimpleEvidence';

export const simplePurposes:Record<string,string>={serve:'開発配信',build:'ビルド',start:'起動',deploy:'公開',generate:'SQL生成',apply:'DB適用',script:'開始script'};
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
  const inputs=[...new Set(edges.filter(e=>e.target===n.id&&e.kind==='flow-input').map(e=>logical(e.source)??e.source))].sort();
  const outputs=[...new Set(edges.filter(e=>e.source===n.id&&['flow-generates','flow-starts','flow-deploys','flow-applies'].includes(e.kind)).map(e=>JSON.stringify([e.kind,e.target,e.details?.environment??'',e.details?.conditional??false])))].sort();
  const inputConditions=[...new Set(edges.filter(e=>e.target===n.id&&e.kind==='flow-input').map(e=>JSON.stringify([logical(e.source)??e.source,e.details?.environment??'',e.details?.conditional??false,e.confidence])))].sort();
  const context=[n.attributes.configurationPath??'',n.attributes.inputRoot??'',n.attributes.workingDirectory??n.attributes.ownerPath??(n.attributes.configurationPath||n.attributes.inputRoot?'':n.id),inputs,outputs,inputConditions,n.attributes.targetPlace??'', [...(n.architecture?.environments??[])].sort(),String(n.attributes.usageArguments??'').trim(),n.attributes.configurationStatus??'',n.attributes.environmentMeaning??'',n.confidence];
  usages.set(n.id,{targets:[...targets].sort(),purpose,family:purpose||'unknown',tool:String(n.attributes.dictionaryStackId??n.label.split('：')[0]??n.id),context:JSON.stringify(context),resolved:targets.size>0||inputs.length>0});
 }
 return {byId,adjacent,usages};
}

/** Script context is source metadata, never parsed out of a generated ID. */
export function simpleMemberCaption(n:SemanticNode){
 const context=n.architecture?.kind==='tool-operation'?[n.attributes.scriptName,n.attributes.invocationLabel,n.attributes.usageArguments].filter(Boolean).join(' · '):n.architecture?.request?.expression??'';
 return [context,`代表的な根拠：${simpleEvidenceLocation(n.evidence[0])}`].filter(Boolean).join(' · ');
}
