import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useToast } from '../../components/Toast';
import { ErrorState } from '../../components/States';
import PageSkeleton from '../../components/PageSkeleton';
import AdminShell from '../../components/admin/AdminShell';
import { StatusBadge, ConfirmDialog, StatCard } from '../../components/admin/ui';
import './Admin.css';
import './AdminMemberDetail.css';

const NUDGE_PRESETS = [
  'Your 100 is waiting — check in today!',
  "We noticed you haven't moved this week. One small step is enough.",
  'You are this close to your next milestone — keep going!'
];

function fmt(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString();
}
function fmtTime(sec) {
  if (!sec) return '0m';
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function initialsOf(name) {
  return String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
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
  const [edit, setEdit] = useState(null);
  const [notes, setNotes] = useState('');
  const [nudge, setNudge] = useState({ preset: NUDGE_PRESETS[0], custom: '' });
  const [msg, setMsg] = useState('');
  const [goalValue, setGoalValue] = useState('');
  const [resetLink, setResetLink] = useState('');
  const [showAllActivities, setShowAllActivities] = useState(false);
  const msgRef = useRef(null);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api
      .get(`/api/admin/members/${id}`)
      .then((d) => {
        setData(d);
        setNotes(d.user?.notes || '');
        setGoalValue(d.enrollment ? String(d.enrollment.goalValue) : '');
      })
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
      if (kind === 'complete') await api.post(`/api/admin/members/${id}/enrollment`, { status: 'completed' });
      if (kind === 'reopen') await api.post(`/api/admin/members/${id}/enrollment`, { status: 'active' });
      if (kind === 'disconnect-strava') await api.post(`/api/admin/members/${id}/disconnect`, { integration: 'strava' });
      if (kind === 'disconnect-telegram') await api.post(`/api/admin/members/${id}/disconnect`, { integration: 'telegram' });
      if (kind === 'reset-password') {
        const r = await api.post(`/api/admin/members/${id}/reset-password`);
        setResetLink(r.resetLink || '');
        showToast(r.resetLink ? 'Reset link generated' : 'Reset link sent to their Telegram', 'success');
      }
      showToast(kind === 'delete' ? 'Member deleted' : kind === 'complete' ? 'Marked complete' : kind === 'reopen' ? 'Re-opened' : 'Done', 'success');
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

  const saveNotes = async () => {
    setBusy(true);
    setError('');
    try {
      await api.patch(`/api/admin/members/${id}`, { notes });
      showToast('Notes saved', 'success');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const sendNudge = async () => {
    const message = (nudge.custom && nudge.custom.trim()) || nudge.preset;
    setBusy(true);
    setError('');
    try {
      await api.post(`/api/admin/members/${id}/nudge`, { message });
      showToast('Nudge sent', 'success');
      setNudge((n) => ({ ...n, custom: '' }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const sendMessage = async () => {
    if (!msg.trim()) return;
    setBusy(true);
    setError('');
    try {
      const r = await api.post(`/api/admin/members/${id}/message`, { message: msg.trim() });
      showToast(r.delivered ? 'Sent to their Telegram' : 'Saved as in-app notification', 'success');
      setMsg('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const saveGoal = async () => {
    const g = Math.max(1, Math.min(10000, Number(goalValue) || 0));
    setBusy(true);
    setError('');
    try {
      await api.post(`/api/admin/members/${id}/enrollment`, { goal_value: g });
      showToast('Goal updated', 'success');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const impersonate = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await api.post(`/api/admin/members/${id}/impersonate`);
      sessionStorage.setItem('the100_impersonation', r.token);
      window.location.href = '/dashboard';
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
  const eng = data.engagement || {};
  const enr = data.enrollment;
  const comm = data.community || {};
  const notif = data.notifications || {};
  const tg = data.integrations.telegram || {};
  const st = data.integrations.strava || {};
  const milestones = (enr?.milestones || []).slice(0, 8);
  const activities = data.activities || [];
  const shownActivities = showAllActivities ? activities : activities.slice(0, 10);
  const progressPct = Math.max(0, Math.min(100, Number(enr?.percent) || 0));

  return (
    <AdminShell
      title="Member"
      actions={<button className="btn btn--secondary" onClick={() => navigate('/admin/members')}>← Members</button>}
    >
      {error ? <p className="ob-error">{error}</p> : null}

      <div className="m360">
        {/* Hero */}
        <div className="admin-card m360__hero">
          <div className="m360__avatar" aria-hidden="true">{initialsOf(u.name)}</div>
          <div className="m360__hero-text">
            <p className="m360__kicker">Member #{u.id}</p>
            <h2 className="m360__hero-name">{u.name}</h2>
            <p className="m360__hero-meta">{u.email} · Joined {fmt(u.joined)}</p>
            <div className="m360__hero-badges" style={{ marginTop: 8 }}>
              <StatusBadge tone={u.banned ? 'danger' : 'success'}>{u.banned ? 'Banned' : 'Active'}</StatusBadge>
              {u.isAdmin ? <StatusBadge tone="accent">Admin</StatusBadge> : null}
              {u.pwaInstalled ? <StatusBadge tone="info">Installed</StatusBadge> : null}
              {u.onboardingComplete ? <StatusBadge tone="success">Onboarded</StatusBadge> : null}
            </div>
          </div>
          <div className="m360__hero-actions">
            <button className="btn btn--primary" onClick={() => msgRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) || msgRef.current?.focus()} disabled={busy}>Send message</button>
            <button className="btn btn--secondary" onClick={impersonate} disabled={busy}>View as member</button>
          </div>
        </div>

        {/* Stat strip */}
        <div className="m360__stats">
          <StatCard value={enr ? `${enr.percent}%` : '—'} label="Goal progress" tone={enr && enr.percent >= 100 ? 'success' : 'accent'} />
          <StatCard value={enr?.day ?? '—'} label="Day" />
          <StatCard value={enr ? `${enr.thisWeekValue} ${enr.goalUnit}` : '—'} label="This week" tone="info" />
          <StatCard value={enr?.activityDays ?? '—'} label="Active days" />
          <StatCard value={enr?.nextMilestone ? `${enr.nextMilestone.threshold} ${enr.goalUnit}` : '—'} label="Next milestone" tone="warning" />
          <StatCard value={fmtTime(eng.sessionSeconds)} label="Platform time" sub={`${eng.sessionCount ?? 0} sessions`} />
        </div>

        {/* Two-column layout */}
        <div className="m360__grid">
          {/* Main */}
          <div className="m360__main">
            {/* Profile */}
            <div className="admin-card">
              <div className="admin-card__head"><h2 className="admin-card__title">Profile</h2></div>
              <div className="admin__detail-grid">
                <div><div className="admin__detail-label">Language</div><div>{u.language}</div></div>
                <div><div className="admin__detail-label">Activity</div><div>{u.activityType || '—'}</div></div>
                <div><div className="admin__detail-label">Experience</div><div>{u.experienceLevel || '—'}</div></div>
                <div><div className="admin__detail-label">Weekly baseline</div><div>{u.weeklyBaseline ?? '—'}</div></div>
                <div><div className="admin__detail-label">Location</div><div>{u.location || '—'}</div></div>
                <div><div className="admin__detail-label">Age</div><div>{u.age ?? '—'}</div></div>
                {u.otherActivity ? <div><div className="admin__detail-label">Other activity</div><div>{u.otherActivity}</div></div> : null}
                {u.installedAt ? <div><div className="admin__detail-label">Installed</div><div>{fmt(u.installedAt)}</div></div> : null}
              </div>
              {edit ? (
                <div className="admin__detail-grid" style={{ marginTop: 'var(--space-3)' }}>
                  <label className="field"><span className="field__label">Name</span><input className="field__input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
                  <label className="field"><span className="field__label">Email</span><input className="field__input" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></label>
                  <label className="field"><span className="field__label">Language</span><select className="field__input" value={edit.language} onChange={(e) => setEdit({ ...edit, language: e.target.value })}><option value="en">English</option><option value="am">አማርኛ</option></select></label>
                  <label className="field"><span className="field__label">Location</span><input className="field__input" value={edit.location || ''} onChange={(e) => setEdit({ ...edit, location: e.target.value })} /></label>
                  <label className="field"><span className="field__label">Age</span><input className="field__input" type="number" value={edit.age ?? ''} onChange={(e) => setEdit({ ...edit, age: e.target.value })} /></label>
                  <label className="field"><span className="field__label">Experience</span><input className="field__input" value={edit.experienceLevel || ''} onChange={(e) => setEdit({ ...edit, experienceLevel: e.target.value })} /></label>
                </div>
              ) : null}
            </div>

            {/* Progress */}
            {enr ? (
              <div className="admin-card">
                <div className="admin-card__head"><h2 className="admin-card__title">Progress</h2></div>
                <div className="m360__bar"><div className="m360__bar-fill" style={{ width: `${progressPct}%` }} /></div>
                <div className="admin__detail-grid">
                  <div><div className="admin__detail-label">Goal</div><div>{enr.goalValue} {enr.goalUnit}</div></div>
                  <div><div className="admin__detail-label">Total logged</div><div>{enr.totalValue} {enr.goalUnit}</div></div>
                  <div><div className="admin__detail-label">Complete</div><div>{enr.percent}%</div></div>
                  <div><div className="admin__detail-label">Window</div><div>{enr.startDate} → {enr.endDate}</div></div>
                </div>
                {milestones.length ? (
                  <div className="m360__milestones">
                    {milestones.map((m) => {
                      const isNext = enr.nextMilestone && m.threshold === enr.nextMilestone.threshold;
                      return (
                        <span key={m.threshold} className={`m360__ms ${m.reached ? 'is-reached' : ''} ${isNext ? 'is-next' : ''}`}>
                          <span className="m360__ms-dot" />{m.threshold} {enr.goalUnit}
                        </span>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Activity history */}
            {activities.length ? (
              <div className="admin-card">
                <div className="admin-card__head">
                  <h2 className="admin-card__title">Activity history ({activities.length})</h2>
                  {activities.length > 10 ? (
                    <button className="btn btn--secondary btn--sm" onClick={() => setShowAllActivities((v) => !v)}>
                      {showAllActivities ? 'Show fewer' : 'Show all'}
                    </button>
                  ) : null}
                </div>
                <div className="admin__table-wrap">
                  <table className="admin__table" style={{ minWidth: 0 }}>
                    <thead><tr><th>Date</th><th>Activity</th><th>Distance</th><th>Source</th></tr></thead>
                    <tbody>
                      {shownActivities.map((a, i) => (
                        <tr key={i}><td>{a.date}</td><td>{a.activityType}</td><td>{a.quantity}</td><td>{a.source}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {/* Engagement */}
            <div className="admin-card">
              <div className="admin-card__head"><h2 className="admin-card__title">Engagement</h2></div>
              <div className="admin__detail-grid">
                <div><div className="admin__detail-label">Last seen</div><div>{fmt(eng.lastSeen)}</div></div>
                <div><div className="admin__detail-label">Requests (30d)</div><div>{eng.requests30d}</div></div>
                <div><div className="admin__detail-label">Sessions</div><div>{eng.sessionCount}</div></div>
                <div><div className="admin__detail-label">Notifications</div><div>{notif.total} ({notif.unread} unread)</div></div>
              </div>
            </div>

            {/* Connections */}
            <div className="admin-card">
              <div className="admin-card__head"><h2 className="admin-card__title">Connections</h2></div>
              <div className="admin__detail-grid">
                <div><div className="admin__detail-label">Telegram</div><div>{tg.state === 'active' ? 'Active' : tg.state || 'Not connected'}</div></div>
                <div><div className="admin__detail-label">Telegram ID</div><div>{tg.telegramUserId || '—'}</div></div>
                {tg.linkedAt ? <div><div className="admin__detail-label">Telegram linked</div><div>{fmt(tg.linkedAt)}</div></div> : null}
                <div><div className="admin__detail-label">Strava</div><div>{st.status}</div></div>
                {st.athleteId ? <div><div className="admin__detail-label">Strava athlete</div><div>{st.athleteId}</div></div> : null}
                {st.connectedAt ? <div><div className="admin__detail-label">Strava connected</div><div>{fmt(st.connectedAt)}</div></div> : null}
                {st.lastSyncedAt ? <div><div className="admin__detail-label">Strava last sync</div><div>{fmt(st.lastSyncedAt)}</div></div> : null}
                <div><div className="admin__detail-label">PWA installed</div><div>{u.pwaInstalled ? 'Yes' : 'No'}</div></div>
              </div>
            </div>

            {/* Community */}
            <div className="admin-card">
              <div className="admin-card__head"><h2 className="admin-card__title">Community</h2></div>
              <div className="admin__detail-grid">
                <div><div className="admin__detail-label">Posts</div><div>{comm.posts || 0}</div></div>
                <div><div className="admin__detail-label">Cheers given</div><div>{comm.cheersGiven || 0}</div></div>
                <div><div className="admin__detail-label">Cheers received</div><div>{comm.cheersReceived || 0}</div></div>
              </div>
            </div>

            {/* Notes */}
            <div className="admin-card">
              <div className="admin-card__head"><h2 className="admin-card__title">Internal notes</h2></div>
              <textarea className="field__input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add an internal note about this member…" />
              <div style={{ marginTop: 'var(--space-2)' }}>
                <button className="btn btn--secondary btn--sm" onClick={saveNotes} disabled={busy}>Save notes</button>
              </div>
            </div>

            {/* Admin history */}
            <div className="admin-card">
              <div className="admin-card__head"><h2 className="admin-card__title">Admin history</h2></div>
              {data.adminHistory.length === 0 ? (
                <p className="admin-card__empty">No admin actions on this member yet.</p>
              ) : (
                <div className="admin__table-wrap">
                  <table className="admin__table" style={{ minWidth: 0 }}>
                    <thead><tr><th>Time</th><th>Action</th><th>By</th></tr></thead>
                    <tbody>
                      {data.adminHistory.map((h, i) => (
                        <tr key={i}><td>{fmt(h.ts)}</td><td>{h.action}</td><td>{h.admin_name || '—'}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Aside — sticky manage panel */}
          <aside className="m360__aside">
            <div className="admin-card">
              <div className="admin-card__head"><h2 className="admin-card__title">Manage</h2></div>

              {/* Messaging */}
              <div className="m360__manage-section">
                <p className="m360__manage-label">Messaging</p>
                <div className="m360__manage-actions">
                  <textarea ref={msgRef} className="field__input" rows={2} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Message (Telegram DM if linked, else in-app)…" />
                  <button className="btn btn--primary btn--sm" onClick={sendMessage} disabled={busy || !msg.trim()}>Send message</button>
                </div>
                <div style={{ marginTop: 'var(--space-3)' }}>
                  <span className="field__label">Nudge</span>
                  <div className="broadcast__channels" style={{ marginTop: 4 }}>
                    {NUDGE_PRESETS.map((p) => (
                      <label key={p} className="broadcast__channel">
                        <input type="radio" name="nudge" checked={nudge.preset === p && !nudge.custom} onChange={() => setNudge({ preset: p, custom: '' })} />
                        <span>{p.slice(0, 30)}…</span>
                      </label>
                    ))}
                  </div>
                  <textarea className="field__input" rows={2} value={nudge.custom} onChange={(e) => setNudge((n) => ({ ...n, custom: e.target.value }))} placeholder="Custom nudge…" style={{ marginTop: 6 }} />
                  <button className="btn btn--secondary btn--sm" style={{ marginTop: 6 }} onClick={sendNudge} disabled={busy}>Send nudge</button>
                </div>
              </div>

              {/* Account */}
              <div className="m360__manage-section">
                <p className="m360__manage-label">Account</p>
                <div className="m360__manage-actions">
                  <button className="btn btn--secondary btn--sm" onClick={() => setEdit(edit ? null : { name: u.name, email: u.email, language: u.language || 'en', location: u.location || '', age: u.age ?? '', experienceLevel: u.experienceLevel || '' })}>
                    {edit ? 'Cancel edit' : 'Edit profile'}
                  </button>
                  <button className="btn btn--secondary btn--sm" onClick={() => setConfirm({ kind: 'reset-password', title: 'Reset password', message: 'Send the member a password reset link via Telegram (or generate one to share)?' })}>Reset password</button>
                  {resetLink ? (
                    <div className="admin-strip" style={{ margin: 0 }}>
                      <code style={{ wordBreak: 'break-all', fontSize: '0.72rem' }}>{resetLink}</code>
                      <button className="btn btn--secondary btn--sm" onClick={() => navigator.clipboard?.writeText(resetLink)}>Copy</button>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Enrollment */}
              {enr ? (
                <div className="m360__manage-section">
                  <p className="m360__manage-label">Enrollment</p>
                  <div className="m360__manage-actions">
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input className="field__input" type="number" value={goalValue} onChange={(e) => setGoalValue(e.target.value)} aria-label="Goal value" />
                      <button className="btn btn--secondary btn--sm" onClick={saveGoal} disabled={busy}>Save goal</button>
                    </div>
                    {enr.status === 'completed' ? (
                      <button className="btn btn--secondary btn--sm" onClick={() => setConfirm({ kind: 'reopen', title: 'Re-open enrollment', message: 'Re-activate this enrollment?' })}>Re-open</button>
                    ) : (
                      <button className="btn btn--secondary btn--sm" onClick={() => setConfirm({ kind: 'complete', title: 'Mark complete', message: 'Mark this enrollment as completed?' })}>Mark complete</button>
                    )}
                  </div>
                </div>
              ) : null}

              {/* Integrations */}
              <div className="m360__manage-section">
                <p className="m360__manage-label">Integrations</p>
                <div className="m360__manage-actions">
                  {tg.state === 'active' ? (
                    <button className="btn btn--secondary btn--sm" onClick={() => setConfirm({ kind: 'disconnect-telegram', title: 'Disconnect Telegram', message: 'Unlink their Telegram account?' })}>Disconnect Telegram</button>
                  ) : null}
                  {st.status === 'connected' ? (
                    <button className="btn btn--secondary btn--sm" onClick={() => setConfirm({ kind: 'disconnect-strava', title: 'Disconnect Strava', message: 'Removes their Strava data from the app.' })}>Disconnect Strava</button>
                  ) : null}
                </div>
              </div>

              {/* Danger */}
              <div className="m360__manage-section m360__danger">
                <p className="m360__manage-label">Danger zone</p>
                <div className="m360__manage-actions">
                  {u.banned ? (
                    <button className="btn btn--secondary btn--sm" onClick={() => setConfirm({ kind: 'unban', title: 'Unban member', message: 'Restore access?' })}>Unban member</button>
                  ) : (
                    <button className="btn btn--secondary btn--sm" onClick={() => setConfirm({ kind: 'ban', title: 'Ban member', message: 'Blocks the app and Telegram bot.', danger: true })}>Ban member</button>
                  )}
                  {u.isAdmin ? (
                    <button className="btn btn--secondary btn--sm" onClick={() => setConfirm({ kind: 'remove-admin', title: 'Remove admin', message: 'Revoke admin access?' })}>Remove admin</button>
                  ) : (
                    <button className="btn btn--secondary btn--sm" onClick={() => setConfirm({ kind: 'admin', title: 'Grant admin', message: 'Grant admin access?' })}>Grant admin</button>
                  )}
                  <button className="btn btn--danger btn--sm" onClick={() => setConfirm({ kind: 'delete', title: 'Delete member', message: 'Permanently deletes the account and all its data.', danger: true })}>Delete member</button>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        danger={confirm?.kind === 'delete' || confirm?.kind === 'ban'}
        confirmLabel={confirm?.kind === 'delete' ? 'Delete' : confirm?.kind === 'reset-password' ? 'Send reset link' : 'Confirm'}
        busy={busy}
        onConfirm={runConfirm}
        onCancel={() => setConfirm(null)}
      />
    </AdminShell>
  );
}