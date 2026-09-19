import type {SemanticEdge,SemanticGraph,SemanticNode} from './types';
import type {PreparedArchitectureScope} from './architectureProjection';
import {uniqueArchitectureEvidence} from './architectureEvidence';
import {simpleUsageIndex,simplePurposes,simplePurposeOrder} from './architectureSimpleUsage';
import {layoutSimpleArchitecture} from './architectureSimpleLayout';
import {architectureEnvironmentContext} from './architectureContext';
import {simpleUsageSummary} from './architectureSimpleSummary';
import {simpleStructuralGroups} from './architectureSimpleGroups';
import {simpleReferenceEdges,simpleArgumentLabel} from './architectureSimpleAnnotations';

export const SIMPLE_OVERVIEW='simple-overview';
export interface SimpleUnit {id:string;anchorId?:string;members:string[];internalEdges:string[];reason:string;role:'primary'|'support'|'context';targetIds:string[];purposes:string[]}
export interface SimpleRelation {kind:'direct'|'aggregate'|'path';edgeIds:string[];paths?:{edgeIds:string[];nodeIds:string[]}[]}
export interface ArchitectureSimple {graph:SemanticGraph;units:ReadonlyMap<string,SimpleUnit>;relations:ReadonlyMap<string,SimpleRelation>;owners:ReadonlyMap<string,string>;original:SemanticGraph;referenceEdges?:SemanticEdge[]}
const cache=new WeakMap<PreparedArchitectureScope,Map<boolean,ArchitectureSimple>>();
const key=(...values:unknown[])=>`architecture-simple:${JSON.stringify(values)}`;
const major=new Set(['application','component','shared-code','code-package','resource','external-service','external-program']);
const auxRole=(n:SemanticNode)=>n.architecture?.auxiliary?'test':n.attributes.compositionRole==='開発・検証・記録の補助'?'support':n.attributes.compositionRole==='補助の用途を示す表記（推定）'?'inferred':undefined;

