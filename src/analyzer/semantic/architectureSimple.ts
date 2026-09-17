import type {SemanticEdge,SemanticGraph,SemanticNode} from './types';
import type {PreparedArchitectureScope} from './architectureProjection';
import {uniqueArchitectureEvidence} from './architectureEvidence';


export const SIMPLE_OVERVIEW='simple-overview';
export interface SimpleUnit {id:string;anchorId?:string;members:string[];internalEdges:string[];reason:string}
export interface SimpleRelation {kind:'direct'|'aggregate';edgeIds:string[]}
export interface ArchitectureSimple {graph:SemanticGraph;units:ReadonlyMap<string,SimpleUnit>;relations:ReadonlyMap<string,SimpleRelation>;owners:ReadonlyMap<string,string>;original:SemanticGraph}
const cache=new WeakMap<PreparedArchitectureScope,Map<boolean,ArchitectureSimple>>();
const key=(...values:unknown[])=>`architecture-simple:${JSON.stringify(values)}`;
const major=new Set(['application','component','shared-code','code-package','resource','external-service','external-program']);
const operationIO=new Set(['flow-input','flow-starts','flow-deploys','flow-generates','flow-applies','flow-artifact','build-output','publishes-artifact']);
const purposes:Record<string,string>={start:'起動',serve:'開発配信',build:'ビルド',deploy:'公開',generate:'SQL生成',apply:'DB構造適用'};

