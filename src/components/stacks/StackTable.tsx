import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { categoryById, dictionaryVisualGroups, stacks } from '../../data';
import { getRootCategoryId } from '../../utils/categoryHierarchy';
import { categoryPath, stackPath } from '../../utils/routes';
import { stackStatusLabels } from '../../utils/stackStatus';

interface StackFilter {
  id: string;
  label: string;
  rootCategoryIds?: string[];
}

const stackFilters: StackFilter[] = [
  { id: 'all', label: 'すべて' },
  ...dictionaryVisualGroups.map(({ id, label, rootCategoryIds }) => ({ id, label, rootCategoryIds })),
];

function isStackInGroup(stack: (typeof stacks)[number], rootCategoryIds: string[]) {
  return rootCategoryIds.includes(getRootCategoryId(stack.categoryId));
}

function StackRow({ stack }: { stack: (typeof stacks)[number] }) {
  const category = categoryById.get(stack.categoryId);

  return (
    <div className="stack-index-row" role="listitem">
      <div className="stack-index-main">
        <Link className="stack-index-title" to={stackPath(stack.id)}>
          <strong>{stack.name}</strong>
        </Link>
        {category && <Link className="stack-index-category" to={categoryPath(category.id)}>{category.name}</Link>}
        <span className="stack-index-summary">{stack.summary}</span>
      </div>
      <div className="stack-index-meta">
        {stack.status !== 'active' && <span className={`stack-status stack-status-${stack.status}`}>{stackStatusLabels[stack.status]}</span>}
      </div>
    </div>
  );
}

export function StackTable() {
  const [filterId, setFilterId] = useState('all');
  const selectedFilter = stackFilters.find((filter) => filter.id === filterId) ?? stackFilters[0];
  const visibleStacks = useMemo(
    () => stacks.filter((stack) => {
      if (!selectedFilter.rootCategoryIds) return true;
      return isStackInGroup(stack, selectedFilter.rootCategoryIds);
    }),
    [selectedFilter],
  );

  const groupedStacks = useMemo(
    () => dictionaryVisualGroups.map((group) => ({
      group,
      stacks: stacks.filter((stack) => isStackInGroup(stack, group.rootCategoryIds)),
    })),
    [],
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

      {filterId === 'all' ? (
        <div className="stack-index-groups">
          {groupedStacks.map(({ group, stacks: groupStacks }) => (
            <section className="stack-index-visual-group" key={group.id} aria-labelledby={`stack-visual-group-${group.id}`}>
              <header className="stack-index-visual-heading">
                <span className="category-index-root-marker" aria-hidden="true" />
                <div>
                  <h3 id={`stack-visual-group-${group.id}`}>{group.label}</h3>
                  <p>{group.description}</p>
                </div>
              </header>
              <div className="stack-index-list" role="list" aria-label={`${group.label}の技術一覧`}>
                {groupStacks.map((stack) => <StackRow key={stack.id} stack={stack} />)}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="stack-index-list" role="list" aria-label="技術一覧">
          {visibleStacks.map((stack) => <StackRow key={stack.id} stack={stack} />)}
        </div>
      )}

      {visibleStacks.length === 0 && <p className="empty-state">この分類に該当する技術はありません。</p>}
    </div>
  );
}
