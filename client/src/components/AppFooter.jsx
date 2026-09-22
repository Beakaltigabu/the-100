import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import './AppFooter.css';

export default function AppFooter() {
  const { t } = useLanguage();
  return (
    <footer className="app-footer">
      <div className="app-footer__inner">
        <nav className="app-footer__links" aria-label={t('supportLink')}>
          <Link to="/support">{t('supportLink')}</Link>
          <Link to="/privacy">{t('privacyLink')}</Link>
        </nav>
        <p className="app-footer__copyright">© {new Date().getFullYear()} THE 100</p>
      </div>
    </footer>
  );
}