import type {ArchitectureContentChoice} from '../../analyzer/semantic/architectureContent';

export function architectureContentDescription(choice:ArchitectureContentChoice){
 if(choice.meaning==='definition')return '論理アプリ・構成単位と、直接対応する実行・配信構成を表示します。';
 if(choice.meaning==='unknown')return '対象・所属の環境名が未特定の構成と、直接関係する相手を表示します。操作の実行場所とは別の区分です。';
 if(choice.meaning==='default')return '環境名を指定しない既定設定と、直接関係する構成を表示します。本番環境を意味する区分ではありません。';
 if(choice.meaning==='shared')return '複数環境との対応が記録された共通の構成と、直接関係する相手を表示します。';
 if(choice.meaning==='explicit')return 'この環境に属する構成と、直接関係する相手を表示します。';
 return 'この経路の入力・操作・出力と、対応する構成を表示します。';
}

export function ArchitectureContentSummary({choice,nodes,edges,total,emptyScope,emptyFiltered,onProject,onAll}:{choice:ArchitectureContentChoice;nodes:number;edges:number;total:number;emptyScope:boolean;emptyFiltered:boolean;onProject:()=>void;onAll:()=>void}){
 return <section className="architecture-content-note" aria-label="表示内容の範囲">
  <strong className="architecture-content-name">{choice.label}</strong>
  <p>{architectureContentDescription(choice)}</p>
  <p>内容全体：{nodes}対象・{edges}関係 <span>その他の構成は「全体」で確認できます。</span></p>
  {emptyScope?<p>現在の階層には、この内容の中心となる対象や直接の相手がありません。<button onClick={onProject}>プロジェクトへ</button></p>:emptyFiltered&&<p>現在のフィルターに一致する対象はありません。フィルターを変更して確認できます。</p>}
  <div className="architecture-content-actions"><button onClick={onAll}>全体に戻す</button><details><summary>範囲と件数について</summary><p>この内容に含めた元の対象を各1回数えています。要求や補助対象も含み、表示用の集合は加算しません。関係はこの内容に含めた構成上の関係です。解析全体には{total}対象あります。</p><p>上の件数は表示内容全体の値です。現在の階層・検索・フィルター・集約・カメラ位置によって画面に見えるカード数とは異なります。関係のソース箇所数は詳細欄で確認できます。</p></details></div>
 </section>;
}
