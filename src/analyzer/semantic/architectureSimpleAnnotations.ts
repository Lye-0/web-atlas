import type {SemanticGraph,SemanticNode,SemanticEdge} from './types';
import type {ArchitectureSimple,SimpleRelation,SimpleUnit} from './architectureSimple';
import {architectureEnvironmentContext} from './architectureContext';

export const simpleCorrespondenceKinds=new Set(['flow-definition','flow-configures','flow-serves']);
/** Recorded owner/source correspondence, never inferred from an alternative route. */
export function isSimpleCorrespondence(edge:SemanticEdge,byId:ReadonlyMap<string,SemanticNode>){
 const source=byId.get(edge.source),target=byId.get(edge.target);if(!source||!target||!edge.evidence.length)return false;
 const pending=[edge],seen=new Set<SemanticEdge>();for(let i=0;i<pending.length;i++){const e=pending[i]!;if(seen.has(e))continue;seen.add(e);if(!simpleCorrespondenceKinds.has(e.kind))return false;pending.push(...(e.provenance?.edges??[]) as SemanticEdge[]);}
 if(edge.kind==='flow-definition')return edge.details?.structural===true&&target.attributes.logicalOwnerId===source.id&&['execution-config','code-definition'].includes(target.architecture?.kind??'');
 if(edge.kind==='flow-configures')return edge.details?.structural===true&&source.architecture?.kind==='code-definition'&&target.architecture?.kind==='execution-config'&&typeof source.attributes.logicalOwnerId==='string'&&source.attributes.logicalOwnerId===target.attributes.logicalOwnerId;
 return edge.kind==='flow-serves'&&edge.details?.architectureOrigin==='architecture'&&source.architecture?.kind==='execution-config'&&source.attributes.logicalOwnerId===target.id&&target.architecture?.kind==='application';
}
/** Folded invocation and verified correspondence become annotations; operations and use stay lines. */
export function simpleReferenceEdges(graph:SemanticGraph,original:SemanticGraph,units:ReadonlyMap<string,SimpleUnit>,relations:ReadonlyMap<string,SimpleRelation>){
 const byId=new Map(original.nodes.map(n=>[n.id,n])),edges=new Map(original.edges.map(e=>[e.id,e])),shown=new Map(graph.nodes.map(n=>[n.id,n]));
 return graph.edges.filter(e=>{const originals=(relations.get(e.id)?.edgeIds??[]).map(id=>edges.get(id));if(!originals.length||originals.some(e=>!e))return false;
  return originals.every(raw=>isSimpleCorrespondence(raw!,byId))||e.kind==='flow-invokes'&&shown.get(e.source)?.architecture?.kind!=='tool-operation'&&shown.get(e.target)?.architecture?.kind==='tool-operation'&&originals.every(raw=>byId.get(raw!.source)?.attributes.purpose==='script')&&units.has(e.source);
 });
}
export function simpleResourceEndpoints(simple:ArchitectureSimple,edge:SemanticEdge){
 const rawIds=new Set(simple.relations.get(edge.id)?.edgeIds??[]),byId=new Map(simple.original.nodes.map(n=>[n.id,n])),groups=new Map<string,{node:SemanticNode;members:SemanticNode[];edgeIds:string[]}>();
 for(const raw of simple.original.edges){if(!rawIds.has(raw.id))continue;for(const id of new Set([raw.source,raw.target])){const owner=simple.owners.get(id),node=simple.graph.nodes.find(n=>n.id===owner);if(node?.attributes.simpleCategory!=='resources')continue;const group=groups.get(node.id)??{node,members:[],edgeIds:[]},member=byId.get(id);if(member&&!group.members.some(n=>n.id===id))group.members.push(member);group.edgeIds.push(raw.id);groups.set(node.id,group);}}
 return [...groups.values()].map(group=>({...group,edgeIds:[...new Set(group.edgeIds)],labels:group.members.map(simpleResourceMemberLabel)}));
}
export function simpleResourceMemberLabel(n:SemanticNode){return [architectureEnvironmentContext(n).label,n.attributes.executionPlace,n.label].filter(Boolean).join(' / ');}

/** A compact discriminator, not a normalizer of effective command semantics. */
export function simpleArgumentLabel(n:SemanticNode,peers:SemanticNode[]){
 const args=String(n.attributes.usageArguments??'').trim();if(!args)return '追加引数なし';
 const parse=(text:string)=>new Map([...text.matchAll(/(?:^|\s)--([\w-]+)(?:[=\s]+("[^"]*"|'[^']*'|[^\s-][^\s]*))?/g)].map(m=>[m[1]!,m[2]??'']));
 const flags=parse(args),others=peers.filter(p=>p!==n).map(p=>parse(String(p.attributes.usageArguments??'')));
 const different=[...flags].filter(([key,value])=>others.some(other=>!other.has(key)||other.get(key)!==value)).sort(([a],[b])=>a.localeCompare(b));
 const unique=different.find(([key,value])=>others.every(other=>!other.has(key)||other.get(key)!==value));
 const selected=unique?[unique]:different;
 if(selected.length)return selected.map(([key,value])=>others.some(other=>other.has(key))&&value?`${key}=${value}`:`${key}指定あり`).join('・');
 const otherTokens=peers.filter(p=>p!==n).map(p=>String(p.attributes.usageArguments??'').split(/\s+/));
 const distinct=args.split(/\s+/).filter(token=>otherTokens.some(tokens=>!tokens.includes(token)));
 return distinct.length?`引数：${distinct.join(' ')}`:'引数指定あり';
}