/** Canonical membership first, semantic support second; never infer general reachability. */
export function architectureSimpleOverview(base:PreparedArchitectureScope,surroundings=true):ArchitectureSimple {
 let variants=cache.get(base);if(!variants){variants=new Map();cache.set(base,variants);}const old=variants.get(surroundings);if(old)return old;
 const original=base.model,{byId,adjacent,usages}=simpleUsageIndex(original),allowed=new Set(base.allowed.map(n=>n.id));
 const owners=new Map<string,string>(),units=new Map<string,SimpleUnit>(),representatives=new Map<string,SemanticNode>();
 const structuralGroups=simpleStructuralGroups(original,allowed);
 const isAnchor=(n:SemanticNode)=>major.has(n.architecture?.kind??'')&&(n.architecture?.kind!=='component'||!n.architecture.parentId||n.architecture.entryPaths.length>0||n.architecture.parentId===base.scopeId);
 const parentAnchor=(n:SemanticNode)=>{let id=n.architecture?.parentId;const seen=new Set<string>();while(id&&!seen.has(id)){seen.add(id);const p=byId.get(id);if(!p)break;if(allowed.has(id)&&isAnchor(p))return id;id=p.architecture?.parentId;}return undefined;};
 const privateToParent=(n:SemanticNode,parent:string)=>{if(n.architecture?.kind!=='shared-code')return true;const uses=(adjacent.get(n.id)??[]).filter(e=>e.target===n.id&&e.source!==n.id&&['code-reference','declaration-dependency'].includes(e.kind));return uses.length>0&&uses.every(e=>{const source=byId.get(e.source);return e.source===parent||source?.attributes.logicalOwnerId===parent||Boolean(source&&parentAnchor(source)===parent);});};
 const assign=(n:SemanticNode,id:string,reason:string,role:SimpleUnit['role'],anchorId?:string,label?:string,targetIds:string[]=[])=>{
  owners.set(n.id,id);let u=units.get(id);if(!u){u={id,anchorId,members:[],internalEdges:[],reason,role,targetIds,purposes:[]};units.set(id,u);representatives.set(id,label?{...n,label}:n);}u.members.push(n.id);
  const purpose=String(n.attributes.purpose??'');if(simplePurposeOrder.includes(purpose)&&!u.purposes.includes(purpose))u.purposes.push(purpose);
 };
 for(const n of base.allowed)if(isAnchor(n)){
  // An internal test component stays with its real app; only independently classified roots form auxiliary groups.
  const parent=parentAnchor(n);if(parent&&!['resource','external-service','external-program'].includes(n.architecture?.kind??'')&&n.architecture?.entryPaths.length===0&&n.architecture?.parentId!==base.scopeId&&privateToParent(n,parent))continue;
  const group=structuralGroups.get(n.id);if(group){assign(n,group.id,group.reason,group.category==='unconfirmed'?'context':'primary',undefined,group.label,group.targetIds);continue;}
  const role=auxRole(n);
  if(role&&!parent){assign(n,key('auxiliary-roots',role),'既存の用途判定に基づく独立した補助構成の集合','context',undefined,role==='inferred'?'記録・実験を支える構成（推定）':role==='test'?'テストを支える構成':'開発・検証を支える構成');}
  else assign(n,key('entity',n.id),'構成と、その内部・環境別の定義','code-package'===n.architecture?.kind?'context':'primary',n.id);
 }
 for(const n of base.allowed){if(owners.has(n.id))continue;
  const logicalOwner=typeof n.attributes.logicalOwnerId==='string'?n.attributes.logicalOwnerId:undefined,auxiliaryOwner=logicalOwner&&owners.get(logicalOwner);
  if(auxiliaryOwner&&units.get(auxiliaryOwner)?.role==='context'&&auxRole(byId.get(logicalOwner!)!)&&!['flow-starts','flow-deploys'].some(kind=>(adjacent.get(n.id)??[]).some(e=>e.target===n.id&&e.kind===kind&&byId.get(e.source)?.attributes.definitionOwnerId!==logicalOwner))){const home=units.get(auxiliaryOwner)!;assign(n,auxiliaryOwner,home.reason,'context');continue;}
  const group=structuralGroups.get(n.id);if(group){assign(n,group.id,group.reason,'primary',undefined,group.label,group.targetIds);continue;}
  if(!['component','execution-config','code-definition','shared-code'].includes(n.architecture?.kind??''))continue;
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
  if(incoming.length===1&&incoming[0]!.kind==='flow-generates'&&byId.get(incoming[0]!.source)?.attributes.purpose==='build'&&outgoing.length===1&&outgoing.every(e=>e.kind==='flow-input'&&usages.has(e.target))){const owner=owners.get(incoming[0]!.source);if(owner){const unit=units.get(owner)!;assign(n,owner,'生成する成果物を含むビルドの支援用途',unit.role);foldedArtifacts.set(n.id,{producer:incoming[0]!.source,edgeId:incoming[0]!.id});}}
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
  const reference=['code-reference','declaration-dependency','calls','callback','handles','registers-event'].includes(e.kind);
  const id=key('relation',source,target,folded?'artifact-path':reference?'reference':e.kind,e.confidence,e.details?.conditional??false,['flow-precedes','flow-invokes'].includes(e.kind)?e.label:'');
  const pathSources=folded?[...(adjacent.get(e.source)??[]).filter(item=>item.id===folded.edgeId),e]:[e],evidence=uniqueArchitectureEvidence(pathSources.flatMap(item=>item.evidence)),provenance=pathSources.flatMap(item=>item.provenance?.edges??[item]);
  const entry=relations.get(id),edgeIds=folded?[folded.edgeId,e.id]:[e.id],path=folded?{edgeIds,nodeIds:[folded.producer,e.source,e.target]}:undefined;
  if(entry){entry.edgeIds=[...new Set([...entry.edgeIds,...edgeIds])];entry.kind=entry.kind==='path'?'path':'aggregate';if(path)entry.paths!.push(path);const edge=edges.get(id)!;edge.evidence=uniqueArchitectureEvidence([...edge.evidence,...evidence]);edge.provenance!.edges.push(...provenance);if(edge.details?.environment!==e.details?.environment)edge.details={...edge.details,environment:undefined};}
  else {relations.set(id,{kind:folded?'path':e.provenance?.intermediateNodeIds?.length?'path':'direct',edgeIds,paths:path?[path]:undefined});edges.set(id,{...e,id,source,target,kind:folded?'simple-artifact-path':reference?'simple-reference':e.kind,evidence,label:folded?'ビルド成果物を渡す':reference?'参照・依存（種類は内訳）':e.label,provenance:{edges:provenance,intermediateNodeIds:folded?[e.source]:e.provenance?.intermediateNodeIds},details:{...e.details,reason:folded?'同じ成果物の生成と入力を短縮した経路。元の段階・環境・条件は内訳に保持':'元の関係を説明単位へ投影。実行順序を追加していません。'}});}
 }
 const within=(id:string)=>{if(!base.scopeId)return true;let node=byId.get(id);const seen=new Set<string>();while(node&&!seen.has(node.id)){if(node.id===base.scopeId)return true;seen.add(node.id);node=byId.get(node.architecture?.parentId??'');}return false;};
 const inside=new Set([...units].filter(([,u])=>u.members.some(within)).map(([id])=>id)),shown=new Set(inside);
 if(base.scopeId)for(const e of edges.values())if(inside.has(e.source)||inside.has(e.target)){shown.add(e.source);shown.add(e.target);}
 if(base.scopeId&&surroundings)for(const [id,u]of units)if(u.anchorId||structuralGroups.has(u.members[0]!))shown.add(id);
 const nodes:SemanticNode[]=[...units].filter(([id])=>shown.has(id)).map(([id,u])=>{const n=representatives.get(id)!,members=u.members.map(id=>byId.get(id)!),purpose=simplePurposeOrder.filter(p=>u.purposes.includes(p)).map(p=>simplePurposes[p]).join('・');
  const configurations=members.filter(m=>m.architecture?.kind==='execution-config'),relevant=u.role==='support'&&u.purposes.length?members.filter(m=>m.architecture?.kind==='tool-operation'&&m.attributes.purpose!=='script'):u.anchorId&&configurations.length?configurations:members.filter(m=>m.architecture?.kind!=='unresolved'&&m.attributes.purpose!=='script'),contexts=relevant.map(architectureEnvironmentContext),environments=[...new Set(contexts.flatMap(c=>c.environments))];
  const environmentLabels=[...new Set(contexts.map(c=>c.label))];
  return {...n,id,label:u.role==='support'&&purpose?`${n.label}：${purpose}`:n.label,confidence:members.some(n=>n.confidence==='unresolved')?'unresolved':members.some(n=>n.confidence==='inferred')||new Set(members.map(n=>n.confidence)).size>1?'inferred':n.confidence,evidence:uniqueArchitectureEvidence(members.flatMap(n=>n.evidence)),architecture:n.architecture?{...n.architecture,parentId:undefined,request:undefined,memberIds:[...u.members],environments}:undefined,attributes:{...n.attributes,sharedEnvironments:[],simpleEnvironmentLabel:environmentLabels.join(' / '),simpleEnvironmentMixed:environmentLabels.length>1,simpleOverview:true,simpleRole:u.role,simpleMemberIds:[...u.members],architectureContext:!inside.has(id),architecturePeripheral:!inside.has(id),architectureScopeRole:base.scopeId?(inside.has(id)?'inside':'surrounding'):'',simpleAnchorId:u.anchorId??''}};
 });
 for(const n of nodes){const u=units.get(n.id)!;
  const group=structuralGroups.get(u.members[0]!);n.attributes.simpleCategory=group?.category??'';
  if(group&&n.architecture)n.architecture.identity=undefined;
  if(group?.category==='destination'||group?.category==='runtime'||group?.category==='resources')n.attributes.simpleRows=u.members.map(id=>{const member=byId.get(id)!;return `${architectureEnvironmentContext(member).label}${member.attributes.executionPlace?` / ${member.attributes.executionPlace}`:''}：${member.attributes.providedContent??member.label}`;});
  n.attributes.simpleRegionId='';n.attributes.simpleRegionLabel='';
  n.attributes.simpleUsageSummary=simpleUsageSummary(u.members.map(id=>byId.get(id)!));
  if(u.purposes.includes('deploy')){const operations=u.members.filter(id=>byId.get(id)?.attributes.purpose==='deploy'),unresolved=operations.filter(id=>!(adjacent.get(id)??[]).some(e=>e.source===id&&e.kind==='flow-deploys'&&byId.get(e.target)?.architecture?.kind!=='unresolved'&&byId.has(e.target)));if(unresolved.length)n.attributes.simplePublicationNote=`公開先の構成が未解決：${unresolved.length}使用`;}
  if(n.architecture?.kind==='artifact'&&!u.members.some(id=>(adjacent.get(id)??[]).some(e=>e.source===id&&e.kind==='flow-input'&&byId.get(e.target)?.attributes.purpose==='deploy')))n.attributes.simplePublicationNote=original.nodes.some(item=>item.attributes.purpose==='deploy')?'この成果物を公開操作へ渡す関係は未確認':'公開操作は未検出';
  const databaseChange=u.role==='support'&&(u.purposes.some(p=>p==='generate'||p==='apply')||u.members.some(id=>['artifact','code-definition'].includes(byId.get(id)?.architecture?.kind??'')&&(adjacent.get(id)??[]).some(e=>['flow-input','flow-generates'].includes(e.kind)&&['generate','apply'].includes(usages.get(e.source===id?e.target:e.source)?.purpose??''))));
  n.attributes.simpleSupportPurpose=group?.category==='unconfirmed'?'実行用途未確認':databaseChange?'DB構造変更':n.architecture?.kind==='shared-code'?'共有コード':u.role==='context'?'補助・所属未判定':'';
  const kind=n.architecture?.kind??'';
  const arrival=u.members.some(id=>(adjacent.get(id)??[]).some(e=>e.target===id&&['flow-starts','flow-deploys','flow-applies'].includes(e.kind)))&&!['application','component','shared-code','code-definition'].includes(kind);
  n.attributes.simpleStage=group?.category==='destination'||group?.category==='runtime'||arrival?'arrival':kind==='artifact'?'artifact':u.role==='context'?'context':kind==='tool-operation'?'operation':['application','code-package','component','shared-code','code-definition'].includes(kind)?'source':'arrival';
  if(n.attributes.simpleStage==='source')u.reason='原本・定義と内部のコード。起動後の構成・公開先とは別の説明単位';
 }
 // Different uses must be distinguishable in both the canvas and the shared peer list.
 const sameNames=new Map<string,SemanticNode[]>();for(const n of nodes.filter(n=>n.architecture?.kind==='tool-operation')){const list=sameNames.get(n.label)??[];list.push(n);sameNames.set(n.label,list);}
 for(const list of sameNames.values())if(list.length>1)for(const n of list){const environment=String(n.attributes.simpleEnvironmentLabel),peers=list.filter(p=>p.attributes.simpleEnvironmentLabel===n.attributes.simpleEnvironmentLabel),args=String(n.attributes.usageArguments??'').trim();
  const outputCaption=(node:SemanticNode)=>[...new Set(units.get(node.id)!.members.flatMap(id=>(adjacent.get(id)??[]).filter(e=>e.source===id&&['flow-starts','flow-deploys','flow-generates','flow-applies'].includes(e.kind)).map(e=>{const target=byId.get(e.target);return target?String(target.attributes.outputPath??target.path??target.label):'対象未確認';})))].join(' / ');
  const context=peers.length>1?[args?simpleArgumentLabel(n,peers):'追加引数なし',new Set(peers.map(p=>p.attributes.configurationPath)).size>1?String(n.attributes.configurationPath??'設定未確認'):'',new Set(peers.map(p=>p.attributes.inputRoot)).size>1?String(n.attributes.inputRoot??'入力未確認'):'',new Set(peers.map(outputCaption)).size>1?`出力：${outputCaption(n)}`:'',new Set(peers.map(p=>p.attributes.configurationStatus)).size>1?String(n.attributes.configurationStatus??'設定確認状態不明'):''].filter(Boolean).join(' · '):'';
  n.label+=`（${[environment,context].filter(Boolean).join(' · ')}）`;n.attributes.simpleUsageDisambiguation=context;
 }
 const visibleEdges=[...edges.values()].filter(e=>shown.has(e.source)&&shown.has(e.target)),graph:SemanticGraph={view:'architecture-map',nodes,edges:visibleEdges};
 const referenceEdges=simpleReferenceEdges(graph,original,units,relations),referenceIds=new Set(referenceEdges.map(e=>e.id));graph.edges=visibleEdges.filter(e=>!referenceIds.has(e.id));
 for(const node of nodes){const references=referenceEdges.filter(e=>e.source===node.id||e.target===node.id);if(!references.length)continue;const ids=new Set(references.flatMap(e=>relations.get(e.id)?.edgeIds??[])),records=original.edges.filter(e=>ids.has(e.id)),invocations=records.filter(e=>e.kind==='flow-invokes').length,correspondences=records.filter(e=>e.kind!=='flow-invokes'),members=new Set(units.get(node.id)!.members);
  node.attributes.simpleReferenceCount=ids.size;node.attributes.simpleReferenceLabel=[invocations?`開始定義・呼出 ${invocations}関係`:'',correspondences.length?`原本対応 ${correspondences.length}関係`:''].filter(Boolean).join(' / ')+'（詳細）';
  node.attributes.simpleCorrespondenceSummary=[...new Set(correspondences.map(e=>{const source=byId.get(e.source)!,target=byId.get(e.target)!;return e.kind==='flow-serves'?members.has(e.source)?`配信対象：${target.label}`:`配信する構成：${source.label}`:e.kind==='flow-configures'?members.has(e.target)?`実行構成のコード：${source.label}`:`このコードを使う構成：${target.label}`:members.has(e.target)?`対応する原本：${source.label}`:`対応する構成：${target.label}`;}))];
 }
 const {positions,positions2d}=layoutSimpleArchitecture(graph);
 graph.architectureView={scopeId:base.scopeId,detailIds:nodes.filter(n=>inside.has(n.id)).map(n=>n.id),contextIds:nodes.filter(n=>!inside.has(n.id)).map(n=>n.id),peripheralIds:[],internalRelations:[],boundaryRelations:[],positions,positions2d,requestGroups:[],representedNodeIds:nodes.flatMap(n=>units.get(n.id)!.members),detailCount:inside.size,contextCount:nodes.length-inside.size,detailEntityCount:nodes.filter(n=>inside.has(n.id)).length,contextEntityCount:nodes.filter(n=>!inside.has(n.id)).length,requestCount:0,internalRecordCount:0,explicitNodeIds:[]};
 const result={graph,units,relations,owners,original,referenceEdges};variants.set(surroundings,result);return result;
}
