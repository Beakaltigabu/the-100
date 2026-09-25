import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useLanguage } from '../../context/LanguageContext';
import { ErrorState } from '../../components/States';
import PageSkeleton from '../../components/PageSkeleton';
import AdminShell from '../../components/admin/AdminShell';
import { StatCard, StatusBadge } from '../../components/admin/ui';
import './Admin.css';

function fmtUptime(sec) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : `${h}h ${m}m`;
}

const CONTACT_TONE = { new: 'accent', replied: 'warning', resolved: 'success' };

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
    <AdminShell title="Overview">
      <div className="stats-grid">
        <StatCard value={stats.members} label="Members" />
        <StatCard value={stats.active} label="Active" tone="success" />
        <StatCard value={stats.telegramConnected} label="Telegram" tone="info" />
        <StatCard value={stats.stravaConnected} label="Strava" />
        <StatCard value={stats.completed} label="Finishers" tone="warning" />
        <StatCard value={stats.totalValue} label="Total logged" />
      </div>

      {system ? (
        <div className="admin-strip" style={{ marginTop: 0, marginBottom: 'var(--space-4)' }}>
          <span className={`admin-strip__dot ${system.dbOk ? 'is-ok' : ''}`} />
          <span>DB {system.dbOk ? 'OK' : 'DOWN'}</span>
          <span className="admin-strip__sep" />
          <span>Uptime {fmtUptime(system.uptimeSec)}</span>
          <span className="admin-strip__sep" />
          <span>Queue {system.queueBacklog}</span>
          <span className="admin-strip__sep" />
          <span>Logs {system.logCounts.requests}/{system.logCounts.errors}/{system.logCounts.events}</span>
        </div>
      ) : null}

      <div className="admin-dash">
        <section className="admin-card">
          <div className="admin-card__head">
            <h2 className="admin-card__title">Support inbox</h2>
            <Link to="/admin/support" className="admin__link">View all →</Link>
          </div>
          {messages.length === 0 ? (
            <p className="admin-card__empty">No messages.</p>
          ) : (
            <ul className="admin-inbox">
              {messages.map((m) => (
                <li className="admin-inbox__item" key={m.id}>
                  <div className="admin-inbox__body">
                    <p className="admin-inbox__meta">
                      <span className="admin-inbox__name">{m.name}</span>
                      <StatusBadge tone={CONTACT_TONE[m.status] || 'accent'}>{m.status}</StatusBadge>
                    </p>
                    <a className="admin-inbox__email" href={`mailto:${m.email}`}>{m.email}</a>
                    <p className="admin-inbox__msg">{m.message}</p>
                  </div>
                  <div className="admin-inbox__actions">
                    {m.status === 'new' ? (
                      <button className="btn btn--secondary btn--sm" onClick={() => setStatusFor(m.id, 'replied')}>Replied</button>
                    ) : null}
                    {m.status !== 'resolved' ? (
                      <button className="btn btn--secondary btn--sm" onClick={() => setStatusFor(m.id, 'resolved')}>Resolved</button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="admin-card">
          <div className="admin-card__head">
            <h2 className="admin-card__title">Quick actions</h2>
          </div>
          <div className="admin-links">
            <Link to="/admin/broadcast/new" className="admin-link-row"><span>New broadcast</span><span>→</span></Link>
            <Link to="/admin/analytics" className="admin-link-row"><span>Analytics</span><span>→</span></Link>
            <Link to="/admin/members" className="admin-link-row"><span>Members</span><span>→</span></Link>
            <Link to="/admin/logs" className="admin-link-row"><span>Logs &amp; system</span><span>→</span></Link>
            <Link to="/admin/audit" className="admin-link-row"><span>Audit</span><span>→</span></Link>
          </div>
        </aside>
      </div>
    </AdminShell>
  );
}
