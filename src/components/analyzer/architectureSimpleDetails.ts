import type {ArchitectureSimple} from '../../analyzer/semantic/architectureSimple';
import type {SemanticEdge,SemanticNode,SemanticEvidence} from '../../analyzer/semantic/types';
import {architectureRelationLabel} from '../../analyzer/semantic/architectureRelations';
export const simpleEvidenceKey=(e:SemanticEvidence)=>JSON.stringify(e);
export function simpleRelationGroups(edges:readonly SemanticEdge[],nodes:ReadonlyMap<string,SemanticNode>){
 const groups=new Map<string,{id:string;label:string;edges:SemanticEdge[]}>();
 for(const e of edges){const id=JSON.stringify([e.source,e.target,e.kind,e.details?.environment??'',e.confidence]);let group=groups.get(id);
  if(!group){group={id,label:`${nodes.get(e.source)?.label??'元の対象'} → ${nodes.get(e.target)?.label??'元の対象'} · ${architectureRelationLabel(e)}${e.details?.environment?` · ${e.details.environment}`:''}`,edges:[]};groups.set(id,group);}group.edges.push(e);
 }
 return [...groups.values()].sort((a,b)=>b.edges.length-a.edges.length||a.id.localeCompare(b.id));
}
export function simpleMemberGroup(n:SemanticNode){
 switch(n.architecture?.kind){case 'execution-config':return '環境別の構成';case 'unresolved':return '接続先が未特定の要求';case 'tool-operation':return '道具・開始script';case 'code-definition':case 'artifact':return '入力・成果物';case 'component':return '内部構成';case 'application':case 'shared-code':case 'code-package':return '元の定義・共有部分';default:return 'サービス・補助構成';}
}
export function simpleUnitRelations(simple:ArchitectureSimple,id:string){
 const internal:SemanticEdge[]=[],external:SemanticEdge[]=[];
 for(const e of simple.original.edges){const from=simple.owners.get(e.source),to=simple.owners.get(e.target);if(from===id&&to===id)internal.push(e);else if(from===id||to===id)external.push(e);}
 return {internal,external};
}
export function simpleRelationCaption(e:Pick<SemanticEdge,'label'|'evidence'>){const at=e.evidence[0];return `${at?`${at.path.split('/').slice(-2).join('/')} · L${at.line}${at.endLine!==at.line?`–${at.endLine}`:''} · `:''}${e.label}`;}
