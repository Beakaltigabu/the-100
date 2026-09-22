import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useLanguage } from '../../context/LanguageContext';
import { ErrorState } from '../../components/States';
import PageSkeleton from '../../components/PageSkeleton';
import AdminNav from './AdminNav';
import './Admin.css';

function fmtTs(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  return d.toLocaleString();
}

function fmtUptime(sec) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : `${h}h ${m}m`;
}

const STATUS_CLASS = { new: 'is-new', replied: 'is-replied', resolved: 'is-resolved' };

export default function AdminHome() {
  const { t } = useLanguage();
  const [stats, setStats] = useState(null);
  const [contact, setContact] = useState(null);
  const [system, setSystem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    Promise.all([
      api.get('/api/admin/stats'),
      api.get('/api/admin/contact?limit=6').catch(() => null),
      api.get('/api/admin/system').catch(() => null)
    ])
      .then(([s, c, sys]) => {
        setStats(s.stats);
        setContact(c);
        setSystem(sys);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const setStatusFor = async (id, next) => {
    try {
      await api.post(`/api/admin/contact/${id}/status`, { status: next });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) return <PageSkeleton variant="admin" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!stats) return null;

  const messages = (contact && contact.entries) || [];

  return (
    <div className="admin page page--full">
      <AdminNav />

      <header className="admin__head">
        <div>
          <p className="admin__kicker">{t('admin')}</p>
          <h1 className="admin__title">{t('adminHome')}</h1>
        </div>
      </header>

      <div className="admin__stats">
        <div className="admin-stat">
          <span className="admin-stat__value">{stats.members}</span>
          <span className="admin-stat__label">{t('members')}</span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat__value">{stats.active}</span>
          <span className="admin-stat__label">{t('active')}</span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat__value">{stats.telegramConnected}</span>
          <span className="admin-stat__label">{t('telegram')}</span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat__value">{stats.stravaConnected}</span>
          <span className="admin-stat__label">{t('activityRecording')}</span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat__value">{stats.completed}</span>
          <span className="admin-stat__label">{t('finishers')}</span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat__value">{stats.totalValue}</span>
          <span className="admin-stat__label">{t('totalLogged')}</span>
        </div>
      </div>

      {system ? (
        <div className="admin-strip">
          <span className={`admin-strip__dot ${system.dbOk ? 'is-ok' : 'is-down'}`} />
          <span>{system.dbOk ? t('adminDbOk') + ': OK' : t('adminDbOk') + ': DOWN'}</span>
          <span className="admin-strip__sep" />
          <span>
            {t('adminUptime')}: {fmtUptime(system.uptimeSec)}
          </span>
          <span className="admin-strip__sep" />
          <span>
            {t('adminQueue')}: {system.queueBacklog}
          </span>
          <span className="admin-strip__sep" />
          <span>
            {t('adminLogCounts')}: {system.logCounts.requests} / {system.logCounts.errors} / {system.logCounts.events}
          </span>
        </div>
      ) : null}

      <div className="admin-dash">
        <section className="admin-card">
          <div className="admin-card__head">
            <h2 className="admin-card__title">{t('adminSupport')}</h2>
            <Link to="/admin/support" className="admin__link">
              {t('viewAll')} →
            </Link>
          </div>
          {messages.length === 0 ? (
            <p className="admin-card__empty">{t('adminSupportEmpty')}</p>
          ) : (
            <ul className="admin-inbox">
              {messages.map((m) => (
                <li className="admin-inbox__item" key={m.id}>
                  <div className="admin-inbox__body">
                    <p className="admin-inbox__meta">
                      <span className="admin-inbox__name">{m.name}</span>
                      <span className={`admin-status admin-status--${STATUS_CLASS[m.status] || 'is-new'}`}>
                        {t(`contactStatus${m.status.charAt(0).toUpperCase()}${m.status.slice(1)}`)}
                      </span>
                      <span className="admin-inbox__time">{fmtTs(m.ts)}</span>
                    </p>
                    <a className="admin-inbox__email" href={`mailto:${m.email}`}>
                      {m.email}
                    </a>
                    <p className="admin-inbox__msg">{m.message}</p>
                  </div>
                  <div className="admin-inbox__actions">
                    {m.status === 'new' ? (
                      <button className="btn btn--secondary btn--sm" onClick={() => setStatusFor(m.id, 'replied')}>
                        {t('contactMarkReplied')}
                      </button>
                    ) : null}
                    {m.status !== 'resolved' ? (
                      <button className="btn btn--secondary btn--sm" onClick={() => setStatusFor(m.id, 'resolved')}>
                        {t('contactMarkResolved')}
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="admin-card admin-card--aside">
          <div className="admin-card__head">
            <h2 className="admin-card__title">{t('admin')}</h2>
          </div>
          <div className="admin-links">
            <Link to="/admin/members" className="admin-link-row">
              <span>{t('adminMembers')}</span>
              <span>→</span>
            </Link>
            <Link to="/admin/audit" className="admin-link-row">
              <span>{t('adminAudit')}</span>
              <span>→</span>
            </Link>
            <Link to="/admin/logs" className="admin-link-row">
              <span>{t('adminLogs')}</span>
              <span>→</span>
            </Link>
            <Link to="/admin/support" className="admin-link-row">
              <span>{t('adminSupport')}</span>
              <span>→</span>
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}