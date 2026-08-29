import { Link } from 'react-router-dom';
import { StackTable } from '../components/stacks/StackTable';

export function StacksPage() {
  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <p className="eyebrow">03 / 技術</p>
          <h1>Stacks</h1>
          <p className="intro-copy">個別技術の役割・特徴・関係を調べます。</p>
        </div>
        <Link className="intro-link" to="/dictionary/map">Mapを見る <span aria-hidden="true">→</span></Link>
      </section>
      <section className="dictionary-section" aria-labelledby="stacks-title">
        <div className="section-heading">
          <div>
            <p className="section-kicker">技術の索引</p>
            <h2 id="stacks-title">技術一覧</h2>
          </div>
          <p className="section-note">名称と概要から探し、詳細ページで関係をたどれます。</p>
        </div>
        <StackTable />
      </section>
    </div>
  );
}
