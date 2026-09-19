import { Link } from 'react-router-dom';
import { useRef } from 'react';
import { categories, stacks, dictionaryVisualGroups } from '../data';
import { StackMap } from '../components/map/StackMap';
import { dictionaryRoutes } from '../utils/routes';

export function MapPage() {
  const sectionRef = useRef<HTMLElement>(null);
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

      <section ref={sectionRef} className="dictionary-section map-section" aria-labelledby="map-title">
        <div className="section-heading map-section-heading">
          <div>
            <h2 id="map-title">構造</h2>
          </div>
          <p className="section-note">{categories.length}分類・{stacks.length}技術。線は親子関係を示します。</p>
          <nav className="map-group-jumps" aria-label="マップのグループへ移動">
            {[...dictionaryVisualGroups].sort((a, b) => a.order - b.order).map(group => <button key={group.id} type="button"
              onClick={() => {
                const target = [...(sectionRef.current?.querySelectorAll<HTMLElement>('[data-map-focus]') ?? [])]
                  .find(element => element.dataset.mapFocus === `group:${group.id}` && element.getClientRects().length > 0);
                target?.focus({ preventScroll: true });
                target?.scrollIntoView({ block: 'start', behavior: 'instant' });
              }}>{group.label}</button>)}
          </nav>
        </div>
        <StackMap />
      </section>
    </div>
  );
}
