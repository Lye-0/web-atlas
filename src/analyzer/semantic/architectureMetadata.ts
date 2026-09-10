import type { SemanticEvidence } from './types';

export interface ArchitectureConfigurationOccurrence {
  id: string; path: string; environment: string; binding?: string; name?: string;
  identifier?: string; evidence: SemanticEvidence[];
}
export interface ArchitectureIdentity {
  status: 'confirmed' | 'unconfirmed'; type: string; identifier?: string; scope?: string;
  reason: string; configurations: ArchitectureConfigurationOccurrence[];
}
export interface ArchitectureCodeUsage {
  status: 'unconfirmed' | 'declared' | 'source'; consumerIds: string[];
  reason: string; declarationEvidence: SemanticEvidence[]; sourceEvidence: SemanticEvidence[];
}
export interface ArchitectureTechnology {
  name: string; usage: 'source' | 'support' | 'declared' | 'configuration'; reason: string;
  declarations: { section: string; path: string; evidence: SemanticEvidence[] }[];
  evidence: SemanticEvidence[];
}
export interface ArchitectureRequest {
  kind: 'http' | 'process' | 'auth'; ownerId: string; expression: string;
  /** Original request / call-site identity. A display group never replaces it. */
  sourceId: string;
}

export const architectureKindLabels = {
  application: 'アプリ・実行単位', component: '内部コンポーネント', 'shared-code': '共有コード',
  'code-package': 'コードパッケージ', resource: 'リソース', 'external-service': '外部サービス',
  'external-program': '外部プログラム', unresolved: '相手が未特定の要求',
};

export function architectureEnvironmentLabel(environments: readonly string[]) {
  const names = environments.filter(name => !name.startsWith('except:')).map(name => name === 'default' ? '既定設定' : name);
  return names.length > 1 ? `複数環境の設定あり · ${names.join(' / ')}` : names[0] ?? '環境未特定';
}
