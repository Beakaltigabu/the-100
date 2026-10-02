import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from './Toast';
import Button from './Button';
import { pushSupported, currentSubscription, subscribeToPush } from '../lib/push';
import './PushBanner.css';

const ASK_KEY = 'the100_push_last_asked';

// Local-day key so the banner is shown at most once per day per browser.
function todayKey() {
  return new Date().toDateString();
}

export default function PushBanner() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { showToast } = useToast();
  // Ask at most once per day (persisted across sessions) — not every login.
  const [lastAsked, setLastAsked] = useState(() => {
    try {
      return localStorage.getItem(ASK_KEY) || '';
    } catch {
      return '';
    }
  });
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  const dismissed = lastAsked === todayKey();

  // Show by default (subscribed=false); only hide once a real subscription is
  // confirmed. The SW-ready check is time-bounded in lib/push so this can't hang.
  const check = useCallback(() => {
    if (!pushSupported()) return;
    currentSubscription().then((sub) => setSubscribed(!!sub)).catch(() => setSubscribed(false));
  }, []);

  useEffect(check, [check]);

  const markAsked = useCallback(() => {
    try {
      localStorage.setItem(ASK_KEY, todayKey());
    } catch {
      /* ignore */
    }
    setLastAsked(todayKey());
  }, []);

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
      markAsked(); // don't nag mid-session; retry tomorrow
    } finally {
      setBusy(false);
    }
  };

  const dismiss = () => markAsked();

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