import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { BellIcon } from './icons';
import './NotificationBell.css';

const TYPE_TONE = {
  milestone: 'nb--accent',
  finish: 'nb--success',
  welcome: 'nb--info',
  announcement: 'nb--accent',
  reminder: 'nb--info',
  nudge: 'nb--warning',
  weekly_checkin: 'nb--info',
  inactivity: 'nb--muted',
  event: 'nb--warning',
  product_update: 'nb--muted',
  warning: 'nb--danger',
  custom: 'nb--accent'
};

function fmtRel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

export default function NotificationBell() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef(null);

  const refresh = useCallback(() => {
    api.get('/api/notifications/unread-count').then((d) => setUnread(d.unread)).catch(() => {});
  }, []);

  useEffect(refresh, [refresh]);
  useEffect(() => {
    const iv = setInterval(refresh, 60000);
    const onVis = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVis); };
  }, [refresh]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Close when navigating.
  useEffect(() => setOpen(false), [location.pathname]);

  const toggle = async () => {
    if (!open) {
      setOpen(true);
      setLoading(true);
      try {
        const d = await api.get('/api/notifications');
        setItems(d.notifications || []);
        setUnread(d.unread || 0);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    } else {
      setOpen(false);
    }
  };

  const markAllRead = async () => {
    await api.post('/api/notifications/read-all').catch(() => {});
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
    setUnread(0);
  };

  const markRead = async (n) => {
    if (n.read_at) return;
    api.post(`/api/notifications/${n.id}/read`).catch(() => {});
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
    setUnread((u) => Math.max(0, u - 1));
  };

  if (!user) return null;

  return (
    <div className="nb" ref={boxRef}>
      <button className={`nav-toggle nb__bell ${open ? 'is-open' : ''}`} onClick={toggle} title={t('notifications')} aria-label={t('notifications')}>
        <BellIcon size={16} />
        {unread > 0 ? <span className="nb__count">{unread > 99 ? '99+' : unread}</span> : null}
      </button>

      {open ? (
        <div className="nb__panel">
          <div className="nb__head">
            <span className="nb__title">{t('notifications')}</span>
            <div className="nb__head-actions">
              {unread > 0 ? (
                <button className="nb__link" onClick={markAllRead}>{t('notifMarkAllRead')}</button>
              ) : null}
              <button className="nb__link" onClick={() => { setOpen(false); navigate('/notifications'); }}>{t('notifView')}</button>
            </div>
          </div>

          <div className="nb__list">
            {loading ? (
              <p className="nb__empty">{t('notifLoading')}</p>
            ) : items.length === 0 ? (
              <p className="nb__empty">{t('notifNoYet')}</p>
            ) : (
              items.slice(0, 20).map((n) => (
                <button
                  key={n.id}
                  className={`nb__item ${n.read_at ? '' : 'is-unread'} ${TYPE_TONE[n.type] || 'nb--accent'}`}
                  onClick={() => markRead(n)}
                >
                  <span className="nb__item-type">{n.type.replace(/_/g, ' ')}</span>
                  <span className="nb__item-title">{n.title}</span>
                  {n.body ? <span className="nb__item-body">{n.body}</span> : null}
                  <span className="nb__item-time">{fmtRel(n.created_at)}</span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}