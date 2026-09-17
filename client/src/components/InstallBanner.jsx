import { useState } from 'react';
import './InstallBanner.css';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import useInstallPrompt from '../hooks/useInstallPrompt';
import Button from './Button';

const DISMISS_KEY = 'the100_install_dismissed';

export default function InstallBanner() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { canInstall, install } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  if (!user || !canInstall || dismissed) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  return (
    <div className="install-banner" role="dialog" aria-label={t('installApp')}>
      <div className="install-banner__body">
        <div className="install-banner__title">{t('installApp')}</div>
        <div className="install-banner__note">{t('installAppBody')}</div>
      </div>
      <div className="install-banner__actions">
        <Button variant="primary" size="sm" onClick={install}>
          {t('installNow')}
        </Button>
        <button className="install-banner__dismiss" onClick={dismiss}>
          {t('notNow')}
        </button>
      </div>
    </div>
  );
}