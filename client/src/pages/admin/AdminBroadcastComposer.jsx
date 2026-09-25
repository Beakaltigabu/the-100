import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useToast } from '../../components/Toast';
import { ErrorState } from '../../components/States';
import PageSkeleton from '../../components/PageSkeleton';
import AdminShell from '../../components/admin/AdminShell';
import { ConfirmDialog } from '../../components/admin/ui';
import './Admin.css';
import './AdminBroadcast.css';

const TYPES = [
  { key: 'announcement', label: 'Announcement' },
  { key: 'reminder', label: 'Reminder' },
  { key: 'nudge', label: 'Nudge' },
  { key: 'event', label: 'Event' },
  { key: 'product_update', label: 'Product update' },
  { key: 'warning', label: 'Warning' },
  { key: 'custom', label: 'Custom' }
];
const PLACEMENTS = [
  { key: 'app', label: 'In-app only' },
  { key: 'landing', label: 'Landing only' },
  { key: 'both', label: 'Both' }
];
const CHANNELS = [
  { key: 'inapp', label: 'In-app' },
  { key: 'telegram', label: 'Telegram DM' },
  { key: 'group', label: 'Telegram group' }
];
const ACTIVITIES = ['running', 'walking', 'run_walk', 'cycling', 'swimming', 'resistance', 'other'];
const STATUSES = ['committed', 'active', 'completed', 'abandoned'];

const EMPTY = {
  type: 'announcement',
  placement: 'app',
  channels: ['inapp', 'telegram', 'group'],
  priority: 0,
  title: '',
  body: '',
  title_am: '',
  body_am: '',
  mode: 'all',
  language: '',
  activityType: '',
  enrolled: '',
  status: '',
  active: '',
  schedule: 'now',
  scheduleAt: ''
};

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

