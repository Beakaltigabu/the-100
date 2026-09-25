import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { ErrorState } from '../../components/States';
import PageSkeleton from '../../components/PageSkeleton';
import AdminShell from '../../components/admin/AdminShell';
import { StatusBadge, EmptyState } from '../../components/admin/ui';
import './Admin.css';

const STATUS_TONE = { committed: 'info', active: 'success', completed: 'warning', abandoned: 'muted' };

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString();
}

export default function AdminMembers() {
  const [members, setMembers] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api
      .get('/api/admin/members')
      .then((d) => setMembers(d.members || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return members;
    return members.filter((m) => `${m.name} ${m.email}`.toLowerCase().includes(s));
  }, [members, q]);

  if (loading) return <PageSkeleton variant="admin" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <AdminShell title="Members">
      <input
        className="admin__filter-input"
        style={{ marginBottom: 'var(--space-4)', width: '100%', maxWidth: 360 }}
        placeholder="Search name or email…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {filtered.length === 0 ? (
        <div className="admin-card">
          <EmptyState message={q ? 'No members match that search.' : 'No members yet.'} />
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
                  <th>Telegram</th>
                  <th>Strava</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <Link to={`/admin/members/${m.id}`} className="admin__link">
                        {m.name}
                      </Link>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>{m.email}</div>
                    </td>
                    <td>{m.goalValue} {m.goalUnit}</td>
                    <td>{m.progress}</td>
                    <td>{m.day}</td>
                    <td><StatusBadge tone={STATUS_TONE[m.status] || 'muted'}>{m.status}</StatusBadge></td>
                    <td>{m.telegram ? '✓' : '—'}</td>
                    <td>{m.strava ? '✓' : '—'}</td>
                    <td>{formatDate(m.joined)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
