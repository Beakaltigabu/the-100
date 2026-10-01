import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from './Toast';
import Button from './Button';
import { pushSupported, currentSubscription, subscribeToPush } from '../lib/push';
import './PushBanner.css';

const DISMISS_KEY = 'the100_push_dismissed';

export default function PushBanner() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { showToast } = useToast();
  // Dismissed per session so a user who isn't subscribed is asked on every
  // new login session (per requirement), until they subscribe or deny.
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  // Show by default (subscribed=false); only hide once a real subscription is
  // confirmed. The SW-ready check is time-bounded in lib/push so this can't hang.
  const check = useCallback(() => {
    if (!pushSupported()) return;
    currentSubscription().then((sub) => setSubscribed(!!sub)).catch(() => setSubscribed(false));
  }, []);

  useEffect(check, [check]);

  const denied = typeof Notification !== 'undefined' && Notification.permission === 'denied';
  if (!user || !pushSupported() || subscribed || dismissed || denied) return null;

  const enable = async () => {
    setBusy(true);
    try {
      await subscribeToPush();
      setSubscribed(true);
      showToast(t('pushEnabled'), 'success');
    } catch {
      showToast(t('pushError'), 'error');
      setDismissed(true);
    } finally {
      setBusy(false);
    }
  };

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  return (
    <div className="push-banner" role="dialog" aria-label={t('pushEnable')}>
      <div className="push-banner__body">
        <div className="push-banner__title">{t('pushEnable')}</div>
        <div className="push-banner__note">{t('pushEnableBody')}</div>
      </div>
      <div className="push-banner__actions">
        <Button variant="primary" size="sm" onClick={enable} disabled={busy}>
          {busy ? '…' : t('pushEnableNow')}
        </Button>
        <button className="push-banner__dismiss" onClick={dismiss}>
          {t('notNow')}
        </button>
      </div>
    </div>
  );
}