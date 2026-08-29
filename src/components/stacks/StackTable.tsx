import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { categoryById, stacks } from '../../data';
import type { StackEntry } from '../../types';
import { getRootCategoryId } from '../../utils/categoryHierarchy';
import { presentText } from '../../utils/presentationText';
import { categoryPath, stackPath } from '../../utils/routes';

interface StackFilter {
  id: string;
  label: string;
  rootCategoryIds?: string[];
}

const stackFilters: StackFilter[] = [
  { id: 'all', label: 'すべて' },
  {
    id: 'language-runtime',
    label: '言語と実行基盤',
    rootCategoryIds: ['markup-language', 'stylesheet-language', 'programming-language', 'runtime', 'package-manager'],
  },
  {
    id: 'application',
    label: 'UIとアプリケーション',
    rootCategoryIds: ['framework', 'library', 'ui-component-system', 'build-tool', 'auth-service'],
  },
  { id: 'data', label: 'データとストレージ', rootCategoryIds: ['database', 'storage'] },
  { id: 'quality', label: '品質と検証', rootCategoryIds: ['testing', 'code-quality'] },
  {
    id: 'delivery',
    label: '開発と配信',
    rootCategoryIds: ['version-control', 'development-platform', 'ci-cd', 'container', 'deployment-platform'],
  },
];

const statusLabel: Record<StackEntry['status'], string> = {
  active: '',
  experimental: '実験的',
  legacy: 'レガシー',
  deprecated: '非推奨',
};

export function StackTable() {
  const [filterId, setFilterId] = useState('all');
  const selectedFilter = stackFilters.find((filter) => filter.id === filterId) ?? stackFilters[0];
  const visibleStacks = useMemo(
    () => stacks.filter((stack) => {
      if (!selectedFilter.rootCategoryIds) return true;
      return selectedFilter.rootCategoryIds.includes(getRootCategoryId(stack.categoryId));
    }),
    [selectedFilter],
  );

  return (
    <div className="stack-index">
      <div className="stack-toolbar">
        <label htmlFor="stack-category-filter">分類で絞り込む</label>
        <select
          id="stack-category-filter"
          value={filterId}
          onChange={(event) => setFilterId(event.target.value)}
        >
          {stackFilters.map((filter) => <option key={filter.id} value={filter.id}>{filter.label}</option>)}
        </select>
        <span className="stack-result-count" aria-live="polite">{visibleStacks.length}件</span>
      </div>

      <div className="stack-index-list" role="list" aria-label="技術一覧">
        {visibleStacks.map((stack) => {
          const category = categoryById.get(stack.categoryId);
          return (
            <div className="stack-index-row" role="listitem" key={stack.id}>
              <Link className="stack-index-main" to={stackPath(stack.id)}>
                <strong>{stack.name}</strong>
                <span>{presentText(stack.summary)}</span>
              </Link>
              <div className="stack-index-meta">
                {category && <Link className="stack-index-category" to={categoryPath(category.id)}>{category.name}</Link>}
                {stack.status !== 'active' && <span className={`stack-status stack-status-${stack.status}`}>{statusLabel[stack.status]}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {visibleStacks.length === 0 && <p className="empty-state">この分類に該当する技術はありません。</p>}
    </div>
  );
}
