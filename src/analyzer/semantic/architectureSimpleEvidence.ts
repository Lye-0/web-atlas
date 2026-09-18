import type {SemanticEvidence,SemanticNode} from './types';

/** Physical sites belong to one input's evidence array; descriptions retain their own records. */
const cache=new WeakMap<SemanticEvidence[],{sites:number;records:number;unlocated:number}>();
export function simpleEvidenceStats(evidence:SemanticEvidence[]){
 const cached=cache.get(evidence);if(cached)return cached;
 const sites=new Set<string>();let unlocated=0;
 for(const e of evidence){const parts:string[]=[];for(const part of e.path.replaceAll('\\','/').split('/')){if(!part||part==='.')continue;if(part==='..'&&parts.length&&parts.at(-1)!=='..')parts.pop();else parts.push(part);}
  if(!parts.length||!Number.isFinite(e.start)||!Number.isFinite(e.end)||e.start<0||e.end<e.start){unlocated++;continue;}
  sites.add(JSON.stringify([parts.join('/'),e.start,e.end]));
 }
 const result={sites:sites.size,records:evidence.length,unlocated};cache.set(evidence,result);return result;
}
export function simpleEvidenceLocation(e?:SemanticEvidence){
 if(!e?.path)return '根拠ファイル未確認';
 return `${e.path.replaceAll('\\','/').split('/').slice(-2).join('/')} · ${e.line>0?`L${e.line}${e.endLine>e.line?`–${e.endLine}`:''}`:'行番号未確認'}`;
}
export function simpleMemberLocations(n:SemanticNode){
 const locations:{label:string;path:string}[]=[];
 const owner=n.architecture?.ownerPath;
 if(owner)locations.push({label:'所属',path:owner});
 else if(n.path&&['application','component','shared-code','code-package'].includes(n.architecture?.kind??''))locations.push({label:'所属',path:n.path});
 const config=n.attributes.configurationPath;if(typeof config==='string'&&config)locations.push({label:'設定',path:config});
 const definition=n.attributes.definitionPath;if(typeof definition==='string'&&definition&&definition!==config)locations.push({label:'定義',path:definition});
 const entry=n.attributes.entryDeclaration;if(typeof entry==='string'&&entry)locations.push({label:'設定上の入口',path:entry});
 if(n.architecture?.kind==='execution-config')for(const path of n.architecture.entryPaths)locations.push({label:'実行入口',path});
 return locations;
}
