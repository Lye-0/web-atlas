import './architecture-detail.css';
import './architecture-simple.css';
import {useMemo,useState,type ReactNode} from 'react';
import type {ArchitectureSimple} from '../../analyzer/semantic/architectureSimple';
import {architectureEnvironmentContext} from '../../analyzer/semantic/architectureContext';
import {simpleMemberCaption,simplePurposes} from '../../analyzer/semantic/architectureSimpleUsage';
import {confidenceLabels,type SemanticNode,type SemanticEdge} from '../../analyzer/semantic/types';
import {architectureRelationLabel} from '../../analyzer/semantic/architectureRelations';
import {ArchitectureEvidenceList} from './ArchitectureEvidence';
import {simpleEvidenceKey,simpleMemberGroup,simpleRelationCaption,simpleRelationGroups,simpleUnitRelations} from './architectureSimpleDetails';

function Disclosure({title,children,initial=false}:{title:string;children:()=>ReactNode;initial?:boolean}){
 const [open,setOpen]=useState(initial);
 return <details className="analyzer-detail-accordion" open={open} onToggle={e=>setOpen(e.currentTarget.open)}><summary>{title}</summary>{open&&<div className="analyzer-detail-accordion-body">{children()}</div>}</details>;
}
function Diagnostic({ids}:{ids:string[]}){const [status,setStatus]=useState('');return <Disclosure title="診断情報／元ID">{()=> <><pre>{ids.join('\n')}</pre><button onClick={async()=>{try{await navigator.clipboard.writeText(ids.join('\n'));setStatus('コピーしました');}catch{setStatus('選択してコピーできます');}}}>元IDをコピー</button><span role="status">{status}</span></>}</Disclosure>;}
function RelationEntry({edge,sources,onShowRelation}:{edge:SemanticEdge;sources:Record<string,string>;onShowRelation?:(id:string)=>void}){
 const parentKeys=new Set(edge.evidence.map(simpleEvidenceKey)),originals=edge.provenance?.edges.filter(e=>e.id!==edge.id)??[];
 const [limit,setLimit]=useState(20);
 return <Disclosure title={simpleRelationCaption(edge)}>{()=> <>
  <p>{edge.details?.reason||`${architectureRelationLabel(edge)}の記述`} · {confidenceLabels[edge.confidence]}</p>
  {onShowRelation&&<button onClick={()=>onShowRelation(edge.id)}>全体でこの関係を詳しく見る</button>}
  <ArchitectureEvidenceList evidence={edge.evidence} sources={sources}/>
  {originals.length>0&&<Disclosure title={`元解析との対応：${originals.length}件`}>{()=> <>{originals.slice(0,limit).map((e,i)=>{const additional=e.evidence.filter(item=>!parentKeys.has(simpleEvidenceKey(item))),shared=e.evidence.length-additional.length;return <Disclosure key={`${e.id}:${i}`} title={simpleRelationCaption(e)}>{()=> <><p>{e.details?.reason??e.label} · {confidenceLabels[e.confidence]}</p>{shared>0&&<p>上記と共通の根拠：{shared}件</p>}<ArchitectureEvidenceList evidence={additional} sources={sources}/><Diagnostic ids={[e.id,e.source,e.target]}/></>}</Disclosure>;})}{originals.length>limit&&<button onClick={()=>setLimit(limit+20)}>元解析の対応をさらに表示</button>}</>}</Disclosure>}
  <Diagnostic ids={[edge.id,edge.source,edge.target,...edge.provenance?.intermediateNodeIds??[]]}/>
 </>}</Disclosure>;
}
function RelationList({edges,nodes,sources,onShowRelation}:{edges:SemanticEdge[];nodes:ReadonlyMap<string,SemanticNode>;sources:Record<string,string>;onShowRelation?:(id:string)=>void}){
 const [query,setQuery]=useState(''),[limit,setLimit]=useState(20),[groupLimit,setGroupLimit]=useState(20);
 const filtered=useMemo(()=>edges.filter(e=>!query||`${simpleRelationCaption(e)} ${nodes.get(e.source)?.label} ${nodes.get(e.target)?.label} ${e.details?.environment??''}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())),[edges,nodes,query]);
 const groups=useMemo(()=>simpleRelationGroups(filtered,nodes),[filtered,nodes]);
 return <><label className="simple-detail-search">関係を検索<input type="search" value={query} onChange={e=>{setQuery(e.target.value);setLimit(20);setGroupLimit(20);}} placeholder="ファイル・行・相手・種類"/></label><p>{new Set(filtered.map(e=>e.id)).size}元関係 · {groups.length}グループ</p>{groups.slice(0,groupLimit).map(g=><Disclosure key={g.id} title={`${g.label}：${g.edges.length}件`}>{()=> <>{g.edges.slice(0,limit).map(e=><RelationEntry key={e.id} edge={e} sources={sources} onShowRelation={onShowRelation}/>)}{g.edges.length>limit&&<button onClick={()=>setLimit(limit+30)}>個別関係をさらに表示（残り{g.edges.length-limit}件）</button>}</>}</Disclosure>)}{groups.length>groupLimit&&<button onClick={()=>setGroupLimit(groupLimit+20)}>相手・種類をさらに表示</button>}</>;
}
function Members({members,onShowAll}:{members:SemanticNode[];onShowAll:(id:string)=>void}){
 const [query,setQuery]=useState(''),[limit,setLimit]=useState(20);
 const shown=members.filter(n=>!query||`${n.label} ${simpleMemberCaption(n)}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
 return <><label className="simple-detail-search">内訳を検索<input type="search" value={query} onChange={e=>{setQuery(e.target.value);setLimit(20);}} placeholder="名前・script・式・ファイル"/></label>{shown.slice(0,limit).map(n=><div className="architecture-simple-member" key={n.id}><strong>{n.label}{n.attributes.scriptName?` · ${n.attributes.scriptName}`:''}</strong><p>{architectureEnvironmentContext(n).label} · {confidenceLabels[n.confidence]}</p><p className="simple-member-caption">{simpleMemberCaption(n)}</p><button onClick={()=>onShowAll(n.id)}>全体で詳しく見る：{n.label}{n.attributes.scriptName?`（${n.attributes.scriptName}）`:''}</button><Diagnostic ids={[n.id]}/></div>)}{shown.length>limit&&<button onClick={()=>setLimit(limit+20)}>内訳をさらに表示（残り{shown.length-limit}件）</button>}{!shown.length&&<p>一致する内訳はありません</p>}</>;
}
export function ArchitectureSimpleDetail({simple,node,edge,sources,onShowAll,onOpen,canOpen,onClose,onSelectSummary,onShowRelation,query=''}:{simple:ArchitectureSimple;node?:SemanticNode;edge?:SemanticEdge;sources:Record<string,string>;onShowAll:(id:string)=>void;onOpen:(id:string)=>void;canOpen:(id:string)=>boolean;onClose:()=>void;onSelectSummary?:(id:string)=>void;onShowRelation?:(id:string)=>void;query?:string}){
 const unit=node&&simple.units.get(node.id),relation=edge&&simple.relations.get(edge.id),[peerLimit,setPeerLimit]=useState(6);
 const nodes=useMemo(()=>new Map(simple.original.nodes.map(n=>[n.id,n])),[simple.original]);
 const edges=useMemo(()=>{const ids=new Set(relation?.edgeIds??[]);return simple.original.edges.filter(e=>ids.has(e.id));},[relation,simple.original]);
 const members=useMemo(()=>{const ids=new Set(unit?.members??[]);if(edge)for(const e of edges){ids.add(e.source);ids.add(e.target);}return [...ids].map(id=>nodes.get(id)).filter((n):n is SemanticNode=>Boolean(n));},[unit,edge,edges,nodes]);
 const inventory=useMemo(()=>unit?simpleUnitRelations(simple,unit.id):{internal:[],external:edges},[simple,unit,edges]);
 const groups=useMemo(()=>{const result=new Map<string,SemanticNode[]>();for(const n of members){const group=simpleMemberGroup(n),list=result.get(group)??[];list.push(n);result.set(group,list);}const order=['内部構成','環境別の構成','道具・開始script','入力・成果物','接続先が未特定の要求','サービス・補助構成','元の定義・共有部分'];return [...result].sort(([a],[b])=>order.indexOf(a)-order.indexOf(b));},[members]);
 const tools=node?[...simple.units.values()].filter(u=>u.role==='support'&&u.targetIds.some(id=>simple.owners.get(id)===node.id)):[];
 const peers=useMemo(()=>{const result=new Map<string,{id:string;labels:Set<string>}>();if(!node)return[];for(const e of inventory.external){const id=simple.owners.get(e.source)===node.id?simple.owners.get(e.target):simple.owners.get(e.source);if(!id||unit?.role==='primary'&&simple.units.get(id)?.role==='support')continue;const p=result.get(id)??{id,labels:new Set()};p.labels.add(architectureRelationLabel(e));result.set(id,p);}return [...result.values()];},[simple,node,unit,inventory.external]);
 const title=(id:string)=>simple.graph.nodes.find(n=>n.id===id)?.label??nodes.get(simple.units.get(id)?.anchorId??'')?.label??'現在の図では省略した構成';
 const original=unit?.anchorId?nodes.get(unit.anchorId):undefined;
 const roles=[...new Set((original?.architecture?.roles??[]).map(r=>r.label).filter(r=>!r.includes('未判定')))];
 const peerTitle=(id:string)=>{const n=simple.graph.nodes.find(n=>n.id===id),label=title(id);if(!n||!['resource','external-service'].includes(n.architecture?.kind??''))return label;return label+' · '+architectureEnvironmentContext(n).label;};
 const select=(id:string)=>onSelectSummary&&simple.graph.nodes.some(n=>n.id===id)?<button onClick={()=>onSelectSummary(id)}>{peerTitle(id)}</button>:<strong>{peerTitle(id)}</strong>;
 return <aside className="analyzer-detail-panel is-module-detail semantic-detail semantic-flow-detail architecture-detail architecture-simple-detail" aria-label="構成の詳細">
  <div className="analyzer-detail-heading"><h3>{node?.label??(edge&&architectureRelationLabel(edge))}</h3><button aria-label="詳細を閉じる" onClick={onClose}>×</button></div>
  <p>{unit?unit.reason:relation?.kind==='path'?'複数段階を短縮した経路':relation?.kind==='aggregate'?`まとめた関係：${relation.edgeIds.length}件`:'元の直接関係（端点は簡易図の説明単位）'}</p>
  {unit&&<section className="simple-overview-section"><h4>概要・主な役割</h4><p>{unit.role==='support'?unit.purposes.map(p=>simplePurposes[p]??p).join('・')||'対応する操作の入力・成果物・実行構成':original?.architecture?.context.join(' / ')||roles.slice(0,3).join(' / ')||'役割は未判定です'}</p>{node?.attributes.simpleEnvironmentLabel&&<p>環境：{String(node.attributes.simpleEnvironmentLabel)}</p>}{members.some(n=>n.architecture?.kind==='unresolved')&&<p>接続先が未特定の要求：{members.filter(n=>n.architecture?.kind==='unresolved').length}件（内訳から確認）</p>}</section>}
  {tools.length>0&&<section className="simple-overview-section"><h4>開発・公開を支える道具</h4>{tools.map(u=><p key={u.id}>{select(u.id)}</p>)}</section>}
  {peers.length>0&&<section className="simple-overview-section"><h4>主な構成上の相手</h4>{peers.slice(0,peerLimit).map(p=><p key={p.id}>{select(p.id)}<small>{[...p.labels].join(' / ')}</small></p>)}{peers.length>peerLimit&&<button onClick={()=>setPeerLimit(peerLimit+10)}>相手をさらに表示</button>}</section>}
  {relation?.paths&&<section className="simple-overview-section"><h4>元の段階</h4>{relation.paths.map((path,i)=><p key={i}>{path.nodeIds.map(id=>nodes.get(id)?.label??'名前未確認の対象').join(' → ')}</p>)}<p>各経路の記述を示します。分岐先の同時・連続実行は断定しません。</p></section>}
  {unit?.anchorId&&canOpen(unit.anchorId)&&<button onClick={()=>onOpen(unit.anchorId!)}>この構成の内部を開く</button>}
  {groups.map(([group,items])=><Disclosure key={group} title={`${group}：${items.length}件`} initial={Boolean(query&&items.some(n=>`${n.label} ${simpleMemberCaption(n)}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())))}>{()=> <Members members={items} onShowAll={onShowAll}/>}</Disclosure>)}
  {inventory.internal.length>0&&<Disclosure title={`内部の関係：${inventory.internal.length}件`}>{()=> <RelationList edges={inventory.internal} nodes={nodes} sources={sources} onShowRelation={onShowRelation}/>}</Disclosure>}
  {inventory.external.length>0&&<Disclosure title={`${unit?'外側との関係':'元の関係・段階'}：${inventory.external.length}件`}>{()=> <RelationList edges={inventory.external} nodes={nodes} sources={sources} onShowRelation={onShowRelation}/>}</Disclosure>}
  <Disclosure title="要約の根拠・確認状態">{()=> <><p>表示上の説明単位です。別の使用や環境を同じ実体・実行回数と認定しません。確度は元対象・関係ごとに保持します。</p><p>ソース箇所：{new Set((node?.evidence??edge?.evidence??[]).map(e=>JSON.stringify([e.path,e.start,e.end]))).size}箇所</p><ArchitectureEvidenceList evidence={node?.evidence??edge?.evidence??[]} sources={sources}/></>}</Disclosure>
  <Diagnostic ids={[node?.id??edge?.id??'',...unit?.members??[],...relation?.edgeIds??[]]}/>
 </aside>;
}
