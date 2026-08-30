import { NavLink } from 'react-router-dom';
import { analyzerRoutes, dictionaryRoutes } from '../../utils/routes';

const links = [
  { to: dictionaryRoutes.map, label: 'Map', title: '技術の全体像' },
  { to: dictionaryRoutes.categories, label: 'Categories', title: '分類を理解する' },
  { to: dictionaryRoutes.stacks, label: 'Stacks', title: '個別の技術を調べる' },
  { to: analyzerRoutes.architecture, label: 'Analyzer', title: 'ローカルプロジェクトを解析' },
];

export function DictionaryNav() {
  return (
    <nav className="dictionary-nav" aria-label="Dictionary navigation">
      {links.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}
          end={link.to === dictionaryRoutes.map || link.to === analyzerRoutes.architecture}
          title={link.title}
        >
          <span>{link.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
