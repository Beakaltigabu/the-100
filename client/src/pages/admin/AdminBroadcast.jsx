import { useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useToast } from '../../components/Toast';
import { ErrorState } from '../../components/States';
import PageSkeleton from '../../components/PageSkeleton';
import AdminShell from '../../components/admin/AdminShell';
import { StatusBadge, ConfirmDialog, EmptyState, AdminPager, DateRange } from '../../components/admin/ui';
import { useAdminList } from '../../lib/adminList';
import './Admin.css';
import './AdminBroadcast.css';

const STATUS = ['draft', 'scheduled', 'live', 'ended'];

const STATUS_TONE = {
  draft: 'muted',
  scheduled: 'info',
  live: 'success',
  ended: 'warning'
};

const TYPE_LABEL = {
  announcement: 'Announcement',
  reminder: 'Reminder',
  nudge: 'Nudge',
  event: 'Event',
  product_update: 'Product update',
  warning: 'Warning',
  custom: 'Custom'
};

function fmtTs(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  return d.toLocaleString();
}

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

export default function AdminBroadcast() {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [filter, setFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [conflict, setConflict] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  const buildQuery = useCallback(() => {
    const q = {};
    if (filter === 'archived') q.deleted = '1';
    else if (filter) q.status = filter;
    if (from) q.from = from;
    if (to) q.to = to;
    return q;
  }, [filter, from, to]);

  const { rows, total, page, limit, loading, error, reload, viewMore, goPage } = useAdminList({
    path: '/api/admin/broadcasts',
    dataKey: 'broadcasts',
    buildQuery
  });

  const runAction = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      const { id, kind } = confirm;
      if (kind === 'publish') {
        try {
          await api.post(`/api/admin/broadcasts/${id}/publish`);
        } catch (err) {
          if (err.status === 409 && err.data && err.data.conflict) {
            setConfirm(null);
            setConflict({ id, title: err.data.conflict.title });
            setBusy(false);
            return;
          }
          throw err;
        }
      }
      if (kind === 'end') await api.post(`/api/admin/broadcasts/${id}/end`);
      if (kind === 'delete') await api.del(`/api/admin/broadcasts/${id}`);
      if (kind === 'restore') await api.post(`/api/admin/broadcasts/${id}/restore`);
      showToast(kind === 'publish' ? 'Broadcast is live' : kind === 'end' ? 'Broadcast ended' : kind === 'delete' ? 'Broadcast archived' : 'Broadcast restored', 'success');
      setConfirm(null);
      reload();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const confirmConflict = async () => {
    if (!conflict) return;
    setBusy(true);
    try {
      await api.post(`/api/admin/broadcasts/${conflict.id}/publish`, { endPrevious: true });
      showToast('Broadcast is live', 'success');
      setConflict(null);
      reload();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading && rows.length === 0) return <PageSkeleton variant="admin" />;
  if (error && rows.length === 0) return <ErrorState message={error} onRetry={reload} />;

  const statusTabs = [{ key: '', label: 'All' }, ...STATUS.map((s) => ({ key: s, label: cap(s) })), { key: 'archived', label: 'Archived' }];

  return (
    <AdminShell
      title="Broadcasts"
      actions={
        <Link className="btn btn--primary" to="/admin/broadcast/new">
          + New broadcast
        </Link>
      }
    >
      {error || actionError ? <p className="ob-error">{error || actionError}</p> : null}

      <div className="admin__tabs" style={{ marginBottom: 'var(--space-4)' }}>
        {statusTabs.map((s) => (
          <button
            key={s.key || 'all'}
            className={`admin__tab ${filter === s.key ? 'is-active' : ''}`}
            onClick={() => setFilter(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="admin__filters" style={{ marginBottom: 'var(--space-4)' }}>
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
      </div>

      {rows.length === 0 ? (
        <div className="admin-card">
          <EmptyState message={filter === 'archived' ? 'No archived broadcasts.' : 'No broadcasts yet.'} action={<Link className="btn btn--primary" to="/admin/broadcast/new">Create one</Link>} />
        </div>
      ) : (
        <div className="admin-card" style={{ padding: 0 }}>
          <div className="admin__table-wrap">
            <table className="admin__table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Channels</th>
                  <th>Reach</th>
                  <th>Sent</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <StatusBadge tone={b.deletedAt ? 'muted' : STATUS_TONE[b.status]}>{b.deletedAt ? 'archived' : cap(b.status)}</StatusBadge>
                    </td>
                    <td style={{ whiteSpace: 'normal', maxWidth: 260 }}>
                      <div style={{ fontWeight: 700 }}>{b.title}</div>
                      <div style={{ color: 'var(--color-muted)', fontSize: '0.75rem' }}>
                        {b.placement === 'both' ? 'App + Landing' : b.placement === 'landing' ? 'Landing' : 'App'}
                        {b.scheduledAt ? ` · scheduled ${fmtTs(b.scheduledAt)}` : ''}
                      </div>
                    </td>
                    <td>{TYPE_LABEL[b.type] || b.type}</td>
                    <td>{b.channels.join(', ')}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {b.delivery ? b.delivery.inapp : 0} in-app
                      {b.delivery && b.delivery.telegram ? ` · ${b.delivery.telegram} TG` : ''}
                      {b.groupSent ? ' · group' : ''}
                    </td>
                    <td>{fmtTs(b.publishedAt)}</td>
                    <td>
                      <div className="admin__row-actions" style={{ justifyContent: 'flex-end' }}>
                        {b.deletedAt ? (
                          <button className="btn btn--secondary btn--sm" onClick={() => setConfirm({ id: b.id, kind: 'restore', title: 'Restore broadcast', message: 'Bring this broadcast back into the list? It will be visible again to admins.' })}>
                            Restore
                          </button>
                        ) : (
                          <>
                            {b.status === 'draft' || b.status === 'live' ? (
                              <Link className="btn btn--secondary btn--sm" to={`/admin/broadcast/${b.id}/edit`}>
                                Edit
                              </Link>
                            ) : null}
                            {b.status === 'draft' || b.status === 'scheduled' ? (
                              <button className="btn btn--primary btn--sm" onClick={() => setConfirm({ id: b.id, kind: 'publish', title: 'Publish broadcast', message: 'Send this broadcast to its audience now?' })}>
                                Publish
                              </button>
                            ) : null}
                            {b.status === 'live' ? (
                              <button className="btn btn--secondary btn--sm" onClick={() => setConfirm({ id: b.id, kind: 'end', title: 'End broadcast', message: 'This will remove the banner for all users.' })}>
                                End
                              </button>
                            ) : null}
                            <button className="btn btn--danger btn--sm" onClick={() => setConfirm({ id: b.id, kind: 'delete', title: 'Archive broadcast', message: 'This hides the broadcast everywhere. You can restore it later from the Archived tab.', danger: true })}>
                              Archive
                            </button>
                          </>
                        )}
                      </div>
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

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        danger={confirm?.danger}
        confirmLabel={confirm?.kind === 'delete' ? 'Archive' : confirm?.kind === 'restore' ? 'Restore' : 'Confirm'}
        busy={busy}
        onConfirm={runAction}
        onCancel={() => setConfirm(null)}
      />

      <ConfirmDialog
        open={!!conflict}
        title="Another broadcast is live"
        message={`"${conflict?.title}" is currently live. Publishing will end it for all users. Continue?`}
        confirmLabel="End & publish"
        danger
        busy={busy}
        onConfirm={confirmConflict}
        onCancel={() => setConflict(null)}
      />
    </AdminShell>
  );
}