import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import { usePageMeta } from '../hooks/usePageMeta';
import Button from '../components/Button';
import NotificationPreferences from '../components/NotificationPreferences';
import { ErrorState } from '../components/States';
import PageSkeleton from '../components/PageSkeleton';
import './Notifications.css';

const TYPE_TONE = {
  milestone: 'notif--accent',
  finish: 'notif--success',
  welcome: 'notif--info',
  announcement: 'notif--accent',
  reminder: 'notif--info',
  nudge: 'notif--warning',
  weekly_checkin: 'notif--info',
  inactivity: 'notif--muted',
  event: 'notif--warning',
  product_update: 'notif--muted',
  warning: 'notif--danger',
  custom: 'notif--accent'
};

function fmt(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
}

export default function Notifications() {
  usePageMeta({ title: 'Notifications', path: '/notifications', index: false });
  const { t } = useLanguage();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api
      .get('/api/notifications')
      .then((d) => setItems(d.notifications || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const markAllRead = async () => {
    setBusy(true);
    try {
      await api.post('/api/notifications/read-all');
      setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const markRead = async (n) => {
    if (n.read_at) return;
    api.post(`/api/notifications/${n.id}/read`).catch(() => {});
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
  };

  if (loading) return <PageSkeleton />;
  if (error && !items.length) return <ErrorState message={error} onRetry={load} />;

  const unread = items.filter((n) => !n.read_at).length;

  return (
    <div className="notif-page">
      <header className="notif-hero">
        <p className="dash-label">{t('your100')}</p>
        <h1 className="dash-hero__title">{t('notifications')}</h1>
        <p className="notif-hero__sub">{unread > 0 ? t('notificationsUnread', { n: unread }) : t('notifAllCaughtUp')}</p>
      </header>

      <section className="notif-section">
        <div className="notif-head-row">
          <p className="dash-label">{t('notifRecent')}</p>
          {unread > 0 ? (
            <Button variant="secondary" size="sm" onClick={markAllRead} disabled={busy}>
              {t('notifMarkAllRead')}
            </Button>
          ) : null}
        </div>

        {items.length === 0 ? (
          <div className="notif-empty">{t('notifNoYet')}</div>
        ) : (
          <div className="notif-list">
            {(showAll ? items : items.slice(0, 8)).map((n) => (
              <button
                key={n.id}
                className={`notif-item ${n.read_at ? '' : 'is-unread'} ${TYPE_TONE[n.type] || 'notif--accent'}`}
                onClick={() => markRead(n)}
              >
                <div className="notif-item__top">
                  <span className="notif-item__type">{n.type.replace(/_/g, ' ')}</span>
                  <span className="notif-item__time">{fmt(n.created_at)}</span>
                </div>
                <span className="notif-item__title">{n.title}</span>
                {n.body ? <span className="notif-item__body">{n.body}</span> : null}
              </button>
            ))}
          </div>
        )}
        {items.length > 8 ? (
          <div className="notif-more">
            <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
              {showAll ? t('notifShowFewer') : t('notifViewMore')}
            </Button>
          </div>
        ) : null}
      </section>

      <section className="notif-section">
        <div className="notif-head-row">
          <p className="dash-label">{t('notifPreferences')}</p>
        </div>
        <NotificationPreferences onError={setError} />
      </section>
    </div>
  );
}