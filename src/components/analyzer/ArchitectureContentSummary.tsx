import {architectureContentDescription} from './architectureContentMembership';
import type {ArchitectureContentChoice} from '../../analyzer/semantic/architectureContent';
import type {SemanticGraph} from '../../analyzer/semantic/types';

export function ArchitectureContentSummary({choice,current,nodes,edges,total,emptyScope,emptyFiltered,onProject,onAll}:{choice:ArchitectureContentChoice;current:SemanticGraph;nodes:number;edges:number;total:number;emptyScope:boolean;emptyFiltered:boolean;onProject:()=>void;onAll:()=>void}){
 const projection=current.architectureView;
 const entities=projection?projection.detailEntityCount+projection.contextEntityCount:current.nodes.filter(n=>n.architecture?.kind!=='unresolved').length;
 const requests=projection?.requestCount??current.nodes.filter(n=>n.architecture?.kind==='unresolved').length;
 return <section className="architecture-content-note" aria-label="表示内容の範囲">
  <strong className="architecture-content-name">{choice.label}</strong>
  <p>{architectureContentDescription(choice)}</p>
  <p>現在の図：{entities}構成要素{requests>0&&`・未特定要求 ${requests}対象`}・{current.edges.length}本の関係線</p>
  <small>線は構成上の関係です。実行・通信は観測していません。</small>
  {emptyScope?<p>現在の階層には、この内容の中心となる対象や直接の相手がありません。<button onClick={onProject}>プロジェクトへ</button></p>:emptyFiltered&&<p>現在のフィルターに一致する対象はありません。フィルターを変更して確認できます。</p>}
  <div className="architecture-content-actions"><details><summary>範囲・集計の詳細</summary>
   <p>現在の図は、この表示内容に現在地・フィルターを適用した構成図です。画面外も数え、パンやズームでは件数を変えません。内部と外側の相手を含みます。</p>
   <p>構成要素と未特定要求を分けています。集合でまとめた要求と個別に取り出した要求は、元の対象を各1回数え、集合カードを加算しません。関係線は階層でまとめた後・描画時の自動省略前の本数で、元の関係やソース箇所数とは異なります。</p>
   <p>現在の図の内訳：操作 {current.nodes.filter(n=>n.architecture?.kind==='tool-operation').length}・成果物 {current.nodes.filter(n=>n.architecture?.kind==='artifact').length}・実行構成 {current.nodes.filter(n=>n.architecture?.kind==='execution-config').length}。構成要素に含まれます。{projection?.internalRecordCount?` 内部で要約した関係は${projection.internalRecordCount}件です。`:''}</p>
   <p>プリセット全体：{nodes}対象・{edges}関係。現在の階層・フィルターで除かれた対象、要求や補助対象も含みます。表示用の集合は加算しません。</p>
   <p>プロジェクトの解析全体：{total}対象。その他の構成は「全体」で確認できます。関係の根拠とソース箇所数は右側詳細欄で確認できます。</p>
  </details><button onClick={onAll}>全体に戻す</button></div>
 </section>;
}
