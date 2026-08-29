import { Link } from 'react-router-dom';
import { categories, stacksForCategory } from '../../data';
import type { CategoryEntry } from '../../types';
import { presentText } from '../../utils/presentationText';
import { categoryPath, stackPath } from '../../utils/routes';

const pageSections = [
  { href: '#role', label: '主な役割' },
  { href: '#use-cases', label: '使われる場面' },
  { href: '#subcategories', label: '下位分類' },
  { href: '#differences', label: '他の分類との違い' },
  { href: '#stacks', label: '具体的な技術' },
];

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

        <header className="detail-header" id="overview">
          <p className="eyebrow">分類</p>
          <h1 id="category-title">{category.name}</h1>
          <p className="detail-summary">{presentText(category.summary)}</p>
          <p className="detail-description">{presentText(category.description)}</p>
          {parentCategory && (
            <p className="detail-context">
              上位分類：<Link to={categoryPath(parentCategory.id)}>{parentCategory.name}</Link>
            </p>
          )}
        </header>

        <section className="document-section" id="role" aria-labelledby="role-title">
          <p className="section-kicker">役割</p>
          <h2 id="role-title">主な役割</h2>
          <p>{presentText(category.role)}</p>
        </section>

        <section className="document-section" id="use-cases" aria-labelledby="use-cases-title">
          <p className="section-kicker">利用場面</p>
          <h2 id="use-cases-title">使われる場面</h2>
          <ul className="clean-list">
            {category.useCases.map((useCase) => <li key={useCase}>{presentText(useCase)}</li>)}
          </ul>
        </section>

        {childCategories.length > 0 && (
          <section className="document-section" id="subcategories" aria-labelledby="child-categories-title">
            <p className="section-kicker">階層</p>
            <h2 id="child-categories-title">下位分類</h2>
            <div className="document-link-list">
              {childCategories.map((child) => (
                <Link className="document-link-row" key={child.id} to={categoryPath(child.id)}>
                  <span className="document-link-copy">
                    <strong>{child.name}</strong>
                    <span>{presentText(child.summary)}</span>
                  </span>
                  <span aria-hidden="true">↗</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="document-section" id="differences" aria-labelledby="differences-title">
          <p className="section-kicker">比較</p>
          <h2 id="differences-title">他の分類との違い</h2>
          <div className="comparison-list">
            {category.differences.map((item) => (
              <div className="comparison-row" key={item.against}>
                <h3>{item.against}との違い</h3>
                <p>{presentText(item.explanation)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="document-section" id="stacks" aria-labelledby="category-stacks-title">
          <p className="section-kicker">代表例</p>
          <h2 id="category-stacks-title">具体的な技術</h2>
          {categoryStacks.length > 0 ? (
            <div className="document-link-list">
              {categoryStacks.map((stack) => (
                <Link className="document-link-row" key={stack.id} to={stackPath(stack.id)}>
                  <span className="document-link-copy">
                    <strong>{stack.name}</strong>
                    <span>{presentText(stack.summary)}</span>
                  </span>
                  <span aria-hidden="true">↗</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="muted-copy">この分類に直接紐づく技術はありません。下位分類からたどれます。</p>
          )}
        </section>
      </div>

      <aside className="detail-aside" aria-label="このページの案内">
        <nav className="detail-toc" aria-label="ページ内目次">
          <p className="aside-heading">このページ</p>
          <a href="#overview">概要</a>
          {pageSections
            .filter((section) => section.href !== '#subcategories' || childCategories.length > 0)
            .map((section) => <a href={section.href} key={section.href}>{section.label}</a>)}
        </nav>
        <nav className="detail-related" aria-label="関連する分類">
          <p className="aside-heading">関連する分類</p>
          {relatedCategories.length > 0 ? relatedCategories.map((related) => (
            <Link key={related.id} to={categoryPath(related.id)}>{related.name}<span aria-hidden="true">↗</span></Link>
          )) : <span className="muted-copy">関連分類はありません。</span>}
        </nav>
      </aside>
    </article>
  );
}
