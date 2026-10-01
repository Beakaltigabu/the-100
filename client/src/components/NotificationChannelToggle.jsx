import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import './NotificationChannelToggle.css';

const PREF_TYPES = ['announcement', 'reminder', 'event', 'milestone', 'finish', 'weekly_checkin', 'inactivity', 'nudge'];

// Compact master toggles for the Profile page: in-app (web) and push, with a
// link to the full preferences grid on the notifications page.
export default function NotificationChannelToggle({ onError }) {
  const { t } = useLanguage();
  const [prefs, setPrefs] = useState({});

  useEffect(() => {
    api
      .get('/api/notifications/preferences')
      .then((d) => setPrefs(d.preferences || {}))
      .catch((err) => onError && onError(err.message));
  }, [onError]);

  const channelOn = useCallback((channel) => PREF_TYPES.every((pt) => prefs[`${channel}:${pt}`] ?? true), [prefs]);

  const toggle = (channel) => {
    const nextOn = !channelOn(channel);
    setPrefs((prev) => {
      const next = { ...prev };
      PREF_TYPES.forEach((pt) => {
        next[`${channel}:${pt}`] = nextOn;
      });
      return next;
    });
    const payload = PREF_TYPES.map((pt) => ({ channel, type: pt, enabled: nextOn }));
    api.put('/api/notifications/preferences', { preferences: payload }).catch((err) => onError && onError(err.message));
  };

  const rows = [
    { key: 'web', title: 'In-app notifications' },
    { key: 'push', title: 'Push notifications' }
  ];

  return (
    <div className="pf-surface">
      {rows.map((row) => (
        <div className="pf-row" key={row.key}>
          <div className="pf-row__main">
            <span className="pf-row__title">{row.title}</span>
            <span className="pf-row__status">{channelOn(row.key) ? t('notifOn') : t('notifOff')}</span>
          </div>
          <div className="pf-row__actions">
            <button
              type="button"
              className={`switch ${channelOn(row.key) ? 'is-on' : ''}`}
              role="switch"
              aria-checked={channelOn(row.key)}
              aria-label={row.title}
              onClick={() => toggle(row.key)}
            >
              <span className="switch__knob" />
            </button>
          </div>
        </div>
      ))}
      <p className="notif-manage">
        <Link to="/notifications" className="notif-manage__link">
          {t('notifManage')}
        </Link>
      </p>
    </div>
  );
}