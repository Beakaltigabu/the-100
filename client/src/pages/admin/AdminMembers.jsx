import { useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ErrorState } from '../../components/States';
import PageSkeleton from '../../components/PageSkeleton';
import AdminShell from '../../components/admin/AdminShell';
import { StatusBadge, EmptyState, AdminPager, DateRange } from '../../components/admin/ui';
import { useAdminList } from '../../lib/adminList';
import './Admin.css';

const STATUS_TONE = { committed: 'info', active: 'success', completed: 'warning', abandoned: 'muted' };

function fmtRel(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 60) return `${Math.max(0, mins)}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}
function fmtTime(sec) {
  if (!sec) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const FILTERS = [
  { key: 'strava', label: 'Strava' },
  { key: 'telegram', label: 'Telegram' },
  { key: 'installed', label: 'Installed' },
  { key: 'active', label: 'Active 7d' }
];

export default function AdminMembers() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState({});
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const buildQuery = useCallback(() => {
    const query = { search: q, from, to };
    if (filters.strava) query.strava = '1';
    if (filters.telegram) query.telegram = '1';
    if (filters.installed) query.installed = '1';
    if (filters.active) query.active = '1';
    return query;
  }, [q, filters, from, to]);

  const { rows, total, page, limit, loading, error, reload, viewMore, goPage } = useAdminList({
    path: '/api/admin/members',
    dataKey: 'members',
    pageSize: 10,
    buildQuery
  });

  const toggleFilter = (key) => setFilters((f) => ({ ...f, [key]: !f[key] }));

  if (loading && rows.length === 0) return <PageSkeleton variant="admin" />;
  if (error && rows.length === 0) return <ErrorState message={error} onRetry={reload} />;

  return (
    <AdminShell title="Members">
      <div className="admin__filters">
        <input
          className="admin__filter-input"
          style={{ width: '100%', maxWidth: 320 }}
          placeholder="Search name or email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`btn btn--sm ${filters[f.key] ? 'btn--primary' : 'btn--secondary'}`}
            onClick={() => toggleFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
      </div>

      {rows.length === 0 ? (
        <div className="admin-card">
          <EmptyState message={q || Object.keys(filters).some((k) => filters[k]) || from || to ? 'No members match.' : 'No members yet.'} />
        </div>
      ) : (
        <div className="admin-card" style={{ padding: 0 }}>
          <div className="admin__table-wrap">
            <table className="admin__table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Goal</th>
                  <th>Progress</th>
                  <th>Day</th>
                  <th>Status</th>
                  <th>Strava</th>
                  <th>TG</th>
                  <th>Installed</th>
                  <th>Last seen</th>
                  <th>Time</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id} onClick={() => navigate(`/admin/members/${m.id}`)} style={{ cursor: 'pointer' }}>
                    <td>
                      <Link to={`/admin/members/${m.id}`} className="admin__link">
                        {m.name}
                      </Link>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>{m.email}</div>
                    </td>
                    <td>{m.goalValue} {m.goalUnit}</td>
                    <td>{m.progress}</td>
                    <td>{m.day}</td>
                    <td>
                      <StatusBadge tone={m.banned ? 'danger' : STATUS_TONE[m.status] || 'muted'}>{m.banned ? 'banned' : m.status}</StatusBadge>
                    </td>
                    <td>{m.strava ? '✓' : '—'}</td>
                    <td>{m.telegram ? '✓' : '—'}</td>
                    <td>{m.installed ? '✓' : '—'}</td>
                    <td>{fmtRel(m.lastSeen)}</td>
                    <td>{fmtTime(m.sessionSeconds)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <Link className="btn btn--secondary btn--sm" to={`/admin/members/${m.id}`}>View →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AdminPager page={page} limit={limit} total={total} onPage={goPage} />
      {page * limit < total ? (
        <div className="admin__pager">
          <button className="btn btn--secondary btn--sm" onClick={viewMore}>
            View more
          </button>
        </div>
      ) : null}
    </AdminShell>
  );
}