import type {SemanticGraph,SemanticNode,SemanticEdge} from './types';
import type {ArchitectureSimple,SimpleRelation,SimpleUnit} from './architectureSimple';
import {architectureEnvironmentContext} from './architectureContext';

/** Only folded start-script invocation is an annotation; preconditions and data flow remain lines. */
export function simpleReferenceEdges(graph:SemanticGraph,original:SemanticGraph,units:ReadonlyMap<string,SimpleUnit>,relations:ReadonlyMap<string,SimpleRelation>){
 const byId=new Map(original.nodes.map(n=>[n.id,n])),edges=new Map(original.edges.map(e=>[e.id,e])),shown=new Map(graph.nodes.map(n=>[n.id,n]));
 return graph.edges.filter(e=>e.kind==='flow-invokes'&&shown.get(e.source)?.architecture?.kind!=='tool-operation'&&shown.get(e.target)?.architecture?.kind==='tool-operation'&&(relations.get(e.id)?.edgeIds??[]).every(id=>{const raw=edges.get(id);return raw&&byId.get(raw.source)?.attributes.purpose==='script';})&&units.has(e.source));
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
