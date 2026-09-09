import type { ArchitectureConfigurationOccurrence, ArchitectureIdentity } from './architectureMetadata';

export function architectureResourceIdentity(type: string, setting: Record<string, unknown>, account: string, occurrence: ArchitectureConfigurationOccurrence): { key?: string[]; identity: ArchitectureIdentity } {
  const text = (value: unknown) => typeof value === 'string' && !/^\*+$/.test(value) ? value : '';
  const identifier = type === 'D1' ? text(setting.database_id) : type === 'KV' ? text(setting.id)
    : type === 'R2' && account ? text(setting.bucket_name) : type === 'Service binding' && account ? text(setting.service) : '';
  const scope = account || undefined;
  return {
    key: identifier ? ['resource-identity', type, scope ?? 'stable-id', identifier] : undefined,
    identity: { status: identifier ? 'confirmed' : 'unconfirmed', type, identifier: identifier || undefined, scope,
      reason: identifier ? `${type}の${account ? 'アカウントと' : ''}識別子が一致する設定を同じ対象へ対応付け`
        : '名前・binding・設定の存在を確認。安定した識別子または必要な設定範囲が不足し、他の設定との同一性は未確認',
      configurations: [{ ...occurrence, identifier: identifier || undefined }],
    },
  };
}
