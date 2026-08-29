import { Link } from 'react-router-dom';
import type { CategoryTreeNode } from '../../utils/categoryHierarchy';
import { categoryTrees } from '../../utils/categoryHierarchy';
import { presentText } from '../../utils/presentationText';
import { categoryPath } from '../../utils/routes';

function CategoryTreeItem({ node }: { node: CategoryTreeNode }) {
  const { category, children } = node;

  return (
    <li className="category-index-item">
      <Link className="category-index-link" to={categoryPath(category.id)} title={presentText(category.description)}>
        <span className="category-index-marker" aria-hidden="true" />
        <span className="category-index-copy">
          <strong>{category.name}</strong>
          <span>{presentText(category.summary)}</span>
        </span>
        <span className="category-index-arrow" aria-hidden="true">↗</span>
      </Link>
      {children.length > 0 && (
        <ul className="category-index-children">
          {children.map((child) => <CategoryTreeItem key={child.category.id} node={child} />)}
        </ul>
      )}
    </li>
  );
}

export function CategoryTable() {
  return (
    <div className="category-index" aria-label="カテゴリーの階層一覧">
      {categoryTrees.map(({ category, children }) => (
        <section className="category-index-group" key={category.id} aria-labelledby={`category-group-${category.id}`}>
          <Link className="category-index-root" to={categoryPath(category.id)} title={presentText(category.description)}>
            <span className="category-index-root-marker" aria-hidden="true" />
            <span className="category-index-root-copy">
              <span className="category-index-type">分類</span>
              <strong id={`category-group-${category.id}`}>{category.name}</strong>
            </span>
            <span className="category-index-root-summary">{presentText(category.summary)}</span>
            <span className="category-index-arrow" aria-hidden="true">↗</span>
          </Link>
          {children.length > 0 && (
            <ul className="category-index-children category-index-children-root">
              {children.map((child) => <CategoryTreeItem key={child.category.id} node={child} />)}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
