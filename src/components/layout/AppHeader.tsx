import { Link, useLocation } from 'react-router-dom';
import { DictionaryNav } from './DictionaryNav';
import { DictionarySearch } from '../search/DictionarySearch';
import { analyzerRoutes, dictionaryRoutes } from '../../utils/routes';

export function AppHeader() {
  const { pathname } = useLocation();
  const isAnalyzer = pathname.startsWith('/analyzer');
  return (
    <header className="app-header">
      <div className="header-inner">
        <Link to={isAnalyzer ? analyzerRoutes.architecture : dictionaryRoutes.map} className="brand" aria-label={`Web Atlas ${isAnalyzer ? 'Analyzer' : 'Dictionary'}のホーム`}>
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className="brand-copy">
            <span className="brand-name">Web Atlas</span>
            <span className="brand-product">{isAnalyzer ? 'Analyzer' : 'Dictionary'}</span>
          </span>
        </Link>
        <DictionaryNav />
        <DictionarySearch />
      </div>
    </header>
  );
}
