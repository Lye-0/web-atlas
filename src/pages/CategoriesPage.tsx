import { Link } from 'react-router-dom';
import { CategoryTable } from '../components/categories/CategoryTable';

export function CategoriesPage() {
  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <p className="eyebrow">02 / CONCEPTS</p>
          <h1>Categories</h1>
          <p className="hero-copy">
            「フレームワークとライブラリは何が違う？」を、技術の名前ではなく役割と境界から理解するための分類辞書です。
          </p>
        </div>
        <Link className="outlined-action" to="/dictionary/map">Mapを見る <span aria-hidden="true">↗</span></Link>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">CATEGORY INDEX</p>
            <h2>分類一覧</h2>
          </div>
          <p className="panel-heading-note">分類名を選ぶと、役割・違い・具体的なStackを読めます。</p>
        </div>
        <CategoryTable />
      </section>
    </div>
  );
}
