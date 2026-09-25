import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useToast } from '../../components/Toast';
import { ErrorState } from '../../components/States';
import PageSkeleton from '../../components/PageSkeleton';
import AdminShell from '../../components/admin/AdminShell';
import { StatusBadge, ConfirmDialog } from '../../components/admin/ui';
import './Admin.css';

function fmt(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString();
}

export default function AdminMemberDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(null); // { name, email, language }

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api
      .get(`/api/admin/members/${id}`)
      .then((d) => setData(d))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(load, [load]);

  const runConfirm = async () => {
    if (!confirm) return;
    setBusy(true);
    setError('');
    try {
      const { kind } = confirm;
      if (kind === 'ban') await api.post(`/api/admin/members/${id}/ban`);
      if (kind === 'unban') await api.post(`/api/admin/members/${id}/unban`);
      if (kind === 'delete') await api.del(`/api/admin/members/${id}`);
      if (kind === 'admin') await api.post(`/api/admin/members/${id}/admin`);
      if (kind === 'remove-admin') await api.post(`/api/admin/members/${id}/remove-admin`);
      showToast(kind === 'delete' ? 'Member deleted' : 'Done', 'success');
      setConfirm(null);
      if (kind === 'delete') navigate('/admin/members');
      else load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    if (!edit) return;
    setBusy(true);
    setError('');
    try {
      await api.patch(`/api/admin/members/${id}`, edit);
      showToast('Updated', 'success');
      setEdit(null);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <PageSkeleton variant="admin" />;
  if (error && !data) return <ErrorState message={error} onRetry={load} />;
  if (!data) return null;

  const u = data.user;

  return (
    <AdminShell
      title={u.name}
      actions={<button className="btn btn--secondary" onClick={() => navigate('/admin/members')}>Back</button>}
    >
      {error ? <p className="ob-error">{error}</p> : null}

      <div className="admin__detail">
        <div className="admin-card">
          <div className="admin-card__head">
            <h2 className="admin-card__title">Profile</h2>
            <div className="admin__row-actions">
              <StatusBadge tone={u.banned ? 'danger' : 'success'}>{u.banned ? 'Banned' : 'Active'}</StatusBadge>
              {u.isAdmin ? <StatusBadge tone="accent">Admin</StatusBadge> : null}
            </div>
          </div>
          <div className="admin__detail-grid">
            <div><div className="admin__detail-label">Email</div><div>{u.email}</div></div>
            <div><div className="admin__detail-label">Joined</div><div>{fmt(u.joined)}</div></div>
            <div><div className="admin__detail-label">Language</div><div>{u.language}</div></div>
            <div><div className="admin__detail-label">Activity</div><div>{u.activityType || '—'}</div></div>
            <div><div className="admin__detail-label">Experience</div><div>{u.experienceLevel || '—'}</div></div>
            <div><div className="admin__detail-label">Weekly baseline</div><div>{u.weeklyBaseline ?? '—'}</div></div>
          </div>

          {edit ? (
            <div className="admin__detail-grid" style={{ marginTop: 'var(--space-3)' }}>
              <label className="field">
                <span className="field__label">Name</span>
                <input className="field__input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
              </label>
              <label className="field">
                <span className="field__label">Email</span>
                <input className="field__input" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
              </label>
              <label className="field">
                <span className="field__label">Language</span>
                <select className="field__input" value={edit.language} onChange={(e) => setEdit({ ...edit, language: e.target.value })}>
                  <option value="en">English</option>
                  <option value="am">አማርኛ</option>
                </select>
              </label>
            </div>
          ) : null}
        </div>

        {data.enrollment ? (
          <div className="admin-card">
            <div className="admin-card__head">
              <h2 className="admin-card__title">Enrollment</h2>
              <StatusBadge tone={data.enrollment.status === 'completed' ? 'warning' : 'success'}>{data.enrollment.status}</StatusBadge>
            </div>
            <div className="admin__detail-grid">
              <div><div className="admin__detail-label">Goal</div><div>{data.enrollment.goalValue} {data.enrollment.goalUnit}</div></div>
              <div><div className="admin__detail-label">Window</div><div>{data.enrollment.startDate} → {data.enrollment.endDate}</div></div>
              <div><div className="admin__detail-label">Telegram</div><div>{data.integrations.telegram.state}</div></div>
              <div><div className="admin__detail-label">Strava</div><div>{data.integrations.strava.status}</div></div>
            </div>

            {data.activities.length ? (
              <div className="admin__table-wrap" style={{ marginTop: 'var(--space-3)' }}>
                <table className="admin__table" style={{ minWidth: 0 }}>
                  <thead>
                    <tr><th>Date</th><th>Activity</th><th>Distance</th><th>Source</th></tr>
                  </thead>
                  <tbody>
                    {data.activities.slice(0, 10).map((a, i) => (
                      <tr key={i}>
                        <td>{a.date}</td>
                        <td>{a.activityType}</td>
                        <td>{a.quantity}</td>
                        <td>{a.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="admin-card">
          <div className="admin-card__head">
            <h2 className="admin-card__title">Actions</h2>
          </div>
          <div className="admin__row-actions">
            {!edit ? (
              <button className="btn btn--secondary" onClick={() => setEdit({ name: u.name, email: u.email, language: u.language || 'en' })}>Edit</button>
            ) : (
              <>
                <button className="btn btn--primary" onClick={saveEdit} disabled={busy}>Save</button>
                <button className="btn btn--secondary" onClick={() => setEdit(null)}>Cancel</button>
              </>
            )}
            {u.banned ? (
              <button className="btn btn--secondary" onClick={() => setConfirm({ kind: 'unban', title: 'Unban member', message: 'Restore access for this member?' })}>Unban</button>
            ) : (
              <button className="btn btn--secondary" onClick={() => setConfirm({ kind: 'ban', title: 'Ban member', message: 'This blocks the app and Telegram bot for this member.', danger: true })}>Ban</button>
            )}
            {u.isAdmin ? (
              <button className="btn btn--secondary" onClick={() => setConfirm({ kind: 'remove-admin', title: 'Remove admin', message: 'Revoke admin access?' })}>Remove admin</button>
            ) : (
              <button className="btn btn--secondary" onClick={() => setConfirm({ kind: 'admin', title: 'Grant admin', message: 'Grant admin access?' })}>Grant admin</button>
            )}
            <button className="btn btn--danger" onClick={() => setConfirm({ kind: 'delete', title: 'Delete member', message: 'This permanently deletes the account and all its data.', danger: true })}>Delete</button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        danger={confirm?.kind === 'delete' || confirm?.kind === 'ban'}
        confirmLabel={confirm?.kind === 'delete' ? 'Delete' : 'Confirm'}
        busy={busy}
        onConfirm={runConfirm}
        onCancel={() => setConfirm(null)}
      />
    </AdminShell>
  );
}
