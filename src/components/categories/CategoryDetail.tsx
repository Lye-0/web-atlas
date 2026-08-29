import { Link } from 'react-router-dom';
import { categories, stacksForCategory } from '../../data';
import type { CategoryEntry } from '../../types';
import { categoryPath, stackPath } from '../../utils/routes';

export function CategoryDetail({ category }: { category: CategoryEntry }) {
  const childCategories = categories.filter((candidate) => candidate.parentCategoryId === category.id);
  const parentCategory = category.parentCategoryId ? categories.find((candidate) => candidate.id === category.parentCategoryId) : undefined;
  const relatedCategories = (category.relatedCategoryIds ?? [])
    .map((id) => categories.find((candidate) => candidate.id === id))
    .filter((candidate): candidate is CategoryEntry => Boolean(candidate));
  const categoryStacks = stacksForCategory(category.id);

  return (
    <article className="detail-layout" aria-labelledby="category-title">
      <div className="detail-main">
        <div className="breadcrumb">
          <Link to="/dictionary/categories">Categories</Link>
          <span aria-hidden="true">/</span>
          <span>{category.name}</span>
        </div>
        <header className="detail-header">
          <p className="eyebrow">CATEGORY / {category.id}</p>
          <h1 id="category-title">{category.name}</h1>
          <p className="detail-summary">{category.summary}</p>
          <p className="detail-description">{category.description}</p>
        </header>

        {parentCategory && (
          <p className="context-note">
            上位分類：<Link to={categoryPath(parentCategory.id)}>{parentCategory.name}</Link>
          </p>
        )}

        <div className="detail-section-grid">
          <section className="detail-section detail-section-emphasis">
            <p className="section-kicker">ROLE</p>
            <h2>主な役割</h2>
            <p>{category.role}</p>
          </section>
          <section className="detail-section">
            <p className="section-kicker">USE CASES</p>
            <h2>使われる場面</h2>
            <ul className="clean-list">
              {category.useCases.map((useCase) => <li key={useCase}>{useCase}</li>)}
            </ul>
          </section>
        </div>

        {childCategories.length > 0 && (
          <section className="detail-section" aria-labelledby="child-categories-title">
            <div className="section-heading-row">
              <div>
                <p className="section-kicker">SUBCATEGORIES</p>
                <h2 id="child-categories-title">下位分類</h2>
              </div>
              <span className="section-count">{childCategories.length}</span>
            </div>
            <div className="inline-link-grid">
              {childCategories.map((child) => (
                <Link className="mini-link-card" key={child.id} to={categoryPath(child.id)}>
                  <span className="mini-link-label">Category</span>
                  <strong>{child.name}</strong>
                  <span>{child.summary}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="detail-section" aria-labelledby="differences-title">
          <p className="section-kicker">DISTINCTIONS</p>
          <h2 id="differences-title">他の分類との違い</h2>
          <div className="difference-list">
            {category.differences.map((item) => (
              <div className="difference-item" key={item.against}>
                <h3>{item.against}</h3>
                <p>{item.explanation}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="detail-section" aria-labelledby="category-stacks-title">
          <div className="section-heading-row">
            <div>
              <p className="section-kicker">CONCRETE STACKS</p>
              <h2 id="category-stacks-title">具体的なStack</h2>
            </div>
            <span className="section-count">{categoryStacks.length}</span>
          </div>
          {categoryStacks.length > 0 ? (
            <div className="stack-link-grid">
              {categoryStacks.map((stack) => (
                <Link className="stack-link-card" key={stack.id} to={stackPath(stack.id)}>
                  <span className="stack-link-dot" aria-hidden="true" />
                  <span>
                    <strong>{stack.name}</strong>
                    <span>{stack.summary}</span>
                  </span>
                  <span className="card-arrow" aria-hidden="true">↗</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="muted-copy">この上位分類には、直接紐づく具体的なStackはありません。下位分類からたどれます。</p>
          )}
        </section>
      </div>

      <aside className="detail-aside" aria-label="Category navigation">
        <div className="aside-card">
          <p className="section-kicker">RELATED CATEGORIES</p>
          <div className="aside-links">
            {relatedCategories.length > 0 ? relatedCategories.map((related) => (
              <Link key={related.id} to={categoryPath(related.id)}>{related.name}<span aria-hidden="true">↗</span></Link>
            )) : <span className="muted-copy">関連分類はありません。</span>}
          </div>
        </div>
        <div className="aside-card aside-tip">
          <span className="aside-tip-mark" aria-hidden="true">i</span>
          <p>分類名だけでなく、役割と違いを読むと、似た技術の選択基準が見えてきます。</p>
        </div>
      </aside>
    </article>
  );
}
