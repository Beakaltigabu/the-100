import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { usePageMeta } from '../hooks/usePageMeta';
import { useToast } from '../components/Toast';
import Button from '../components/Button';
import ProgressBar from '../components/ProgressBar';
import Modal from '../components/Modal';
import PasswordField from '../components/PasswordField';
import { ErrorState } from '../components/States';
import PageSkeleton from '../components/PageSkeleton';
import { milestonesForActivity } from '../lib/activity';
import { openSafeUrl } from '../lib/url';
import { MOTIVATION_KEYS, MOTIVATION_MAX, motivationLabelKey, motivationPhraseKey } from '../lib/motivation';
import './Profile.css';

function statusOf(challenge, total) {
  if (!challenge) return 'inactive';
  if (challenge.status === 'completed') return 'completed';
  const today = new Date().toISOString().slice(0, 10);
  if (today < challenge.startDate) return 'not_started';
  const day = Math.min(100, Math.max(1, Math.floor((new Date(today) - new Date(challenge.startDate + 'T00:00:00')) / 86400000) + 1));
  if (day <= 2) return 'on_track'; // just started — never "falling behind"
  const expected = Number(challenge.goalValue) * (day / 100) * 0.9;
  return total >= expected ? 'on_track' : 'falling_behind';
}

function Avatar({ url, name }) {
  const initial = (name || '?').trim()[0]?.toUpperCase() || '?';
  if (url) return <img className="pf-avatar" src={url} alt={name} />;
  return (
    <span className="pf-avatar" aria-hidden="true">
      {initial}
    </span>
  );
}

