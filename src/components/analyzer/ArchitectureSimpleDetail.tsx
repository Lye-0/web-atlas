import './architecture-detail.css';
import './architecture-simple.css';
import {useState} from 'react';
import type {ArchitectureSimple} from '../../analyzer/semantic/architectureSimple';
import {architectureEnvironmentContext} from '../../analyzer/semantic/architectureContext';
import {confidenceLabels,type SemanticNode,type SemanticEdge} from '../../analyzer/semantic/types';
import {ArchitectureEvidenceList} from './ArchitectureEvidence';

function OriginalRelations({edge,sources}:{edge:SemanticEdge;sources:Record<string,string>}){
 const [open,setOpen]=useState(false),[limit,setLimit]=useState(20);
 const originals=edge.provenance?.edges??[];
 if(!originals.length)return null;
 return <details onToggle={e=>setOpen(e.currentTarget.open)}><summary>解析モデルの元関係：{originals.length}件</summary>{open&&<>
  {edge.provenance?.intermediateNodeIds?.length&&<p>元の中間対象：{edge.provenance.intermediateNodeIds.join(' / ')}</p>}
  {originals.slice(0,limit).map((e,index)=><details key={`${e.id}:${index}`}><summary>{e.label} · {confidenceLabels[e.confidence]}</summary><p>{e.details?.reason}</p><code style={{overflowWrap:'anywhere'}}>{e.source} → {e.target}</code><p><code style={{overflowWrap:'anywhere'}}>{e.id}</code></p><ArchitectureEvidenceList evidence={e.evidence} sources={sources}/></details>)}
  {originals.length>limit&&<button onClick={()=>setLimit(limit+20)}>元関係をさらに表示</button>}
 </>}</details>;
}

export function ArchitectureSimpleDetail({simple,node,edge,sources,onShowAll,onOpen,canOpen,onClose}:{simple:ArchitectureSimple;node?:SemanticNode;edge?:SemanticEdge;sources:Record<string,string>;onShowAll:(id:string)=>void;onOpen:(id:string)=>void;canOpen:(id:string)=>boolean;onClose:()=>void}){
 const [limit,setLimit]=useState(30),[evidenceOpen,setEvidenceOpen]=useState(false),[relationsOpen,setRelationsOpen]=useState(false),[edgeLimit,setEdgeLimit]=useState(30);
 const unit=node&&simple.units.get(node.id),relation=edge&&simple.relations.get(edge.id);
 const ids=new Set(unit?.members??[]),edgeIds=new Set(relation?.edgeIds??unit?.internalEdges??[]);
 const edges=simple.original.edges.filter(e=>edgeIds.has(e.id));
 if(edge)for(const e of edges){ids.add(e.source);ids.add(e.target);}
 const members=simple.original.nodes.filter(n=>ids.has(n.id));
 return <aside className="analyzer-detail-panel is-module-detail semantic-detail semantic-flow-detail architecture-detail architecture-simple-detail" aria-label="構成の詳細">
  <div className="analyzer-detail-heading"><h3>{node?.label??edge?.label}</h3><button aria-label="詳細を閉じる" onClick={onClose}>×</button></div>
  <p>{unit?.reason??(relation?.kind==='direct'?'元の直接関係':'元関係の集約（端点は表示上の説明単位）')}</p>
  <p>表示上の要約です。内訳の対象を同じ実体・プロセスとみなすものではありません。稼働・通信はこの要約だけでは断定しません。確度と根拠は元の対象・関係ごとに確認できます。</p>
  {unit?.anchorId&&canOpen(unit.anchorId)&&<button onClick={()=>onOpen(unit.anchorId!)}>この構成の内部を開く</button>}
  <h4>元の対象：{members.length}件</h4>
  <p>全体で詳しく見る対象を選んでください。</p>
  {members.slice(0,limit).map(n=><div className="architecture-simple-member" key={n.id}><strong>{n.label}</strong><p>{architectureEnvironmentContext(n).label} · {confidenceLabels[n.confidence]}{n.attributes.purpose&&` · ${n.attributes.purpose}`}</p><small>{n.path}</small><p><button onClick={()=>onShowAll(n.id)}>全体で詳しく見る：{n.label}</button></p></div>)}
  {members.length>limit&&<button onClick={()=>setLimit(limit+30)}>内訳をさらに表示（残り{members.length-limit}件）</button>}
  <details className="analyzer-detail-accordion" onToggle={e=>setRelationsOpen(e.currentTarget.open)}><summary>元の関係・段階：{edges.length}件</summary><p>端点ごとの元ID・用途・条件を保持しています。列挙順は実行順ではありません。</p>{relationsOpen&&edges.slice(0,edgeLimit).map(e=><details key={e.id}><summary>{e.label} · {e.details?.environment||'対象環境の指定なし'} · {confidenceLabels[e.confidence]}</summary><p>{simple.original.nodes.find(n=>n.id===e.source)?.label} → {simple.original.nodes.find(n=>n.id===e.target)?.label}</p><p>{e.details?.reason}</p><code style={{overflowWrap:'anywhere'}}>{e.id}</code><ArchitectureEvidenceList evidence={e.evidence} sources={sources}/><OriginalRelations edge={e} sources={sources}/></details>)}{relationsOpen&&edges.length>edgeLimit&&<button onClick={()=>setEdgeLimit(edgeLimit+30)}>関係をさらに表示（残り{edges.length-edgeLimit}件）</button>}</details>
  <details className="analyzer-detail-accordion" onToggle={e=>setEvidenceOpen(e.currentTarget.open)}><summary>元のEvidence</summary>{evidenceOpen&&<ArchitectureEvidenceList evidence={node?.evidence??edge?.evidence??[]} sources={sources}/>}</details>
 </aside>;
}
