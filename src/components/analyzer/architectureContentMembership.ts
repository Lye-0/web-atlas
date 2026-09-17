import type {SemanticNode} from '../../analyzer/semantic/types';
import type {ArchitectureContentChoice} from '../../analyzer/semantic/architectureContent';
import {architectureEnvironmentContext} from '../../analyzer/semantic/architectureContext';

export function architectureContentMembership(node:SemanticNode,choice:ArchitectureContentChoice,role:'core'|'peer'|'support'){
 const label={core:'この表示の中心',peer:'直接の相手・経路',support:'定義・所属の補助'}[role];
 const environment=architectureEnvironmentContext(node);
 let reason=role==='core'?'選択した内容に該当する対象です。':role==='peer'?'中心の対象を説明するため、記録済みの関係から含めています。':'定義や実際の所属を説明するために含めています。この対象を起点に全関係を広げてはいません。';
 if(choice.meaning==='unknown'&&role==='core'){
  reason=environment.meaning==='unknown'
   ? node.attributes.purpose==='script'?'このscript自身には対象環境名が記録されていません。script名からは確定しません。呼び出す個々の操作の対象環境は、それぞれの詳細で確認できます。'
    :node.attributes.configurationOccurrence?'この設定上の対象には環境名の対応が記録されていません。local・cloudなどの場所の情報だけでは対象環境名を確定しません。'
     :'この対象には、構成モデル上の対象・所属の環境名が記録されていません。操作の実行場所や接続先の特定とは別の情報です。'
   :reason;
 }else if(choice.meaning==='unknown')reason+=` この対象自身の環境との対応は「${environment.label}」のままです。`;
 return {label,reason,source:typeof node.attributes.environmentSource==='string'?node.attributes.environmentSource:undefined};
}

export function architectureContentDescription(choice:ArchitectureContentChoice){
 if(choice.meaning==='definition')return '論理アプリ・構成単位と、直接対応する実行・配信構成を表示します。';
 if(choice.meaning==='unknown')return '対象・所属の環境名が未特定の構成と、直接関係する相手を表示します。操作の実行場所とは別の区分です。';
 if(choice.meaning==='default')return '環境名を指定しない既定設定と、直接関係する構成を表示します。本番環境を意味する区分ではありません。';
 if(choice.meaning==='shared')return '複数環境との対応が記録された共通の構成と、直接関係する相手を表示します。';
 if(choice.meaning==='explicit')return 'この環境に属する構成と、直接関係する相手を表示します。';
 return 'この経路の入力・操作・出力と、対応する構成を表示します。';
}
