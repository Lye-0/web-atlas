import { Link } from 'react-router-dom';
import { categories, stacks } from '../data';
import { StackMap } from '../components/map/StackMap';
import { dictionaryRoutes } from '../utils/routes';

export function MapPage() {
  return (
    <div className="page-stack">
      <section className="page-hero map-hero">
        <div>
          <p className="eyebrow">01 / ORIENTATION</p>
          <h1>Stack Map</h1>
          <p className="hero-copy">
            Web開発の道具を、分類と関係性から俯瞰します。気になるノードから、概念の説明や技術の詳細へ進めます。
          </p>
        </div>
        <div className="hero-actions">
          <Link className="text-link" to={dictionaryRoutes.categories}>
            分類から読む <span aria-hidden="true">↗</span>
          </Link>
          <Link className="text-link" to={dictionaryRoutes.stacks}>
            技術から読む <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>

      <section className="map-meta" aria-label="Map summary">
        <div className="map-meta-item">
          <span className="map-meta-value">{categories.length}</span>
          <span className="map-meta-label">categories</span>
        </div>
        <div className="map-meta-item">
          <span className="map-meta-value">{stacks.length}</span>
          <span className="map-meta-label">stacks</span>
        </div>
        <div className="map-meta-item map-meta-note">
          <span className="map-legend-dot category-dot" aria-hidden="true" />
          <span>分類</span>
          <span className="map-legend-dot stack-dot" aria-hidden="true" />
          <span>具体的な技術</span>
        </div>
      </section>

      <section className="panel map-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">RELATIONSHIP MAP</p>
            <h2>全体の構造</h2>
          </div>
          <p className="panel-heading-note">線は親子関係を示します。ノードはすべてリンクです。</p>
        </div>
        <StackMap />
      </section>
    </div>
  );
}
