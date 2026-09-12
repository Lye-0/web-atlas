import type { SemanticGraph, SemanticNode } from '../../analyzer/semantic/types';
import { publicUrlText } from '../../analyzer/urlPrivacy';

export function architectureRequestTitle(node: SemanticNode) {
  const request = node.architecture?.request;
  if (!request) return node.label;
  const expression = publicUrlText(request.expression ?? '').replace(/\s+/g, ' ').trim();
  return `${({ http: 'HTTP要求', process: '起動要求', auth: '認証要求' })[request.kind]}：${expression ? expression.length > 60 ? `${expression.slice(0, 59)}…` : expression : '式未記録'}`;
}

/** Partition original IDs, independently of camera visibility and density rendering. */
export function architectureRequestPartition(memberIds: readonly string[], visible: SemanticGraph) {
  const originals = [...new Set(memberIds)], visibleIds = new Set(visible.nodes.filter(node => !node.attributes.architectureRequestGroup).map(node => node.id));
  const individualIds = originals.filter(id => visibleIds.has(id));
  const groupedIds = originals.filter(id => !visibleIds.has(id));
  return { originalIds: originals, individualIds, groupedIds };
}

/** Explain provider resource records from typed metadata, never from a label suffix. */
export function architectureProviderExplanation(node: SemanticNode): string | undefined {
  const identity = node.architecture?.identity;
  if (identity?.type !== 'firebase-emulator-suite' || node.attributes.provider !== 'firebase-emulator-suite') return undefined;
  const declared = identity.configurations.some(setting => /(^|\/)firebase\.json$/.test(setting.path));
  return `${declared ? 'firebase.jsonのemulators宣言から作成したSuiteのサービス構成です。' : '接続APIの設定から作成したSuiteのサービス参照です。接続設定オブジェクトそのものを表すノードではありません。'}${identity.status === 'confirmed' ? '記録されたプロジェクト・環境・識別子を元に同一性を判定しています。' : '対応するSuite本体との同一性は未確認です。名称だけで統合していません。'}包含線は個別Emulatorの設定上の構成を表します。宣言・接続設定の存在は、現在の起動や接続成功を意味しません。`;
}
