import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import './BroadcastBanner.css';

const TYPE_CLASS = {
  announcement: 'bb--announcement',
  reminder: 'bb--reminder',
  nudge: 'bb--nudge',
  event: 'bb--event',
  product_update: 'bb--product',
  warning: 'bb--warning',
  custom: 'bb--custom'
};

const DISMISS_KEY = 'the100_dismissed_broadcasts';

function getDismissed() {
  try {
    return JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]');
  } catch {
    return [];
  }
}

function persistDismiss(id) {
  try {
    const list = getDismissed();
    if (!list.includes(id)) list.push(id);
    localStorage.setItem(DISMISS_KEY, JSON.stringify(list));
  } catch {
    // localStorage unavailable — dismiss for this session only
  }
}

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

export default function BroadcastBanner() {
  const { t, lang } = useLanguage();
  const location = useLocation();
  const [broadcast, setBroadcast] = useState(null);
  const [dismissed, setDismissed] = useState(getDismissed);

  const load = useCallback(() => {
    api
      .get('/api/broadcasts/active')
      .then((d) => setBroadcast(d.broadcast || null))
      .catch(() => setBroadcast(null));
  }, []);

  useEffect(load, [load, location.pathname]);
  useEffect(() => {
    const iv = setInterval(load, 60000);
    return () => clearInterval(iv);
  }, [load]);

  const handleDismiss = () => {
    if (!broadcast) return;
    persistDismiss(broadcast.id);
    setDismissed(getDismissed());
  };

  if (!broadcast || dismissed.includes(broadcast.id)) return null;

  const title = lang === 'am' && broadcast.title_am ? broadcast.title_am : broadcast.title;
  const body = lang === 'am' && broadcast.body_am ? broadcast.body_am : broadcast.body;
  const typeLabel = t(`broadcastType${cap(broadcast.type)}`);

  return (
    <div className={`bb ${TYPE_CLASS[broadcast.type] || 'bb--custom'}`} role="status" aria-live="polite">
      <div className="bb__inner">
        <span className="bb__bar" aria-hidden="true" />
        <div className="bb__content">
          {typeLabel ? <span className="bb__label">{typeLabel}</span> : null}
          <p className="bb__title">{title}</p>
          {body ? <p className="bb__body">{body}</p> : null}
        </div>
        <button className="bb__close" type="button" aria-label="Dismiss" onClick={handleDismiss}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
