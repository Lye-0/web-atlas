import { Link } from 'react-router-dom';
import { CategoryTable } from '../components/categories/CategoryTable';

export function CategoriesPage() {
  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <p className="eyebrow">02 / 分類</p>
          <h1>Categories</h1>
          <p className="intro-copy">分類概念から、技術の役割と違いを理解します。</p>
        </div>
        <Link className="intro-link" to="/dictionary/map">Mapを見る <span aria-hidden="true">→</span></Link>
      </section>
      <section className="dictionary-section categories-section" aria-labelledby="categories-title">
        <div className="section-heading">
          <div>
            <p className="section-kicker">分類の階層</p>
            <h2 id="categories-title">分類一覧</h2>
          </div>
          <p className="section-note">上位分類から下位分類へたどり、詳細ページで比較を読めます。</p>
        </div>
        <CategoryTable />
      </section>
    </div>
  );
}
