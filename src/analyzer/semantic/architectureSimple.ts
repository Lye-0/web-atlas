import type {SemanticEdge,SemanticGraph,SemanticNode} from './types';
import type {PreparedArchitectureScope} from './architectureProjection';
import {uniqueArchitectureEvidence} from './architectureEvidence';
import {simpleUsageIndex,simplePurposes,simplePurposeOrder} from './architectureSimpleUsage';
import {layoutSimpleArchitecture} from './architectureSimpleLayout';
import {architectureEnvironmentContext} from './architectureContext';
import {simpleUsageSummary} from './architectureSimpleSummary';

export const SIMPLE_OVERVIEW='simple-overview';
export interface SimpleUnit {id:string;anchorId?:string;members:string[];internalEdges:string[];reason:string;role:'primary'|'support'|'context';targetIds:string[];purposes:string[]}
export interface SimpleRelation {kind:'direct'|'aggregate'|'path';edgeIds:string[];paths?:{edgeIds:string[];nodeIds:string[]}[]}
export interface ArchitectureSimple {graph:SemanticGraph;units:ReadonlyMap<string,SimpleUnit>;relations:ReadonlyMap<string,SimpleRelation>;owners:ReadonlyMap<string,string>;original:SemanticGraph}
const cache=new WeakMap<PreparedArchitectureScope,Map<boolean,ArchitectureSimple>>();
const key=(...values:unknown[])=>`architecture-simple:${JSON.stringify(values)}`;
const major=new Set(['application','component','shared-code','code-package','resource','external-service','external-program']);
const auxRole=(n:SemanticNode)=>n.architecture?.auxiliary?'test':n.attributes.compositionRole==='開発・検証・記録の補助'?'support':n.attributes.compositionRole==='補助の用途を示す表記（推定）'?'inferred':undefined;

