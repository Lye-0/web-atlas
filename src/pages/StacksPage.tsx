import { Link } from 'react-router-dom';
import { StackTable } from '../components/stacks/StackTable';

export function StacksPage() {
  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <p className="eyebrow">03 / TECHNOLOGIES</p>
          <h1>Stacks</h1>
          <p className="hero-copy">
            Vite、React、D1、R2のような具体的な技術が、Web開発のどこで何を担当するのかを調べられます。
          </p>
        </div>
        <Link className="outlined-action" to="/dictionary/map">Mapを見る <span aria-hidden="true">↗</span></Link>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">STACK INDEX</p>
            <h2>技術一覧</h2>
          </div>
          <p className="panel-heading-note">名称、分類、役割を一覧し、詳細ページで関係性をたどれます。</p>
        </div>
        <StackTable />
      </section>
    </div>
  );
}
