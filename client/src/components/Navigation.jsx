import { NavLink, useLocation } from 'react-router-dom';
import './Navigation.css';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import useStandalone from '../hooks/useStandalone';
import Button from './Button';
import { HomeIcon, UsersIcon, UserIcon, ShieldIcon } from './icons';

function LanguageToggle() {
  const { lang, setLang, t } = useLanguage();
  return (
    <button className="nav-toggle" onClick={() => setLang(lang === 'en' ? 'am' : 'en')} title={t('language')} aria-label={t('language')}>
      {lang === 'en' ? 'አማ' : 'EN'}
    </button>
  );
}

function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme();
  const { t } = useLanguage();
  return (
    <button className="nav-toggle" onClick={toggleTheme} title={t('theme')} aria-label={t('theme')}>
      {isDark ? '☀' : '☾'}
    </button>
  );
}

export default function Navigation() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();
  useStandalone(); // applies the `is-standalone` class for PWA bottom-padding

  const memberItems = [
    { to: '/dashboard', key: 'home', icon: HomeIcon },
    { to: '/community', key: 'community', icon: UsersIcon },
    { to: '/profile', key: 'profile', icon: UserIcon }
  ];

  const brandTo = user ? '/dashboard' : '/';

  // The Login button is only shown on the landing page and only for guests.
  const showLogin = !user && location.pathname === '/';

  return (
    <>
      <header className="topbar">
        <NavLink to={brandTo} className="topbar__brand">
          THE&nbsp;100
        </NavLink>

        {user ? (
          <nav className="topbar__nav">
            {memberItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `topnav__item ${isActive ? 'is-active' : ''}`.trim()}
              >
                <item.icon size={16} />
                <span>{t(item.key)}</span>
              </NavLink>
            ))}
          </nav>
        ) : null}

        <div className="topbar__actions">
          {user?.isAdmin ? (
            <NavLink to="/admin" className="nav-toggle" title={t('admin')} aria-label={t('admin')}>
              <ShieldIcon size={16} />
            </NavLink>
          ) : null}
          {showLogin ? (
            <NavLink to="/login">
              <Button variant="primary" size="sm">
                {t('login')}
              </Button>
            </NavLink>
          ) : null}
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </header>

      {user ? (
        <nav className="bottomnav">
          {memberItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `bottomnav__item ${isActive ? 'is-active' : ''}`.trim()}
            >
              <item.icon size={20} />
              <span className="bottomnav__label">{t(item.key)}</span>
            </NavLink>
          ))}
        </nav>
      ) : null}
    </>
  );
}