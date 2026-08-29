import type { DictionaryStatus } from '../types';

export const stackStatusLabels: Record<DictionaryStatus, string> = {
  active: '利用中',
  experimental: '実験的',
  legacy: 'レガシー',
  deprecated: '非推奨',
};