export default function AdminBroadcastComposer() {
  const { id } = useParams();
  const editing = !!id;
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(editing);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [estimate, setEstimate] = useState(null);
  const estimateTimer = useRef(null);

  // Individual member picker
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [memberQuery, setMemberQuery] = useState('');
  const [memberResults, setMemberResults] = useState([]);
  const [memberOpen, setMemberOpen] = useState(false);
  const memberTimer = useRef(null);

  // Live-conflict dialog
  const [conflict, setConflict] = useState(null);

  useEffect(() => {
    if (!editing) return;
    api
      .get('/api/admin/broadcasts?limit=200')
      .then(async (d) => {
        const b = (d.broadcasts || []).find((x) => String(x.id) === String(id));
        if (!b) throw new Error('Broadcast not found');
        setForm({
          type: b.type,
          placement: b.placement,
          channels: b.channels,
          priority: b.priority,
          title: b.title,
          body: b.body,
          title_am: b.title_am || '',
          body_am: b.body_am || '',
          mode: (b.targeting && b.targeting.mode) || 'all',
          language: (b.targeting?.filters?.language) || '',
          activityType: (b.targeting?.filters?.activityType) || '',
          enrolled: b.targeting?.filters?.enrolled != null ? (b.targeting.filters.enrolled ? 'yes' : 'no') : '',
          status: (b.targeting?.filters?.status) || '',
          active: b.targeting?.filters?.active != null ? (b.targeting.filters.active ? 'yes' : 'no') : '',
          schedule: 'now',
          scheduleAt: ''
        });
        // Resolve individual user ids -> names
        if (b.targeting?.mode === 'individual' && b.targeting.userIds?.length) {
          const all = await api.get('/api/admin/members?limit=500').catch(() => ({ members: [] }));
          setSelectedMembers((all.members || []).filter((m) => b.targeting.userIds.includes(m.id)));
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [editing, id]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const toggleChannel = (key) =>
    setForm((f) => ({ ...f, channels: f.channels.includes(key) ? f.channels.filter((c) => c !== key) : [...f.channels, key] }));

  // Member search (debounced)
  useEffect(() => {
    if (memberTimer.current) clearTimeout(memberTimer.current);
    if (!memberQuery.trim()) { setMemberResults([]); return; }
    memberTimer.current = setTimeout(() => {
      api
        .get(`/api/admin/members?search=${encodeURIComponent(memberQuery.trim())}&limit=20`)
        .then((d) => setMemberResults(d.members || []))
        .catch(() => setMemberResults([]));
    }, 250);
    return () => clearTimeout(memberTimer.current);
  }, [memberQuery]);

  const addMember = (m) => {
    setSelectedMembers((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    setMemberQuery('');
    setMemberResults([]);
    setMemberOpen(false);
  };
  const removeMember = (mid) => setSelectedMembers((prev) => prev.filter((m) => m.id !== mid));

  const buildTargeting = useCallback(() => {
    if (form.mode === 'individual') {
      return { mode: 'individual', userIds: selectedMembers.map((m) => m.id) };
    }
    if (form.mode === 'segment') {
      const filters = {};
      if (form.language) filters.language = form.language;
      if (form.activityType) filters.activityType = form.activityType;
      if (form.enrolled === 'yes') filters.enrolled = true;
      if (form.enrolled === 'no') filters.enrolled = false;
      if (form.status) filters.status = form.status;
      if (form.active === 'yes') filters.active = true;
      if (form.active === 'no') filters.active = false;
      return { mode: 'segment', filters };
    }
    return { mode: 'all' };
  }, [form.mode, form.language, form.activityType, form.enrolled, form.status, form.active, selectedMembers]);

  // Audience estimate (debounced)
  useEffect(() => {
    if (estimateTimer.current) clearTimeout(estimateTimer.current);
    estimateTimer.current = setTimeout(() => {
      api
        .post('/api/admin/broadcasts/estimate', { targeting: buildTargeting() })
        .then((d) => setEstimate(d.count))
        .catch(() => setEstimate(null));
    }, 350);
    return () => clearTimeout(estimateTimer.current);
  }, [buildTargeting]);

  const canSave = form.title.trim() && form.body.trim() && form.channels.length > 0 && !busy;
  const canTargetIndividual = form.mode !== 'individual' || selectedMembers.length > 0;

  const submit = async (action, extra = {}) => {
    if (!canSave || !canTargetIndividual) return;
    setBusy(action);
    setError('');
    const scheduleAt = action === 'schedule' && form.scheduleAt ? new Date(form.scheduleAt) : null;
    const payload = {
      type: form.type,
      title: form.title.trim(),
      body: form.body.trim(),
      title_am: form.title_am.trim() || null,
      body_am: form.body_am.trim() || null,
      placement: form.placement,
      channels: form.channels,
      priority: Number(form.priority) || 0,
      targeting: buildTargeting(),
      scheduleAt,
      draft: action === 'draft',
      ...extra
    };
    try {
      if (editing) {
        await api.patch(`/api/admin/broadcasts/${id}`, payload);
        showToast('Broadcast updated', 'success');
      } else {
        await api.post('/api/admin/broadcasts', payload);
        showToast(action === 'draft' ? 'Draft saved' : action === 'schedule' ? 'Broadcast scheduled' : 'Broadcast is live', 'success');
      }
      navigate('/admin/broadcast');
    } catch (err) {
      if (err.status === 409 && err.data && err.data.conflict) {
        setConflict({ title: err.data.conflict.title, action });
        setBusy('');
        return;
      }
      setError(err.message);
      setBusy('');
    }
  };

  const confirmConflict = () => {
    const action = conflict?.action;
    setConflict(null);
    if (action) submit(action, { endPrevious: true });
  };

  if (loading) return <PageSkeleton variant="admin" />;
  if (error && !form.title) return <ErrorState message={error} onRetry={() => navigate('/admin/broadcast')} />;

  return (
    <AdminShell
      title={editing ? 'Edit broadcast' : 'New broadcast'}
      actions={
        <button className="btn btn--secondary" onClick={() => navigate('/admin/broadcast')}>
          Back
        </button>
      }
    >
      {error ? <p className="ob-error">{error}</p> : null}

      <div className="bcp">
        <div className="bcp__form">
          <div className="admin-card">
            <div className="bcp__grid">
              <label className="field">
                <span className="field__label">Type</span>
                <select className="field__input" value={form.type} onChange={set('type')}>
                  {TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </label>
              <label className="field">
                <span className="field__label">Placement</span>
                <select className="field__input" value={form.placement} onChange={set('placement')}>
                  {PLACEMENTS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
              </label>
              <label className="field">
                <span className="field__label">Priority</span>
                <input className="field__input" type="number" value={form.priority} onChange={set('priority')} />
              </label>
            </div>

            <label className="field">
              <span className="field__label">Title</span>
              <input className="field__input" value={form.title} onChange={set('title')} maxLength={160} placeholder="Strava connection is temporarily limited" />
            </label>

            <label className="field">
              <span className="field__label">Message</span>
              <textarea className="field__input bcp__textarea" value={form.body} onChange={set('body')} rows={4} maxLength={5000} placeholder="You can still log manually…" />
            </label>

            <div className="bcp__grid">
              <label className="field">
                <span className="field__label">Title (አማርኛ, optional)</span>
                <input className="field__input" value={form.title_am} onChange={set('title_am')} maxLength={160} placeholder="Amharic title" />
              </label>
              <label className="field">
                <span className="field__label">Message (አማርኛ, optional)</span>
                <textarea className="field__input bcp__textarea" value={form.body_am} onChange={set('body_am')} rows={3} maxLength={5000} placeholder="Amharic message" />
              </label>
            </div>

            <div className="field">
              <span className="field__label">Channels</span>
              <div className="broadcast__channels">
                {CHANNELS.map((c) => (
                  <label key={c.key} className="broadcast__channel">
                    <input type="checkbox" checked={form.channels.includes(c.key)} onChange={() => toggleChannel(c.key)} />
                    <span>{c.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="field">
              <span className="field__label">Audience</span>
              <div className="broadcast__channels">
                <label className="broadcast__channel"><input type="radio" name="mode" value="all" checked={form.mode === 'all'} onChange={set('mode')} /><span>All users</span></label>
                <label className="broadcast__channel"><input type="radio" name="mode" value="segment" checked={form.mode === 'segment'} onChange={set('mode')} /><span>Segment</span></label>
                <label className="broadcast__channel"><input type="radio" name="mode" value="individual" checked={form.mode === 'individual'} onChange={set('mode')} /><span>Individual</span></label>
              </div>
              {estimate != null ? <p className="bcp__estimate">Reaches <strong>{estimate}</strong> member{estimate === 1 ? '' : 's'}</p> : null}
            </div>

            {form.mode === 'segment' ? (
              <div className="bcp__grid">
                <label className="field">
                  <span className="field__label">Language</span>
                  <select className="field__input" value={form.language} onChange={set('language')}>
                    <option value="">All</option>
                    <option value="en">English</option>
                    <option value="am">አማርኛ</option>
                  </select>
                </label>
                <label className="field">
                  <span className="field__label">Activity type</span>
                  <select className="field__input" value={form.activityType} onChange={set('activityType')}>
                    <option value="">All</option>
                    {ACTIVITIES.map((a) => <option key={a} value={a}>{cap(a).replace('_', ' + ')}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span className="field__label">Enrolled</span>
                  <select className="field__input" value={form.enrolled} onChange={set('enrolled')}>
                    <option value="">All</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </label>
                <label className="field">
                  <span className="field__label">Enrollment status</span>
                  <select className="field__input" value={form.status} onChange={set('status')}>
                    <option value="">All</option>
                    {STATUSES.map((s) => <option key={s} value={s}>{cap(s)}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span className="field__label">Active (last 7 days)</span>
                  <select className="field__input" value={form.active} onChange={set('active')}>
                    <option value="">All</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </label>
              </div>
            ) : null}

            {form.mode === 'individual' ? (
              <div className="field">
                <span className="field__label">Select members</span>
                <div className="bcp__picker">
                  {selectedMembers.map((m) => (
                    <span className="bcp__chip" key={m.id}>
                      {m.name}
                      <button type="button" className="bcp__chip-x" aria-label={`Remove ${m.name}`} onClick={() => removeMember(m.id)}>×</button>
                    </span>
                  ))}
                </div>
                <input
                  className="field__input"
                  placeholder="Search members…"
                  value={memberQuery}
                  onChange={(e) => { setMemberQuery(e.target.value); setMemberOpen(true); }}
                  onFocus={() => setMemberOpen(true)}
                  onBlur={() => setTimeout(() => setMemberOpen(false), 150)}
                />
                {memberOpen && memberResults.length > 0 ? (
                  <div className="bcp__dropdown">
                    {memberResults.map((m) => (
                      <button type="button" className="bcp__option" key={m.id} onMouseDown={(e) => { e.preventDefault(); addMember(m); }}>
                        <span>{m.name}</span>
                        <span className="bcp__option-email">{m.email}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
                {form.mode === 'individual' && selectedMembers.length === 0 ? (
                  <p className="bcp__estimate">Select at least one member.</p>
                ) : null}
              </div>
            ) : null}

            <div className="field">
              <span className="field__label">When</span>
              <div className="broadcast__channels">
                <label className="broadcast__channel"><input type="radio" name="schedule" value="now" checked={form.schedule === 'now'} onChange={set('schedule')} /><span>Now</span></label>
                <label className="broadcast__channel"><input type="radio" name="schedule" value="later" checked={form.schedule === 'later'} onChange={set('schedule')} /><span>Schedule</span></label>
              </div>
              {form.schedule === 'later' ? (
                <input className="field__input" type="datetime-local" value={form.scheduleAt} onChange={set('scheduleAt')} />
              ) : null}
            </div>
          </div>
        </div>

        <aside className="bcp__preview">
          <div className="admin-card">
            <div className="admin-card__head">
              <h2 className="admin-card__title">Live preview</h2>
            </div>
            <div className="bcp__banner">
              <span className="bb__label">{TYPES.find((t) => t.key === form.type)?.label}</span>
              <p className="bb__title">{form.title || 'Your title'}</p>
              {form.body ? <p className="bb__body">{form.body}</p> : null}
            </div>
          </div>
        </aside>
      </div>

      <div className="bcp__footer">
        <button className="btn btn--secondary" onClick={() => submit('draft')} disabled={!canSave || !!busy}>
          {editing ? 'Save changes' : 'Save draft'}
        </button>
        {form.schedule === 'later' ? (
          <button className="btn btn--primary" onClick={() => submit('schedule')} disabled={!canSave || !form.scheduleAt || !!busy}>
            Schedule
          </button>
        ) : (
          <button className="btn btn--primary" onClick={() => submit('publish')} disabled={!canSave || !canTargetIndividual || !!busy}>
            {editing ? 'Save & re-send' : 'Publish now'}
          </button>
        )}
      </div>

      <ConfirmDialog
        open={!!conflict}
        title="Another broadcast is live"
        message={`"${conflict?.title}" is currently live. Publishing will end it for all users. Continue?`}
        confirmLabel="End & publish"
        danger
        busy={!!busy}
        onConfirm={confirmConflict}
        onCancel={() => setConflict(null)}
      />
    </AdminShell>
  );
}
