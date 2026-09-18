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
import {simpleEvidenceStats,simpleMemberLocations} from '../../analyzer/semantic/architectureSimpleEvidence';
import {simplePeerGroups,simpleRelationOverview} from '../../analyzer/semantic/architectureSimpleSummary';
import {simpleResourceEndpoints,simpleResourceMemberLabel} from '../../analyzer/semantic/architectureSimpleAnnotations';

function Disclosure({title,children,initial=false}:{title:string;children:()=>ReactNode;initial?:boolean}){
 const [open,setOpen]=useState(initial);
 return <details className="analyzer-detail-accordion" open={open} onToggle={e=>setOpen(e.currentTarget.open)}><summary>{title}</summary>{open&&<div className="analyzer-detail-accordion-body">{children()}</div>}</details>;
}
function Diagnostic({ids}:{ids:string[]}){const [status,setStatus]=useState('');return <Disclosure title="診断情報／元ID">{()=> <><pre>{ids.join('\n')}</pre><button onClick={async()=>{try{await navigator.clipboard.writeText(ids.join('\n'));setStatus('コピーしました');}catch{setStatus('選択してコピーできます');}}}>元IDをコピー</button><span role="status">{status}</span></>}</Disclosure>;}
function EvidenceCount({evidence}:{evidence:SemanticNode['evidence']}){const stats=useMemo(()=>simpleEvidenceStats(evidence),[evidence]);return <><p>ソース箇所：{stats.sites.toLocaleString()}箇所 · {stats.records.toLocaleString()} Evidence{stats.unlocated?` · 範囲未確認 ${stats.unlocated}件`:''}</p><p>この入力内の同じファイル・開始位置・終了位置を1箇所として数えます。同じ行でも範囲が違えば別箇所です。同じ箇所の異なる説明や関係への対応はEvidenceに保持します。</p></>;}
function UsageCommand({node}:{node:SemanticNode}){const [status,setStatus]=useState(''),command=String(node.attributes.command??node.attributes.usageArguments??'');return command?<div><pre>{command}</pre><button onClick={async()=>{try{await navigator.clipboard.writeText(command);setStatus('コピーしました');}catch{setStatus('文字を選択してコピーできます');}}}>使用条件をコピー</button><span role="status">{status}</span></div>:null;}
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
function Members({members,onShowAll,sources}:{members:SemanticNode[];onShowAll:(id:string)=>void;sources:Record<string,string>}){
 const [query,setQuery]=useState(''),[limit,setLimit]=useState(20);
 const shown=members.filter(n=>!query||`${n.label} ${simpleMemberCaption(n)}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
 return <><label className="simple-detail-search">内訳を検索<input type="search" value={query} onChange={e=>{setQuery(e.target.value);setLimit(20);}} placeholder="名前・script・式・ファイル"/></label>{shown.slice(0,limit).map(n=><div className="architecture-simple-member" key={n.id}><strong>{n.label}{n.attributes.scriptName?` · ${n.attributes.scriptName}`:''}</strong><p>{architectureEnvironmentContext(n).label} · {confidenceLabels[n.confidence]}</p>{simpleMemberLocations(n).map(item=><p key={item.label+item.path}>{item.label}：{item.path}</p>)}<p className="simple-member-caption">{simpleMemberCaption(n)}</p>{n.architecture?.kind==='tool-operation'&&<UsageCommand node={n}/>}<Disclosure title="完全なパス・その他の根拠">{()=> <>{n.evidence.length?<ArchitectureEvidenceList evidence={n.evidence} sources={sources}/>:<p>根拠ファイル未確認</p>}</>}</Disclosure><button onClick={()=>onShowAll(n.id)}>全体で詳しく見る：{n.label}{n.attributes.scriptName?`（${n.attributes.scriptName}）`:''}</button><Diagnostic ids={[n.id]}/></div>)}{shown.length>limit&&<button onClick={()=>setLimit(limit+20)}>内訳をさらに表示（残り{shown.length-limit}件）</button>}{!shown.length&&<p>一致する内訳はありません</p>}</>;
}
export function ArchitectureSimpleDetail({simple,node,edge,sources,onShowAll,onOpen,canOpen,onClose,onSelectSummary,onShowRelation,query=''}:{simple:ArchitectureSimple;node?:SemanticNode;edge?:SemanticEdge;sources:Record<string,string>;onShowAll:(id:string)=>void;onOpen:(id:string)=>void;canOpen:(id:string)=>boolean;onClose:()=>void;onSelectSummary?:(id:string)=>void;onShowRelation?:(id:string)=>void;query?:string}){
 const unit=node&&simple.units.get(node.id),relation=edge&&simple.relations.get(edge.id),[peerLimit,setPeerLimit]=useState(6);
 const nodes=useMemo(()=>new Map(simple.original.nodes.map(n=>[n.id,n])),[simple.original]);
 const edges=useMemo(()=>{const ids=new Set(relation?.edgeIds??[]);return simple.original.edges.filter(e=>ids.has(e.id));},[relation,simple.original]);
 const members=useMemo(()=>{const ids=new Set(unit?.members??[]);if(edge)for(const e of edges){ids.add(e.source);ids.add(e.target);}return [...ids].map(id=>nodes.get(id)).filter((n):n is SemanticNode=>Boolean(n));},[unit,edge,edges,nodes]);
 const inventory=useMemo(()=>unit?simpleUnitRelations(simple,unit.id):{internal:[],external:edges},[simple,unit,edges]);
 const groups=useMemo(()=>{const result=new Map<string,SemanticNode[]>();for(const n of members){const group=simpleMemberGroup(n),list=result.get(group)??[];list.push(n);result.set(group,list);}const order=['内部構成','環境別の構成','道具・開始script','入力・成果物','接続先が未特定の要求','サービス・補助構成','元の定義・共有部分'];return [...result].sort(([a],[b])=>order.indexOf(a)-order.indexOf(b));},[members]);
 const tools=useMemo(()=>node?[...simple.units.values()].filter(u=>u.role==='support'&&u.targetIds.some(id=>simple.owners.get(id)===node.id)):[],[simple,node]);
 const peers=useMemo(()=>node?simplePeerGroups(simple,node.id,inventory.external).filter(p=>!tools.some(tool=>tool.id===p.id)):[],[simple,node,tools,inventory.external]);
 const supportGroups=useMemo(()=>{const groups=new Map<string,typeof tools>();for(const tool of tools){const member=nodes.get(tool.members[0]!);const category=tool.purposes.length?'道具':member?.architecture?.kind==='artifact'?'成果物':member?.architecture?.kind==='code-definition'?'定義':member?.architecture?.kind==='execution-config'?'実行構成':'その他の支援';const group=groups.get(category)??[];group.push(tool);groups.set(category,group);}return [...groups];},[tools,nodes]);
 const overview=useMemo(()=>edge&&relation?simpleRelationOverview(simple,edge,relation):undefined,[simple,edge,relation]);
 const endpoints=useMemo(()=>edge?simpleResourceEndpoints(simple,edge):[],[simple,edge]);
 const references=useMemo(()=>{const ids=new Set((simple.referenceEdges??[]).filter(e=>e.source===node?.id||e.target===node?.id).flatMap(e=>simple.relations.get(e.id)?.edgeIds??[]));return simple.original.edges.filter(e=>ids.has(e.id));},[simple,node]);
 const evidence=node?.evidence??edge?.evidence;
 const title=(id:string)=>simple.graph.nodes.find(n=>n.id===id)?.label??nodes.get(simple.units.get(id)?.anchorId??simple.units.get(id)?.members[0]??'')?.label??'現在の図では省略した構成';
 const original=unit?.anchorId?nodes.get(unit.anchorId):undefined;
 const roles=[...new Set((original?.architecture?.roles??[]).map(r=>r.label).filter(r=>!r.includes('未判定')))];
 const peerTitle=(id:string)=>{const n=simple.graph.nodes.find(n=>n.id===id),label=title(id);if(!n||!['resource','external-service'].includes(n.architecture?.kind??''))return label;return label+' · '+architectureEnvironmentContext(n).label;};
 const select=(id:string)=>onSelectSummary&&simple.graph.nodes.some(n=>n.id===id)?<button onClick={()=>onSelectSummary(id)}>{peerTitle(id)}</button>:<strong>{peerTitle(id)}</strong>;
 return <aside className="analyzer-detail-panel is-module-detail semantic-detail semantic-flow-detail architecture-detail architecture-simple-detail" aria-label="構成の詳細">
  <div className="analyzer-detail-heading"><h3>{node?.label??(edge&&architectureRelationLabel(edge))}</h3><button aria-label="詳細を閉じる" onClick={onClose}>×</button></div>
  {overview?<section className="simple-overview-section"><p>{overview.sentence}</p><small>{overview.kind} · {overview.records}元関係{overview.usage?` · ${overview.usage}`:''}{overview.variants>1?' · 種類・環境・確度の違いは内訳に保持':''}</small></section>:<p>{unit?.reason}</p>}
  {node?.attributes.simplePublicationNote&&<p>{String(node.attributes.simplePublicationNote)}</p>}
  {references.length>0&&<Disclosure title={`定義元と呼び出し関係を確認：${references.length}元関係`}>{()=> <><p>開始定義の呼び出し対応です。常設の線は省き、元の条件・根拠をここに保持しています。実行回数は表しません。</p><RelationList edges={references} nodes={nodes} sources={sources} onShowRelation={onShowRelation}/></>}</Disclosure>}
  {endpoints.map(match=><section key={match.node.id} className="simple-overview-section"><h4>この線が対応する環境別の対象</h4><p>{match.node.label}：{match.members.length}元対象 / {simple.units.get(match.node.id)?.members.length}集合内対象</p>{match.members.slice(0,6).map(n=><p key={n.id}><mark className="simple-resource-match">{simpleResourceMemberLabel(n)}</mark><button onClick={()=>onShowAll(n.id)}>この元対象を全体で確認</button></p>)}{match.members.length>6&&<p>ほか{match.members.length-6}対象。下の内訳で確認できます。</p>}<small>元関係の端点から対応を表示しています。集合全体を同じ実体とは扱いません。</small></section>)}
  {unit&&<section className="simple-overview-section"><h4>概要・主な役割</h4><p>{unit.role==='support'?unit.purposes.map(p=>simplePurposes[p]??p).join('・')||'対応する操作の入力・成果物・実行構成':node?.attributes.simpleCategory==='destination'?'公開する指定の到着先（配信・実行構成）':node?.attributes.simpleCategory==='runtime'?'実行構成（原本とは別。操作との対応は元関係で確認）':node?.attributes.simpleCategory==='resources'?'設定の役割に対応する、環境別の別対象':original?.architecture?.context.join(' / ')||roles.slice(0,3).join(' / ')||'役割は未判定です'}</p>{node?.attributes.simpleEnvironmentLabel&&<p>環境：{String(node.attributes.simpleEnvironmentLabel)}</p>}{members.some(n=>n.architecture?.kind==='unresolved')&&<p>接続先が未特定の要求：{members.filter(n=>n.architecture?.kind==='unresolved').length}件（内訳から確認）</p>}</section>}
  {Array.isArray(node?.attributes.simpleRows)&&<section className="simple-overview-section"><h4>{node.attributes.simpleCategory==='destination'?'公開・配信先の設定':node.attributes.simpleCategory==='runtime'?'起動・実行先の設定':'環境別の対象'}</h4>{node.attributes.simpleRows.slice(0,6).map((row,i)=><p key={i}>{row}</p>)}{node.attributes.simpleRows.length>6&&<p>ほか{node.attributes.simpleRows.length-6}対象。環境別の内訳で確認できます。</p>}<small>元の設定・対象を保持した表示集合です。元対象は内訳から指定できます。</small></section>}
  {tools.length>0&&<section className="simple-overview-section"><h4>開発・公開・更新に関わるもの</h4>{supportGroups.map(([category,items])=><div key={category}><strong>{category}</strong>{items.map(u=><p key={u.id}>{select(u.id)}</p>)}</div>)}</section>}
  {peers.length>0&&<section className="simple-overview-section"><h4>主な構成上の相手</h4>{peers.slice(0,peerLimit).map(p=><div className="simple-peer" key={p.id}>{select(p.id)}{(['outgoing','incoming'] as const).map(direction=>{const labels=[...new Set(p.relations.filter(r=>r.direction===direction).map(r=>r.label))];return labels.length>0&&<small key={direction}>{direction==='incoming'?`${peerTitle(p.id)} → この構成`:`この構成 → ${peerTitle(p.id)}`}：{labels.join('・')}</small>;})}<Disclosure title="関係・環境別の内訳">{()=> <>{p.relations.map(r=><p key={JSON.stringify(r)}>{r.direction==='incoming'?'相手 → この構成':'この構成 → 相手'}：{r.label} · {r.environment||'環境指定なし'} · {confidenceLabels[r.confidence as SemanticNode['confidence']]}</p>)}</>}</Disclosure></div>)}{peers.length>peerLimit&&<button onClick={()=>setPeerLimit(peerLimit+10)}>相手をさらに表示</button>}</section>}
  {relation?.paths&&<section className="simple-overview-section"><h4>元の段階</h4>{relation.paths.map((path,i)=><p key={i}>{path.nodeIds.map(id=>nodes.get(id)?.label??'名前未確認の対象').join(' → ')}</p>)}<p>各経路の記述を示します。分岐先の同時・連続実行は断定しません。</p></section>}
  {unit?.anchorId&&canOpen(unit.anchorId)&&<button onClick={()=>onOpen(unit.anchorId!)}>この構成の内部を開く</button>}
  {groups.map(([group,items])=><Disclosure key={group} title={`${group}：${items.length}件`} initial={Boolean(query&&items.some(n=>`${n.label} ${simpleMemberCaption(n)}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())))}>{()=> <Members members={items} onShowAll={onShowAll} sources={sources}/>}</Disclosure>)}
  {inventory.internal.length>0&&<Disclosure title={`内部の関係：${inventory.internal.length}件`}>{()=> <RelationList edges={inventory.internal} nodes={nodes} sources={sources} onShowRelation={onShowRelation}/>}</Disclosure>}
  {inventory.external.length>0&&<Disclosure title={`${unit?'外側との関係':'元の関係・段階'}：${inventory.external.length}件`}>{()=> <RelationList edges={inventory.external} nodes={nodes} sources={sources} onShowRelation={onShowRelation}/>}</Disclosure>}
  <Disclosure title="要約の根拠・確認状態">{()=> <><p>表示上の説明単位です。別の使用や環境を同じ実体・実行回数と認定しません。確度は元対象・関係ごとに保持します。</p><EvidenceCount evidence={evidence??[]}/><ArchitectureEvidenceList evidence={evidence??[]} sources={sources}/></>}</Disclosure>
  <Diagnostic ids={[node?.id??edge?.id??'',...unit?.members??[],...relation?.edgeIds??[]]}/>
 </aside>;
}
