import { Link } from 'react-router-dom';
import { DictionaryNav } from './DictionaryNav';
import { DictionarySearch } from '../search/DictionarySearch';

export function AppHeader() {
  return (
    <header className="app-header">
      <div className="header-inner">
        <Link to="/dictionary/map" className="brand" aria-label="Web Atlas Dictionaryのホーム">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className="brand-copy">
            <span className="brand-name">Web Atlas</span>
            <span className="brand-product">Dictionary</span>
          </span>
        </Link>
        <DictionaryNav />
        <DictionarySearch />
      </div>
    </header>
  );
}
