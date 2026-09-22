import { NavLink } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';

const LINKS = [
  { to: '/admin', key: 'adminHome' },
  { to: '/admin/members', key: 'adminMembers' },
  { to: '/admin/audit', key: 'adminAudit' },
  { to: '/admin/logs', key: 'adminLogs' },
  { to: '/admin/support', key: 'adminSupport' }
];

export default function AdminNav() {
  const { t } = useLanguage();
  return (
    <nav className="admin-nav" aria-label="Admin">
      {LINKS.map((l) => (
        <NavLink
          key={l.to}
          to={l.to}
          end={l.to === '/admin'}
          className={({ isActive }) => `admin-nav__item ${isActive ? 'is-active' : ''}`.trim()}
        >
          {t(l.key)}
        </NavLink>
      ))}
    </nav>
  );
}