import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import './NotificationPreferences.css';

const PREF_TYPES = ['announcement', 'reminder', 'event', 'milestone', 'finish', 'weekly_checkin', 'inactivity', 'nudge'];
const CHANNELS = [
  { key: 'web', label: 'Web' },
  { key: 'telegram', label: 'Telegram' },
  { key: 'push', label: 'Push' }
];

const CHANNEL_LABEL = { web: 'Web', telegram: 'Telegram', push: 'Push' };

// Shared per-channel × per-type notification opt-out grid. Admin messages and
// nudges are always delivered and are not represented here.
export default function NotificationPreferences({ onError }) {
  const { t } = useLanguage();
  const [prefs, setPrefs] = useState({});

  useEffect(() => {
    api
      .get('/api/notifications/preferences')
      .then((d) => setPrefs(d.preferences || {}))
      .catch((err) => onError && onError(err.message));
  }, [onError]);

  const toggle = useCallback(
    (channel, type) => {
      const key = `${channel}:${type}`;
      const next = { ...prefs, [key]: !(prefs[key] ?? true) };
      setPrefs(next);
      const payload = PREF_TYPES.filter((pt) => next[`${channel}:${pt}`] === false).map((pt) => ({ channel, type: pt, enabled: false }));
      api.put('/api/notifications/preferences', { preferences: payload }).catch((err) => onError && onError(err.message));
    },
    [prefs, onError]
  );

  return (
    <div className="notif-prefs">
      <div className="notif-prefs__head">
        <span />
        {CHANNELS.map((c) => (
          <span className="notif-prefs__chan" key={c.key}>
            {CHANNEL_LABEL[c.key]}
          </span>
        ))}
      </div>
      {PREF_TYPES.map((type) => (
        <div className="notif-prefs__row" key={type}>
          <span className="notif-prefs__label">{type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</span>
          {CHANNELS.map((channel) => {
            const on = prefs[`${channel.key}:${type}`] ?? true;
            return (
              <span className="notif-prefs__switch-wrap" key={channel.key}>
                <button
                  type="button"
                  className={`switch ${on ? 'is-on' : ''}`}
                  role="switch"
                  aria-checked={on}
                  aria-label={`${CHANNEL_LABEL[channel.key]} ${type.replace(/_/g, ' ')}`}
                  onClick={() => toggle(channel.key, type)}
                >
                  <span className="switch__knob" />
                </button>
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}