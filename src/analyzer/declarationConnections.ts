export interface DeclaredConnection {targetId:string;kind:string;label:string;path:string;start:number;end:number}
import type { ExpansionContext } from './expandedScan';
import { publicUrlText } from './urlPrivacy';
export function connectDeclaration(context:ExpansionContext,from:string,to:string,kind:string,label:string,path:string,start:number,end:number,emitRelation=true):void {
  label=publicUrlText(label);const fact=context.builder.getFact(from);if(!fact||from===to)return;
  const encoded=JSON.stringify({targetId:to,kind,label,path,start,end});
  const prior=Array.isArray(fact.metadata.declaredConnections)?fact.metadata.declaredConnections:[];fact.metadata.declaredConnections=[...new Set([...prior,encoded])];
  if(emitRelation)context.relation(from,to,'uses-config',[context.evidence(path,start,end,kind,label,'declaration')],{relationClass:'deployment',declarationKind:kind});
}
export function declaredConnections(value:unknown):DeclaredConnection[]{
  if(!Array.isArray(value))return[];return value.flatMap(raw=>{try{const item=JSON.parse(String(raw));return typeof item.targetId==='string'&&typeof item.kind==='string'&&typeof item.label==='string'&&typeof item.path==='string'&&Number.isInteger(item.start)&&Number.isInteger(item.end)?[item as DeclaredConnection]:[];}catch{return[];}});
}
