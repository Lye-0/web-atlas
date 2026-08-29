import { NavLink } from 'react-router-dom';
import { dictionaryRoutes } from '../../utils/routes';

const links = [
  { to: dictionaryRoutes.map, label: 'Map', hint: '全体像' },
  { to: dictionaryRoutes.categories, label: 'Categories', hint: '分類を知る' },
  { to: dictionaryRoutes.stacks, label: 'Stacks', hint: '技術を知る' },
];

export function DictionaryNav() {
  return (
    <nav className="dictionary-nav" aria-label="Dictionary navigation">
      {links.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}
          end={link.to === dictionaryRoutes.map}
        >
          <span>{link.label}</span>
          <span className="nav-link-hint">{link.hint}</span>
        </NavLink>
      ))}
    </nav>
  );
}
