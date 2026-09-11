import { confidenceLabels, type SemanticNode, type SemanticRelationSource, type SemanticViewId } from '../../analyzer/semantic/types';
import { architectureRelationLabel } from '../../analyzer/semantic/architectureRelations';

export type SemanticFlowLanguageView = SemanticViewId | 'architecture' | 'workspace' | 'command' | 'dependencies' | 'module-dependency';

export function semanticFlowDirectionLanguage(view: SemanticFlowLanguageView) {
  if (view === 'architecture') return {
    incoming: '所属元', outgoing: '包含先', caption: 'Scope包含と技術所属。技術選択時は所属Scopeの関係を強調',
    help: 'Scopeまたは技術を選ぶと、その所属に対応する既存の包含関係を強調します。技術ごとの架空の線は追加しません。包含は実行順を示しません。',
  };
  if (view === 'workspace') return {
    incoming: '設定・宣言元', outgoing: '宣言・一致先', caption: '矢印は設定、パターン宣言、package一致、包含の関係',
    help: '青は選択対象からの宣言・一致先、橙は設定・宣言元です。種類と根拠は元の関係詳細で確認できます。',
  };
  if (view === 'command') return {
    incoming: '呼び出し元', outgoing: '展開・呼び出し先', caption: '矢印・粒子はscript解決・コマンド展開の関係',
    help: '青は選択対象からの展開・呼び出し先、橙は呼び出し元です。閉じた枝では元の関係をsummaryへまとめます。粒子は実際の実行を示しません。',
  };
  if (view === 'dependencies') return {
    incoming: '利用元', outgoing: '依存先', caption: '矢印・粒子は直接依存の宣言元から依存先へ',
    help: '青は選択対象の依存先、橙は選択対象を利用する元です。version指定と宣言種類は元Evidenceで確認できます。',
  };
  if (view === 'architecture-map') return {
    incoming: '関係元', outgoing: '関係先', caption: '矢印は参照・要求・設定の向き。種類は線の詳細で確認',
    help: '青は選択対象から出る関係、橙は入る関係です。宣言依存、コード参照、呼び出し、通信要求、配置設定を区別します。粒子は方向の補助表示です。設定は稼働状況を示さず、集約された連続線は一連の実行を証明しません。',
  };
  if (view === 'data-flow') return {
    incoming: '由来・入力', outgoing: '結果・利用先', caption: '矢印・粒子は値の由来から処理・結果・利用先への関係',
    help: '代入、項目の取り出し、引数、加工、戻り値などの関係を、由来から利用先へ示します。青は選択対象から出る関係、橙は入る関係です。静的な粒子は実際の値・実行順・頻度・データ流量を表しません。',
  };
  if (view === 'data-model') return {
    incoming: '参照する元・派生する型', outgoing: '参照先・派生元', caption: '矢印・粒子は型・スキーマ・テーブルの構造上の関係',
    help: '項目の型を使うモデルから参照先へ、派生した型から元の型へ向かいます。外部キーは宣言元から参照先へ向かいます。青は選択対象から出る関係、橙は入る関係です。型の参照は実行時の値の流れではありません。',
  };
  if (view === 'module-dependency') return {
    incoming: 'import元', outgoing: 'import先', caption: '矢印・粒子は import する側から読み込まれる側へ',
    help: '矢印と粒子は、importするファイルから読み込まれるファイルへ向かいます。青は選択対象がimportする先、琥珀色は選択対象をimportする元、緑は選択範囲内の依存です。粒子は依存の向きを示し、実行順や実行時間は表しません。',
  };
  if (view === 'function-call-flow') return {
    incoming: '呼び出し元', outgoing: '呼び出し先', caption: '矢印・粒子は呼び出しや登録などの関係の向き',
    help: '呼び出しの線は呼ぶ側から呼び出される側へ、コールバックの線は渡す側から渡される関数へ向かいます。実行記録の線は親子関係やソースとの対応を示します。青は選択対象から出る関係、琥珀色は入る関係、緑は選択範囲内の関係です。配置や粒子の速度は実際の実行順・時間を表しません。',
  };
  return {
    incoming: '関係元', outgoing: '関係先', caption: '矢印・粒子は処理・登録・読み書きなどの関係の向き',
    help: '呼び出し、イベント登録、リクエスト、読み書きなどの関係を元から先へ示します。読み取りはデータ側から処理側へ向かいます。実行記録の線は親子関係やソースとの対応を示します。青は選択対象から出る関係、琥珀色は入る関係、緑は選択範囲内の関係です。配置や粒子の速度は実際の実行順・時間を表しません。',
  };
}

