import { Link } from 'react-router-dom';
import { categories, stacks } from '../data';
import { StackMap } from '../components/map/StackMap';
import { dictionaryRoutes } from '../utils/routes';

export function MapPage() {
  return (
    <div className="page-stack">
      <section className="page-intro map-intro">
        <div>
          <p className="eyebrow">01 / 全体像</p>
          <h1>Stack Map</h1>
          <p className="intro-copy">Web開発技術の分類と関係を俯瞰します。</p>
        </div>
        <div className="intro-actions">
          <Link className="intro-link" to={dictionaryRoutes.categories}>
            分類から読む <span aria-hidden="true">→</span>
          </Link>
          <Link className="intro-link" to={dictionaryRoutes.stacks}>
            技術から読む <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <section className="dictionary-section map-section" aria-labelledby="map-title">
        <div className="section-heading">
          <div>
            <p className="section-kicker">構造</p>
            <h2 id="map-title">Web開発</h2>
          </div>
          <p className="section-note">{categories.length}分類・{stacks.length}技術。線は親子関係を示します。</p>
        </div>
        <StackMap />
      </section>
    </div>
  );
}