export default function Profile() {
  usePageMeta({ title: 'Profile', path: '/profile', index: false });
  const { t } = useLanguage();
  const { user, refresh, logout } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({ name: '', location: '', age: '', social_handle: '' });
  const [busy, setBusy] = useState(false);
  const [editingWhy, setEditingWhy] = useState(false);
  const [whySelection, setWhySelection] = useState([]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api
      .get('/api/profile')
      .then((d) => {
        setData(d);
        setForm({
          name: d.user.name,
          location: d.user.location || '',
          age: d.user.age || '',
          social_handle: d.user.socialHandle || ''
        });
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.put('/api/profile', {
        name: form.name,
        location: form.location,
        age: form.age ? Number(form.age) : null,
        social_handle: form.social_handle
      });
      showToast(t('save'), 'success');
      setEditOpen(false);
      await refresh();
      load();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const startEditingWhy = () => {
    setWhySelection(data.user.motivation || []);
    setEditingWhy(true);
  };

  const toggleWhy = (key) => {
    setWhySelection((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      if (prev.length >= MOTIVATION_MAX) {
        showToast(t('whyMax', { max: MOTIVATION_MAX }), 'error');
        return prev;
      }
      return [...prev, key];
    });
  };

  const saveWhy = async () => {
    try {
      await api.put('/api/profile', { motivation: whySelection });
      showToast(t('whySaved'), 'success');
      setEditingWhy(false);
      await refresh();
      load();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const connectStrava = () => {
    api
      .get('/api/integrations/strava/connect')
      .then((d) => {
        window.location.href = d.url;
      })
      .catch((err) => {
        showToast(err.status === 503 ? t('stravaNotConfigured') : err.message, 'error');
      });
  };

  const disconnectStrava = () => {
    api
      .post('/api/integrations/strava/disconnect')
      .then(() => {
        showToast(t('stravaDisconnected'), 'success');
        load();
      })
      .catch((err) => showToast(err.message, 'error'));
  };

  const connectTelegram = () => {
    api
      .get('/api/integrations/telegram/connect')
      .then((d) => {
        openSafeUrl(d.deepLink);
      })
      .catch((err) => {
        showToast(err.status === 503 ? t('telegramNotConfigured') : err.message, 'error');
      });
  };

  const disconnectTelegram = () => {
    api
      .post('/api/integrations/telegram/disconnect')
      .then(() => {
        showToast(t('telegramDisconnected'), 'success');
        load();
      })
      .catch((err) => showToast(err.message, 'error'));
  };

  const confirmDelete = async () => {
    setDeleteBusy(true);
    setDeleteError('');
    try {
      await api.del('/api/profile', { password: deletePassword, confirm: true });
      await logout();
      showToast(t('accountDeleted'), 'success');
    } catch (err) {
      setDeleteError(err.message);
    } finally {
      setDeleteBusy(false);
    }
  };

  if (loading) return <PageSkeleton variant="profile" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return null;

  const { challenge, integrations } = data;
  const activityType = data.user.activityType || 'running';
  const unit = challenge?.goalUnit === 'km' ? t('unitKm') : t('unitSessions');
  const totalValue = challenge?.totalValue || 0;
  const goal = challenge ? Number(challenge.goalValue) : 0;
  const status = statusOf(challenge, totalValue);
  const statusKey = { on_track: 'onTrack', falling_behind: 'fallingBehind', inactive: 'inactive', completed: 'completed', not_started: 'notStarted' }[status] || 'inactive';
  const milestones = challenge ? milestonesForActivity(activityType).filter((th) => th <= goal) : [];
  const nextThreshold = milestones.find((th) => totalValue < th) ?? null;

  return (
    <div className="profile profile-page">
      <header className="pf-header">
        <div className="pf-header__top">
          <span className="pf-logo">
            THE <span className="pf-logo__slash">/</span> 100
          </span>
          <button className="pf-icon-btn" onClick={() => setEditOpen(true)} aria-label={t('editProfile')}>
            ⚙
          </button>
        </div>

        <div className="pf-identity">
          <Avatar url={data.user.photoUrl} name={data.user.name} />
          <div className="pf-identity__meta">
            <h1 className="pf-identity__name">{data.user.name}</h1>
            <p className="pf-identity__label">THE 100</p>
          </div>
        </div>

        <p className="pf-bio">{t('profileBio')}</p>
        <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
          {t('editProfile')}
        </Button>
      </header>

      {challenge ? (
        <section className="pf-section">
          <p className="pf-label">{t('my100')}</p>
          <p className="pf-goal">
            {goal} <span className="pf-goal__unit">{unit}</span>
          </p>
          <p className="pf-goal__caption">{t('goal')}</p>
          <ProgressBar value={totalValue} max={goal || 1} accent="var(--pf-accent)" />
          <div className="pf-goal__meta">
            <span>
              {totalValue} / {goal} {unit}
            </span>
            <span>{challenge.percent}%</span>
          </div>
          <p className={`pf-status pf-status--${status}`}>
            <span className="pf-status__dot" aria-hidden="true" />
            {t(statusKey)}
          </p>
        </section>
      ) : (
        <section className="pf-section">
          <p className="pf-label">{t('my100')}</p>
          <p className="pf-empty">{t('noActiveChallenge')}</p>
          <Link to="/onboarding">
            <Button variant="primary" full>
              {t('startYour100')}
            </Button>
          </Link>
        </section>
      )}

      <section className="pf-section">
        <div className="pf-head-row">
          <p className="pf-label">{t('myWhy')}</p>
          <button className="pf-link" onClick={editingWhy ? saveWhy : startEditingWhy}>
            {editingWhy ? t('done') : t('edit')}
          </button>
        </div>
        {editingWhy ? (
          <div className="pf-why-edit">
            {MOTIVATION_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                className={`pf-chip ${whySelection.includes(key) ? 'is-selected' : ''}`.trim()}
                onClick={() => toggleWhy(key)}
              >
                {t(motivationLabelKey(key))}
              </button>
            ))}
          </div>
        ) : (
          <div className="pf-why-list">
            {(data.user.motivation || []).map((key) => (
              <div className="pf-why-item" key={key}>
                <span className="pf-why-item__label">{t(motivationLabelKey(key))}</span>
                <span className="pf-why-item__phrase">{t(motivationPhraseKey(key))}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {milestones.length ? (
        <section className="pf-section">
          <div className="pf-head-row">
            <p className="pf-label">{t('milestones')}</p>
          </div>
          <div className="pf-timeline">
            {milestones.map((threshold) => {
              const reached = totalValue >= threshold;
              const isNext = threshold === nextThreshold;
              const pct = threshold > 0 ? Math.min(100, Math.round((totalValue / threshold) * 100)) : 0;
              const st = reached ? 'completed' : isNext ? 'next' : 'pending';
              return (
                <div className={`pf-timeline__row pf-timeline__row--${st}`} key={threshold}>
                  <span className="pf-timeline__dot" aria-hidden="true" />
                  <div className="pf-timeline__body">
                    <div className="pf-timeline__head">
                      <span className="pf-timeline__km">
                        {threshold} <span className="pf-timeline__unit">{unit}</span>
                      </span>
                      <span className="pf-timeline__status">
                        {st === 'completed' ? t('completed') : st === 'next' ? t('nextMilestone') : t('notStarted')}
                      </span>
                    </div>
                    <span className="pf-timeline__progress">
                      {totalValue} / {threshold} {unit} · {pct}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="pf-section" id="pf-integrations">
        <p className="pf-label">{t('activityRecording')}</p>

        <div className="pf-surface">
          <div className="pf-row">
            <div className="pf-row__main">
              <span className="pf-row__title">STRAVA</span>
              <span className="pf-row__status">{integrations.strava.connected ? t('connected') : t('notConnected')}</span>
            </div>
            <Button
              variant={integrations.strava.connected ? 'secondary' : 'primary'}
              size="sm"
              onClick={integrations.strava.connected ? disconnectStrava : connectStrava}
            >
              {integrations.strava.connected ? t('disconnect') : t('connectStrava')}
            </Button>
          </div>
          <Link to="/support" className="pf-link">
            {t('stravaDataSupport')}
          </Link>
        </div>

        <div className="pf-surface">
          <div className="pf-row">
            <div className="pf-row__main">
              <span className="pf-row__title">{t('manualLogging')}</span>
              <span className="pf-row__status pf-row__status--ok">{t('available')}</span>
            </div>
            <Link to="/dashboard">
              <Button variant="secondary" size="sm">
                {t('logActivity')} →
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="pf-section">
        <p className="pf-label">{t('communityConnection')}</p>
        <div className="pf-surface">
          <div className="pf-row">
            <div className="pf-row__main">
              <span className="pf-row__title">Telegram</span>
              <span className="pf-row__status">{integrations.telegram.connected ? t('connected') : t('notConnected')}</span>
            </div>
            {integrations.telegram.connected ? (
              <div className="pf-row__actions">
                {integrations.telegram.groupLink ? (
                  <Button variant="secondary" size="sm" onClick={() => openSafeUrl(integrations.telegram.groupLink)}>
                    {t('joinCommunityGroup')}
                  </Button>
                ) : null}
                <Button variant="ghost" size="sm" onClick={disconnectTelegram}>
                  {t('disconnect')}
                </Button>
              </div>
            ) : (
              <Button variant="primary" size="sm" onClick={connectTelegram}>
                {t('joinCommunity')}
              </Button>
            )}
          </div>
        </div>
      </section>

      <section className="pf-section">
        <p className="pf-label">{t('accountSettings')}</p>
        <div className="pf-list">
          <button className="pf-row pf-row--tappable" onClick={() => setEditOpen(true)}>
            <div className="pf-row__main">
              <span className="pf-row__title">{t('editProfile')}</span>
              <span className="pf-row__desc">{data.user.email}</span>
            </div>
            <span className="pf-chevron">›</span>
          </button>
          <button className="pf-row pf-row--tappable" onClick={() => logout().then(() => navigate('/'))}>
            <div className="pf-row__main">
              <span className="pf-row__title">{t('logout')}</span>
            </div>
            <span className="pf-chevron">→</span>
          </button>
        </div>
      </section>

      <section className="pf-danger">
        <p className="pf-label">{t('dangerZone')}</p>
        <p className="pf-danger__text">{t('deleteAccountHint')}</p>
        <Button variant="danger" full onClick={() => setDeleteOpen(true)}>
          {t('deleteAccount')}
        </Button>
      </section>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={t('editProfile')}>
        <form className="pf-edit" onSubmit={save}>
          <label className="pf-field">
            <span className="pf-field__label">{t('name')}</span>
            <input className="pf-field__input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label className="pf-field">
            <span className="pf-field__label">{t('location')}</span>
            <input className="pf-field__input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </label>
          <label className="pf-field">
            <span className="pf-field__label">{t('age')}</span>
            <input className="pf-field__input" type="number" min="13" max="120" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} />
          </label>
          <label className="pf-field">
            <span className="pf-field__label">{t('socialHandle')}</span>
            <input className="pf-field__input" value={form.social_handle} onChange={(e) => setForm({ ...form, social_handle: e.target.value })} />
          </label>
          <div className="pf-edit__actions">
            <Button type="button" variant="secondary" onClick={() => setEditOpen(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? t('loading') : t('saveChanges')}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title={t('deleteAccount')}>
        <p className="pf-danger__text">{t('deleteAccountConfirm')}</p>
        {data.user.hasPassword ? (
          <PasswordField
            label={t('password')}
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
          />
        ) : null}
        {deleteError ? <p className="pf-danger__error">{deleteError}</p> : null}
        <div className="pf-edit__actions">
          <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
            {t('cancel')}
          </Button>
          <Button variant="danger" disabled={deleteBusy || (data.user.hasPassword && deletePassword.length < 1)} onClick={confirmDelete}>
            {deleteBusy ? t('loading') : t('deleteAccount')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}