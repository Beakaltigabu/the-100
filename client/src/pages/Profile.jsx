import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import Button from '../components/Button';
import ProgressBar from '../components/ProgressBar';
import Milestone from '../components/Milestone';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';
import PasswordField from '../components/PasswordField';
import { LoadingState, ErrorState } from '../components/States';
import { milestonesForActivity, unitKey } from '../lib/activity';
import './Profile.css';

export default function Profile() {
  const { t } = useLanguage();
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
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
      setEditing(false);
      load();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
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

  const connectTelegram = () => {
    api
      .get('/api/integrations/telegram/connect')
      .then((d) => {
        window.open(d.deepLink, '_blank');
      })
      .catch((err) => {
        showToast(err.status === 503 ? t('telegramNotConfigured') : err.message, 'error');
      });
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

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return null;

  const { challenge, integrations } = data;
  const activityType = data.user.activityType;
  const hasPassword = data.user.hasPassword;
  const milestones = challenge ? milestonesForActivity(activityType) : [];
  const unit = challenge?.goalUnit || unitKey(activityType);
  const totalValue = challenge?.totalValue || 0;

  return (
    <div className="profile page">
      <div className="profile__head">
        <div className="profile__avatar">{user?.name?.[0]?.toUpperCase() || '?'}</div>
        <div className="profile__meta">
          <h1 className="profile__name">{data.user.name}</h1>
          <p className="profile__sub">THE 100</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setEditing(!editing)}>
          {t('editProfile')}
        </Button>
      </div>

      {editing ? (
        <form className="profile__edit" onSubmit={save}>
          <label className="field">
            <span className="field__label">{t('name')}</span>
            <input className="field__input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label className="field">
            <span className="field__label">{t('location')}</span>
            <input className="field__input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </label>
          <label className="field">
            <span className="field__label">{t('age')}</span>
            <input className="field__input" type="number" min="13" max="120" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} />
          </label>
          <label className="field">
            <span className="field__label">{t('socialHandle')}</span>
            <input className="field__input" value={form.social_handle} onChange={(e) => setForm({ ...form, social_handle: e.target.value })} />
          </label>
          <Button type="submit" variant="primary" full disabled={busy}>
            {busy ? t('loading') : t('save')}
          </Button>
        </form>
      ) : null}

      {challenge ? (
        <div className="profile__challenge">
          <div className="profile__goal">
            <span className="profile__goal-label">{t('goal')}</span>
            <span className="profile__goal-value">
              {challenge.goalValue} {t(unit)}
            </span>
          </div>
          <div className="profile__progress">
            <span>
              {totalValue} / {challenge.goalValue} {t(unit)}
            </span>
            <span>{challenge.percent}%</span>
          </div>
          <ProgressBar value={totalValue} max={challenge.goalValue} />
          <div className="profile__status">
            <StatusBadge status={challenge.status === 'completed' ? 'completed' : 'on_track'} />
          </div>
        </div>
      ) : null}

      <div className="stack">
        <h2 className="profile__section">{t('milestones')}</h2>
        {milestones.map((threshold) => (
          <Milestone
            key={threshold}
            threshold={threshold}
            reached={totalValue >= threshold}
            isNext={!challenge ? false : totalValue < threshold}
            unit={unit}
          />
        ))}
      </div>

      <div className="stack">
        <h2 className="profile__section">{t('activityRecording')}</h2>
        <div className="profile__integration">
          <div className="row--between row">
            <span>Strava</span>
            <StatusBadge status={integrations.strava.connected ? 'connected' : 'not_connected'} />
          </div>
          {integrations.strava.connected && challenge?.daysUntilStart > 0 ? (
            <p className="profile__integration-note">
              {t('syncingStartsOn', {
                date: new Date(challenge.startDate + 'T00:00:00').toLocaleDateString(undefined, {
                  month: 'long',
                  day: 'numeric'
                })
              })}
            </p>
          ) : null}
          <Button
            variant={integrations.strava.connected ? 'danger' : 'primary'}
            size="sm"
            onClick={connectStrava}
          >
            {integrations.strava.connected ? t('disconnect') : t('connectStrava')}
          </Button>
        </div>

        <div className="profile__integration">
          <div className="row--between row">
            <span>{t('telegram')}</span>
            <StatusBadge status={integrations.telegram.connected ? 'connected' : 'not_connected'} />
          </div>
          <Button variant={integrations.telegram.connected ? 'secondary' : 'primary'} size="sm" onClick={connectTelegram}>
            {integrations.telegram.connected ? t('openTelegram') : t('joinCommunity')}
          </Button>
        </div>
      </div>

      <div className="profile__danger">
        <h2 className="profile__section">{t('dangerZone')}</h2>
        <p className="profile__integration-note">{t('deleteAccountHint')}</p>
        <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
          {t('deleteAccount')}
        </Button>
      </div>

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title={t('deleteAccount')}>
        <p className="profile__integration-note">{t('deleteAccountConfirm')}</p>
        {hasPassword ? (
          <PasswordField
            label={t('password')}
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
          />
        ) : null}
        {deleteError ? <p className="profile__delete-error">{deleteError}</p> : null}
        <div className="row">
          <Button
            variant="danger"
            size="sm"
            disabled={deleteBusy || (hasPassword && deletePassword.length < 1)}
            onClick={confirmDelete}
          >
            {deleteBusy ? t('loading') : t('deleteAccount')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}