/** Quotient of canonical membership, not a reachability graph. No invented multi-hop edges. */
export function architectureSimpleOverview(base:PreparedArchitectureScope,surroundings=true):ArchitectureSimple {
 let variants=cache.get(base);if(!variants){variants=new Map();cache.set(base,variants);}const old=variants.get(surroundings);if(old)return old;
 const original=base.model,byId=new Map(original.nodes.map(n=>[n.id,n])),allowed=new Set(base.allowed.map(n=>n.id));
 const owners=new Map<string,string>(),units=new Map<string,SimpleUnit>(),representatives=new Map<string,SemanticNode>();
 const adjacency=new Map<string,SemanticEdge[]>();for(const e of original.edges)for(const id of [e.source,e.target]){const list=adjacency.get(id)??[];list.push(e);adjacency.set(id,list);}
 const isAnchor=(n:SemanticNode)=>major.has(n.architecture?.kind??'')&&(n.architecture?.kind!=='component'||!n.architecture.parentId||n.architecture.entryPaths.length>0||n.architecture.parentId===base.scopeId);
 const logical=(n:SemanticNode)=>{const owner=n.attributes.logicalOwnerId;return typeof owner==='string'&&allowed.has(owner)&&major.has(byId.get(owner)?.architecture?.kind??'')?owner:undefined;};
 const parentAnchor=(n:SemanticNode)=>{let id=n.architecture?.parentId;const seen=new Set<string>();while(id&&!seen.has(id)){seen.add(id);const p=byId.get(id);if(!p)break;if(allowed.has(id)&&isAnchor(p))return id;id=p.architecture?.parentId;}return undefined;};
 const assign=(n:SemanticNode,id:string,reason:string,anchorId?:string,label?:string)=>{
  owners.set(n.id,id);let u=units.get(id);if(!u){u={id,anchorId,members:[],internalEdges:[],reason};units.set(id,u);representatives.set(id,label?{...n,label}:n);}u.members.push(n.id);
 };
 for(const n of base.allowed){const role=n.attributes.compositionRole;if(n.architecture?.auxiliary||role==='開発・検証・記録の補助'||role==='補助の用途を示す表記（推定）'){const type=n.architecture?.kind==='tool-operation'?'道具と起動設定':'構成';assign(n,key('auxiliary',role??'補助',type,n.architecture?.environments),'既存の用途判定に基づく補助構成の集合。各実体・使用は内訳で区別',undefined,`${type}の補助用途${role==='補助の用途を示す表記（推定）'?'（推定）':''}`);}}
 for(const n of base.allowed)if(!owners.has(n.id)&&isAnchor(n))assign(n,key('entity',n.id),'実際の構成要素と、その定義・環境別構成',n.id);
 for(const n of base.allowed){if(owners.has(n.id))continue;const kind=n.architecture?.kind,owner=logical(n);
  if(kind==='component'){const parent=parentAnchor(n);if(parent){assign(n,key('entity',parent),'実行主体に属する内部責務の内訳',parent);continue;}}
  if(owner&&(kind==='execution-config'||kind==='code-definition')){assign(n,key('entity',owner),'論理構成と、元IDを保持した環境別構成・定義',owner);continue;}
  if(kind==='tool-operation'&&n.attributes.purpose!=='script'){
   // Output IDs, input IDs, execution context and owner prevent unrelated uses merging.
   const targets=(adjacency.get(n.id)??[]).filter(e=>operationIO.has(e.kind)).map(e=>[e.kind,e.source===n.id?'out':'in',e.source===n.id?e.target:e.source]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
   const id=key('tool',n.attributes.dictionaryStackId??n.id,n.attributes.ownerPath??n.id,n.attributes.purpose,n.architecture?.environments,n.attributes.targetPlace,targets);
   const tool=n.label.split('：')[0];assign(n,id,'同じ所有・用途・環境・入出力を持つ道具の使用',undefined,`${tool}：${purposes[String(n.attributes.purpose)]??String(n.attributes.purpose??'用途未特定')}`);continue;
  }
 }
 for(const n of base.allowed){if(owners.has(n.id))continue;const parent=parentAnchor(n),kind=n.architecture?.kind;
  if(kind==='unresolved'){
   const rawOwner=n.architecture?.request?.ownerId??parent??n.id,owner=owners.get(rawOwner)??rawOwner;
   if(units.has(owner)){assign(n,owner,'構成と、その要求元に属する未特定要求の内訳');continue;}
   assign(n,key('requests',owner,n.architecture?.request?.kind??'unknown',n.architecture?.environments),'要求元・種類・環境が同じ未特定要求の集合',undefined,'接続先未特定の要求');continue;
  }
  if(kind==='tool-operation'&&n.attributes.purpose==='script'){
   const targets=(adjacency.get(n.id)??[]).filter(e=>e.source===n.id&&e.kind==='flow-invokes').map(e=>owners.get(e.target)).filter((id):id is string=>Boolean(id));
   const distinct=[...new Set(targets)];
   if(distinct.length===1){assign(n,distinct[0]!,'道具の使用と、それを呼ぶ開始script');continue;}
   const matching=base.allowed.filter(p=>major.has(p.architecture?.kind??'')&&(p.id===n.attributes.definitionOwnerId||typeof n.attributes.ownerPath==='string'&&p.architecture?.ownerPath===n.attributes.ownerPath));
   if(matching.length===1){assign(n,key('entity',matching[0]!.id),'構成と、その開始scriptの内訳',matching[0]!.id);continue;}
  }
  if(parent&&(kind==='code-definition'||kind==='execution-config')){assign(n,key('entity',parent),'所属で確認できる構成の内訳',parent);continue;}
  // Artifacts remain when they connect stages; unknown ownership is never guessed from a label.
  assign(n,key('remaining',kind,n.attributes.ownerPath??parent??n.id,kind==='artifact'?n.id:'',n.architecture?.environments),'未分類または独立して説明が必要な補助対象',undefined,kind==='artifact'||kind==='code-definition'?n.label:`${parent?byId.get(parent)?.label+'：':''}${kind==='tool-operation'?'起動設定':kind==='execution-config'?'実行構成':'補助構成'}`);
 }
 const relations=new Map<string,SimpleRelation>(),edges=new Map<string,SemanticEdge>();
 for(const e of original.edges){const source=owners.get(e.source),target=owners.get(e.target);if(!source||!target)continue;
  if(source===target){units.get(source)!.internalEdges.push(e.id);continue;}
  const id=key('relation',source,target,e.kind,e.confidence,e.details?.environment??'',e.details?.conditional??false,e.kind==='flow-precedes'||e.kind==='flow-invokes'?e.details?.contextId??e.id:'');
  const entry=relations.get(id);if(entry){entry.edgeIds.push(e.id);entry.kind='aggregate';const edge=edges.get(id)!;edge.evidence=uniqueArchitectureEvidence([...edge.evidence,...e.evidence]);edge.provenance!.edges.push(...(e.provenance?.edges??[e]));}
  else {relations.set(id,{kind:units.get(source)!.members.length===1&&units.get(target)!.members.length===1?'direct':'aggregate',edgeIds:[e.id]});edges.set(id,{...e,id,source,target,provenance:{edges:[...(e.provenance?.edges??[e])]},details:{...e.details,reason:'元の関係を保持し、所属する説明単位へ端点をまとめた表示。直接通信や連続実行を追加していません。'}});}
 }
 const within=(id:string)=>{if(!base.scopeId)return true;let node=byId.get(id);const seen=new Set<string>();while(node&&!seen.has(node.id)){if(node.id===base.scopeId)return true;seen.add(node.id);node=byId.get(node.architecture?.parentId??'');}return false;};
 const inside=new Set([...units].filter(([,u])=>u.members.some(within)).map(([id])=>id));
 const shown=new Set(inside);if(base.scopeId)for(const e of edges.values())if(inside.has(e.source)||inside.has(e.target)){shown.add(e.source);shown.add(e.target);}
 if(base.scopeId&&surroundings)for(const [id,u]of units)if(u.anchorId)shown.add(id);
 const nodes:SemanticNode[]=[...units].filter(([id])=>shown.has(id)).map(([id,u])=>{const n=representatives.get(id)!,members=u.members.map(id=>byId.get(id)!);return {...n,id,confidence:members.some(n=>n.confidence==='unresolved')?'unresolved':members.some(n=>n.confidence==='inferred')||new Set(members.map(n=>n.confidence)).size>1?'inferred':n.confidence,evidence:uniqueArchitectureEvidence(members.flatMap(n=>n.evidence)),architecture:n.architecture?{...n.architecture,parentId:undefined,request:undefined,memberIds:[...u.members]}:undefined,attributes:{...n.attributes,simpleOverview:true,simpleMemberIds:[...u.members],architectureContext:!inside.has(id),architecturePeripheral:!inside.has(id),architectureScopeRole:base.scopeId?(inside.has(id)?'inside':'surrounding'):'',simpleAnchorId:u.anchorId??''}};});
 const visibleEdges=[...edges.values()].filter(e=>shown.has(e.source)&&shown.has(e.target));
 const graph:SemanticGraph={view:'architecture-map',nodes,edges:visibleEdges};
 // Keep supporting uses close to a confirmed owner without modifying canonical hierarchy.
 const nodeById=new Map(nodes.map(n=>[n.id,n])),placed=new Set<string>(),ordered:SemanticNode[]=[];
 const put=(n:SemanticNode)=>{if(!placed.has(n.id)){placed.add(n.id);ordered.push(n);}};
 const degree=new Map(nodes.map(n=>[n.id,visibleEdges.filter(e=>e.source===n.id||e.target===n.id).length]));
 for(const n of nodes.filter(n=>units.get(n.id)?.anchorId).sort((a,b)=>Number(b.architecture?.kind==='application')-Number(a.architecture?.kind==='application')||(degree.get(b.id)!-degree.get(a.id)!)||a.id.localeCompare(b.id))){put(n);for(const e of visibleEdges){const other=e.source===n.id?e.target:e.target===n.id?e.source:undefined;if(other&&nodeById.has(other)&&!units.get(other)?.anchorId)put(nodeById.get(other)!);}}
 for(const n of nodes)put(n);
 const columns=Math.max(1,Math.ceil(Math.sqrt(ordered.length*1.5))),positions2d=new Map(ordered.map((n,i)=>[n.id,{x:(i%columns)*310,y:Math.floor(i/columns)*160,z:0}]));
 const positions=new Map(ordered.map((n,i)=>[n.id,{x:(i%columns)*180,y:Math.floor(i/columns)*110,z:n.architecture?.kind==='tool-operation'?-100:n.architecture?.kind==='resource'||n.architecture?.kind==='external-service'?100:0}]));
 graph.architectureView={scopeId:base.scopeId,detailIds:nodes.filter(n=>inside.has(n.id)).map(n=>n.id),contextIds:nodes.filter(n=>!inside.has(n.id)).map(n=>n.id),peripheralIds:[],internalRelations:[],boundaryRelations:[],positions,positions2d,requestGroups:[],representedNodeIds:nodes.flatMap(n=>units.get(n.id)!.members),detailCount:inside.size,contextCount:nodes.length-inside.size,detailEntityCount:nodes.filter(n=>inside.has(n.id)).length,contextEntityCount:nodes.filter(n=>!inside.has(n.id)).length,requestCount:0,internalRecordCount:0,explicitNodeIds:[]};
 const result={graph,units,relations,owners,original};variants.set(surroundings,result);return result;
}