export const isUnresolvedCallNode = (node?: SemanticNode) => node?.kind === 'external' && node.confidence === 'unresolved' && !node.architecture;

export function semanticNodeConfidence(node: SemanticNode) {
  if (isUnresolvedCallNode(node)) return '呼び出し先の定義を未特定';
  if (node.kind === 'request' && node.confidence === 'unresolved') return '送信先URLを未特定';
  return confidenceLabels[node.confidence];
}

export function semanticRelationConfidence(edge: SemanticRelationSource) {
  if (edge.confidence === 'unresolved') return edge.kind === 'calls'
    ? edge.evidence.length ? '呼び出し式あり・定義先未特定' : '呼び出し先の定義を未特定'
    : '関係の一部を未特定';
  return confidenceLabels[edge.confidence];
}

export function semanticNodeExplanation(node: SemanticNode) {
  if (isUnresolvedCallNode(node)) {
    const confirmed = node.evidence.length ? '呼び出し式はソースにあります。' : '';
    return confirmed + (Array.isArray(node.attributes.candidates) && node.attributes.candidates.length > 1
      ? '定義の候補が複数あり、呼び出し先を一つに絞れていません。Evidenceから呼び出し箇所を確認できます。'
      : '読み込んだソースから、対応する関数の定義を特定できていません。Evidenceから呼び出し箇所を確認できます。');
  }
  if (node.kind === 'request' && node.confidence === 'unresolved') return '送信先URLを特定できていません。Evidenceのリクエスト箇所で、URLに使われている値を確認できます。';
  if (node.confidence === 'unresolved') return '読み込んだ情報では、この対象に関する情報を確定できません。EvidenceとMetadataを確認してください。';
  return undefined;
}

export function semanticRelationExplanation(edge: SemanticRelationSource, target?: SemanticNode) {
  if (edge.confidence !== 'unresolved') return undefined;
  if (edge.kind === 'calls') return (edge.evidence.length ? 'この呼び出し式はソースで確認できています。' : '')
    + (Array.isArray(target?.attributes.candidates) && target.attributes.candidates.length > 1
      ? '定義の候補が複数あり、呼び出し先を一つに絞れていません。'
      : '対応する関数の定義を、読み込んだソースから特定できていません。');
  return '関係の一部を確定できていません。元の関係とEvidenceで、確認できている範囲を調べられます。';
}

export function semanticRelationLabel(edge: SemanticRelationSource, view?: SemanticViewId) {
  if (view === 'architecture-map' || edge.details?.architectureRelation) return architectureRelationLabel(edge);
  switch (edge.kind) {
    case 'callback': return 'コールバックとして渡す';
    case 'handles': return '担当する処理';
    case 'runtime-entry': return '実行の入口';
    case 'requests': return 'リクエストを送る';
    case 'uses-resource': return 'リソースを利用';
    case 'observed-child': return '実行記録の親子関係';
    case 'observed-at': return '実行記録とソースの対応';
    case 'log-event': return 'ログの記録';
    case 'processing-path': return edge.label.replaceAll('callback', 'コールバック');
    case 'executes': return ({ database: 'データベース操作', storage: 'ストレージ操作', auth: '認証処理', 'ORM operation': 'データベース操作' } as Record<string, string>)[edge.label] ?? edge.label;
    default: return edge.label;
  }
}
