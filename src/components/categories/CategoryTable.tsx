import { Link } from 'react-router-dom';
import { dictionaryVisualGroups } from '../../data';
import type { CategoryTreeNode } from '../../utils/categoryHierarchy';
import { categoryTreeById } from '../../utils/categoryHierarchy';
import { categoryPath } from '../../utils/routes';

function CategoryTreeItem({ node }: { node: CategoryTreeNode }) {
  const { category, children } = node;

  return (
    <li className="category-index-item">
      <Link className="category-index-link" to={categoryPath(category.id)} title={category.description}>
        <span className="category-index-marker" aria-hidden="true" />
        <span className="category-index-copy">
          <strong>{category.name}</strong>
          <span>{category.summary}</span>
        </span>
        <span className="category-index-arrow" aria-hidden="true">→</span>
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
      {dictionaryVisualGroups.map((visualGroup) => {
        const rootTrees = visualGroup.rootCategoryIds
          .map((categoryId) => categoryTreeById.get(categoryId))
          .filter((tree): tree is CategoryTreeNode => Boolean(tree));

        return (
          <section
            className={`category-index-visual-group category-index-visual-group-${visualGroup.id}`}
            key={visualGroup.id}
            aria-labelledby={`category-visual-group-${visualGroup.id}`}
          >
            <header className="category-index-visual-heading">
              <span className="category-index-root-marker" aria-hidden="true" />
              <div>
                <h3 id={`category-visual-group-${visualGroup.id}`}>{visualGroup.label}</h3>
                <p>{visualGroup.description}</p>
              </div>
            </header>
            <div className="category-index-group-list">
              {rootTrees.map(({ category, children }) => (
                <section className="category-index-group" key={category.id}>
                  <Link className="category-index-root" to={categoryPath(category.id)} title={category.description}>
                    <span className="category-index-root-marker" aria-hidden="true" />
                    <span className="category-index-root-copy">
                      <strong>{category.name}</strong>
                    </span>
                    <span className="category-index-root-summary">{category.summary}</span>
                    <span className="category-index-arrow" aria-hidden="true">→</span>
                  </Link>
                  {children.length > 0 && (
                    <ul className="category-index-children category-index-children-root">
                      {children.map((child) => <CategoryTreeItem key={child.category.id} node={child} />)}
                    </ul>
                  )}
                </section>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