/** Canonical membership first, semantic support second; never infer general reachability. */
export function architectureSimpleOverview(base:PreparedArchitectureScope,surroundings=true):ArchitectureSimple {
 let variants=cache.get(base);if(!variants){variants=new Map();cache.set(base,variants);}const old=variants.get(surroundings);if(old)return old;
 const original=base.model,{byId,adjacent,usages}=simpleUsageIndex(original),allowed=new Set(base.allowed.map(n=>n.id));
 const owners=new Map<string,string>(),units=new Map<string,SimpleUnit>(),representatives=new Map<string,SemanticNode>();
 const isAnchor=(n:SemanticNode)=>major.has(n.architecture?.kind??'')&&(n.architecture?.kind!=='component'||!n.architecture.parentId||n.architecture.entryPaths.length>0||n.architecture.parentId===base.scopeId);
 const parentAnchor=(n:SemanticNode)=>{let id=n.architecture?.parentId;const seen=new Set<string>();while(id&&!seen.has(id)){seen.add(id);const p=byId.get(id);if(!p)break;if(allowed.has(id)&&isAnchor(p))return id;id=p.architecture?.parentId;}return undefined;};
 const assign=(n:SemanticNode,id:string,reason:string,role:SimpleUnit['role'],anchorId?:string,label?:string,targetIds:string[]=[])=>{
  owners.set(n.id,id);let u=units.get(id);if(!u){u={id,anchorId,members:[],internalEdges:[],reason,role,targetIds,purposes:[]};units.set(id,u);representatives.set(id,label?{...n,label}:n);}u.members.push(n.id);
  const purpose=String(n.attributes.purpose??'');if(simplePurposeOrder.includes(purpose)&&!u.purposes.includes(purpose))u.purposes.push(purpose);
 };
 for(const n of base.allowed)if(isAnchor(n)){
  // An internal test component stays with its real app; only independently classified roots form auxiliary groups.
  const parent=parentAnchor(n);if(parent&&n.architecture?.entryPaths.length===0&&n.architecture?.parentId!==base.scopeId)continue;
  const role=auxRole(n);
  if(role&&!parent){assign(n,key('auxiliary-roots',role),'既存の用途判定に基づく独立した補助構成の集合','context',undefined,role==='inferred'?'記録・実験を支える構成（推定）':role==='test'?'テストを支える構成':'開発・検証を支える構成');}
  else assign(n,key('entity',n.id),'構成と、その内部・環境別の定義','code-package'===n.architecture?.kind?'context':'primary',n.id);
 }
 for(const n of base.allowed){if(owners.has(n.id)||!['component','execution-config','code-definition'].includes(n.architecture?.kind??''))continue;
  const logical=n.attributes.logicalOwnerId,parent=typeof logical==='string'&&allowed.has(logical)&&owners.has(logical)?logical:parentAnchor(n),owner=parent&&owners.get(parent);
  if(owner){const unit=units.get(owner)!;assign(n,owner,unit.reason,unit.role,unit.anchorId);}
 }
 for(const n of base.allowed){const usage=usages.get(n.id);if(owners.has(n.id)||!usage)continue;
  const definition=String(n.attributes.definitionOwnerId??''),owner=owners.get(definition);
  if(owner&&units.get(owner)?.role==='context'&&auxRole(byId.get(definition)!)){const unit=units.get(owner)!;assign(n,owner,unit.reason,'context');continue;}
  const targets=usage.targets.filter(id=>allowed.has(id));
  const id=usage.resolved?key('usage',usage.tool,targets,usage.family,usage.context):key('usage-unresolved',n.id);
  assign(n,id,targets.length?'解決済みの対象を支える道具の使用。個々の環境・scriptは内訳で区別':'操作の対象が未特定の使用','support',undefined,n.label.split('：')[0],targets);
 }
 // Inputs/outputs that merely connect a unique producing use to consuming uses become a finite two-stage path.
 const foldedArtifacts=new Map<string,{producer:string;edgeId:string}>();
 for(const n of base.allowed){if(owners.has(n.id)||n.architecture?.kind!=='artifact')continue;const edges=adjacent.get(n.id)??[],incoming=edges.filter(e=>e.target===n.id),outgoing=edges.filter(e=>e.source===n.id);
  if(incoming.length===1&&incoming[0]!.kind==='flow-generates'&&byId.get(incoming[0]!.source)?.attributes.purpose==='build'&&outgoing.length&&outgoing.every(e=>e.kind==='flow-input'&&usages.has(e.target))){const owner=owners.get(incoming[0]!.source);if(owner){const unit=units.get(owner)!;assign(n,owner,'生成する成果物を含むビルドの支援用途',unit.role);foldedArtifacts.set(n.id,{producer:incoming[0]!.source,edgeId:incoming[0]!.id});}}
 }
 for(const n of base.allowed){if(owners.has(n.id))continue;const kind=n.architecture?.kind;
  if(kind==='unresolved'){
   const requestOwner=n.architecture?.request?.ownerId??parentAnchor(n),owner=requestOwner&&owners.get(requestOwner);
   if(owner){const unit=units.get(owner)!;assign(n,owner,unit.reason,unit.role,unit.anchorId);continue;}
   assign(n,key('requests',requestOwner??n.id,n.architecture?.request?.kind),'要求元を保持した、接続先が未特定の要求','context',undefined,`${byId.get(requestOwner??'')?.label??'所属未判定'}の未特定要求`);continue;
  }
  if(kind==='tool-operation'&&n.attributes.purpose==='script'){
   const calls=(adjacent.get(n.id)??[]).filter(e=>e.source===n.id&&e.kind==='flow-invokes'),targets=[...new Set(calls.map(e=>owners.get(e.target)).filter((id):id is string=>Boolean(id)))];
   const definition=typeof n.attributes.definitionOwnerId==='string'?owners.get(n.attributes.definitionOwnerId):undefined;
   const owner=targets.length===1&&calls.every(e=>owners.has(e.target))?targets[0]:definition;
   if(owner){const unit=units.get(owner)!;assign(n,owner,unit.reason,unit.role,unit.anchorId);continue;}
  }
  const supportTargets=['artifact','code-definition','execution-config'].includes(kind??'')?[...new Set((adjacent.get(n.id)??[]).flatMap(e=>usages.get(e.source===n.id?e.target:e.source)?.targets??[]))]:[];
  assign(n,key('unassigned',n.id),supportTargets.length?'元の操作との関係で確認できる入力・成果物・実行構成':'所属または使用先の対応が未特定。元の対象を保持',supportTargets.length?'support':'context',undefined,n.label,supportTargets);
 }
 // Folded artifacts no longer need a separate card; preserve every canonical edge and its direction in the trace.
 const relations=new Map<string,SimpleRelation>(),edges=new Map<string,SemanticEdge>();
 for(const e of original.edges){const source=owners.get(e.source),target=owners.get(e.target);if(!source||!target)continue;
  if(source===target){units.get(source)!.internalEdges.push(e.id);continue;}
  const folded=e.kind==='flow-input'?foldedArtifacts.get(e.source):undefined;
  const id=key('relation',source,target,folded?'artifact-path':e.kind,e.confidence,e.details?.conditional??false,['flow-precedes','flow-invokes'].includes(e.kind)?e.label:'');
  const pathSources=folded?[...(adjacent.get(e.source)??[]).filter(item=>item.id===folded.edgeId),e]:[e],evidence=uniqueArchitectureEvidence(pathSources.flatMap(item=>item.evidence)),provenance=pathSources.flatMap(item=>item.provenance?.edges??[item]);
  const entry=relations.get(id),edgeIds=folded?[folded.edgeId,e.id]:[e.id],path=folded?{edgeIds,nodeIds:[folded.producer,e.source,e.target]}:undefined;
  if(entry){entry.edgeIds=[...new Set([...entry.edgeIds,...edgeIds])];entry.kind=entry.kind==='path'?'path':'aggregate';if(path)entry.paths!.push(path);const edge=edges.get(id)!;edge.evidence=uniqueArchitectureEvidence([...edge.evidence,...evidence]);edge.provenance!.edges.push(...provenance);if(edge.details?.environment!==e.details?.environment)edge.details={...edge.details,environment:undefined};}
  else {relations.set(id,{kind:folded?'path':e.provenance?.intermediateNodeIds?.length?'path':'direct',edgeIds,paths:path?[path]:undefined});edges.set(id,{...e,id,source,target,kind:folded?'simple-artifact-path':e.kind,evidence,label:folded?'ビルド成果物を渡す':e.label,provenance:{edges:provenance,intermediateNodeIds:folded?[e.source]:e.provenance?.intermediateNodeIds},details:{...e.details,reason:folded?'同じ成果物の生成と入力を短縮した経路。元の段階・環境・条件は内訳に保持':'元の関係を説明単位へ投影。実行順序を追加していません。'}});}
 }
 const within=(id:string)=>{if(!base.scopeId)return true;let node=byId.get(id);const seen=new Set<string>();while(node&&!seen.has(node.id)){if(node.id===base.scopeId)return true;seen.add(node.id);node=byId.get(node.architecture?.parentId??'');}return false;};
 const inside=new Set([...units].filter(([,u])=>u.members.some(within)).map(([id])=>id)),shown=new Set(inside);
 if(base.scopeId)for(const e of edges.values())if(inside.has(e.source)||inside.has(e.target)){shown.add(e.source);shown.add(e.target);}
 if(base.scopeId&&surroundings)for(const [id,u]of units)if(u.anchorId)shown.add(id);
 const nodes:SemanticNode[]=[...units].filter(([id])=>shown.has(id)).map(([id,u])=>{const n=representatives.get(id)!,members=u.members.map(id=>byId.get(id)!),purpose=simplePurposeOrder.filter(p=>u.purposes.includes(p)).map(p=>simplePurposes[p]).join('・');
  const configurations=members.filter(m=>m.architecture?.kind==='execution-config'),relevant=u.role==='support'&&u.purposes.length?members.filter(m=>m.architecture?.kind==='tool-operation'&&m.attributes.purpose!=='script'):u.anchorId&&configurations.length?configurations:members.filter(m=>m.architecture?.kind!=='unresolved'&&m.attributes.purpose!=='script'),contexts=relevant.map(architectureEnvironmentContext),environments=[...new Set(contexts.flatMap(c=>c.environments))];
  const environmentLabels=[...new Set(contexts.map(c=>c.label))];
  return {...n,id,label:u.role==='support'&&purpose?`${n.label}：${purpose}`:n.label,confidence:members.some(n=>n.confidence==='unresolved')?'unresolved':members.some(n=>n.confidence==='inferred')||new Set(members.map(n=>n.confidence)).size>1?'inferred':n.confidence,evidence:uniqueArchitectureEvidence(members.flatMap(n=>n.evidence)),architecture:n.architecture?{...n.architecture,parentId:undefined,request:undefined,memberIds:[...u.members],environments}:undefined,attributes:{...n.attributes,sharedEnvironments:[],simpleEnvironmentLabel:environmentLabels.join(' / '),simpleEnvironmentMixed:environmentLabels.length>1,simpleOverview:true,simpleRole:u.role,simpleMemberIds:[...u.members],architectureContext:!inside.has(id),architecturePeripheral:!inside.has(id),architectureScopeRole:base.scopeId?(inside.has(id)?'inside':'surrounding'):'',simpleAnchorId:u.anchorId??''}};
 });
 const dedicated=new Map<string,SemanticNode[]>();
 for(const n of nodes){const u=units.get(n.id)!,targets=[...new Set(u.targetIds.map(id=>owners.get(id)).filter((id):id is string=>Boolean(id)))];
  n.attributes.simpleRegionId='';n.attributes.simpleRegionLabel='';
  n.attributes.simpleUsageSummary=simpleUsageSummary(u.members.map(id=>byId.get(id)!));
  const databaseChange=u.role==='support'&&(u.purposes.some(p=>p==='generate'||p==='apply')||u.members.some(id=>['artifact','code-definition'].includes(byId.get(id)?.architecture?.kind??'')&&(adjacent.get(id)??[]).some(e=>['flow-input','flow-generates'].includes(e.kind)&&['generate','apply'].includes(usages.get(e.source===id?e.target:e.source)?.purpose??''))));
  n.attributes.simpleSupportPurpose=databaseChange?'DB構造変更':n.architecture?.kind==='shared-code'?'共有コード':u.role==='context'?'補助・所属未判定':'';
  if(u.role==='support'&&u.purposes.length&&targets.length===1&&nodes.find(item=>item.id===targets[0])?.architecture?.kind==='application'){
   const list=dedicated.get(targets[0]!)??[];list.push(n);dedicated.set(targets[0]!,list);
  }
 }
 for(const [id,supports]of dedicated){const app=nodes.find(n=>n.id===id)!;for(const n of [app,...supports]){n.attributes.simpleRegionId=id;n.attributes.simpleRegionLabel=`${app.label} の支援`;}}
 const visibleEdges=[...edges.values()].filter(e=>shown.has(e.source)&&shown.has(e.target)),graph:SemanticGraph={view:'architecture-map',nodes,edges:visibleEdges};
 const {positions,positions2d}=layoutSimpleArchitecture(graph,units,owners);
 graph.architectureView={scopeId:base.scopeId,detailIds:nodes.filter(n=>inside.has(n.id)).map(n=>n.id),contextIds:nodes.filter(n=>!inside.has(n.id)).map(n=>n.id),peripheralIds:[],internalRelations:[],boundaryRelations:[],positions,positions2d,requestGroups:[],representedNodeIds:nodes.flatMap(n=>units.get(n.id)!.members),detailCount:inside.size,contextCount:nodes.length-inside.size,detailEntityCount:nodes.filter(n=>inside.has(n.id)).length,contextEntityCount:nodes.filter(n=>!inside.has(n.id)).length,requestCount:0,internalRecordCount:0,explicitNodeIds:[]};
 const result={graph,units,relations,owners,original};variants.set(surroundings,result);return result;
}
