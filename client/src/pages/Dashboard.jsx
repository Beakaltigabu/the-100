import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { usePageMeta } from '../hooks/usePageMeta';
import { useToast } from '../components/Toast';
import Button from '../components/Button';
import ProgressBar from '../components/ProgressBar';
import CircularProgress from '../components/CircularProgress';
import ConnectPrompt from '../components/ConnectPrompt';
import LogSection from '../components/LogSection';
import { ErrorState } from '../components/States';
import PageSkeleton from '../components/PageSkeleton';
import { activityLabelKey } from '../lib/activity';
import { MOTIVATION_KEYS, MOTIVATION_MAX, motivationLabelKey, motivationPhraseKey } from '../lib/motivation';
import './Dashboard.css';

function fmt(n) {
  return Math.round(n * 100) / 100;
}

function DashCountdown({ target }) {
  const { t } = useLanguage();
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const date = typeof target === 'string' ? new Date(target + 'T00:00:00') : target;
  const diff = Math.max(0, date.getTime() - Date.now());
  const s = Math.floor(diff / 1000);
  const parts = [
    { value: String(Math.floor(s / 86400)), label: t('cdDays') },
    { value: String(Math.floor((s % 86400) / 3600)).padStart(2, '0'), label: t('cdHours') },
    { value: String(Math.floor((s % 3600) / 60)).padStart(2, '0'), label: t('cdMinutes') },
    { value: String(s % 60).padStart(2, '0'), label: t('cdSeconds') }
  ];
  return (
    <div className="dash-countdown">
      {parts.map((p, i) => (
        <div className="dash-countdown__unit" key={i}>
          <span className="dash-countdown__num">{p.value}</span>
          <span className="dash-countdown__label">{p.label}</span>
        </div>
      ))}
    </div>
  );
}

function journeyNodes(milestones, goal) {
  const nodes = [{ key: 'START', kind: 'start' }];
  const ms = (milestones || []).map((m) => Number(m.threshold)).filter((v) => v < goal);
  const picked = [];
  if (ms[0] != null) picked.push(ms[0]);
  if (ms[1] != null && ms[1] !== ms[0]) picked.push(ms[1]);
  picked.push(goal);
  for (const v of picked) nodes.push({ key: String(v), kind: 'km', value: v });
  nodes.push({ key: 'DAYS', kind: 'days' });
  return nodes;
}

export default function Dashboard() {
  usePageMeta({ title: 'Dashboard', path: '/dashboard', index: false });
  const { t } = useLanguage();
  const { user, refresh } = useAuth();
  const { showToast } = useToast();
  const [data, setData] = useState(null);
  const [nextChallenge, setNextChallenge] = useState(null);
  const [integrations, setIntegrations] = useState({ stravaConnected: false, telegramConnected: false, stravaLastSynced: null });
  const [stravaSyncing, setStravaSyncing] = useState(false);
  const [promptDismissed, setPromptDismissed] = useState(() => {
    try {
      return localStorage.getItem('the100_connect_prompt_seen') === '1';
    } catch {
      return false;
    }
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // WHY editor
  const [editingWhy, setEditingWhy] = useState(false);
  const [whySelection, setWhySelection] = useState([]);

  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    if (qs.get('strava') === 'connected') {
      showToast(t('stravaConnected'), 'success');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [t, showToast]);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    Promise.all([
      api.get('/api/progress'),
      api.get('/api/challenges/next').catch(() => null),
      api.get('/api/integrations/strava/status').catch(() => null),
      api.get('/api/integrations/telegram/status').catch(() => null)
    ])
      .then(([progress, next, sv, tg]) => {
        setData(progress);
        setNextChallenge(next ? next.challenge : null);
        setIntegrations({
          stravaConnected: !!sv?.connected,
          telegramConnected: !!tg?.connected,
          stravaLastSynced: sv?.lastSyncedAt || null
        });
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const startEditingWhy = () => {
    setWhySelection(user?.motivation || []);
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
      await refresh();
      setEditingWhy(false);
      showToast(t('whySaved'), 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const dismissPrompt = () => {
    try {
      localStorage.setItem('the100_connect_prompt_seen', '1');
    } catch {
      /* ignore */
    }
    setPromptDismissed(true);
  };

  const connectStrava = () => {
    api
      .get('/api/integrations/strava/connect?returnTo=/dashboard')
      .then((d) => {
        window.location.href = d.url;
      })
      .catch((err) => showToast(err.status === 503 ? t('stravaNotConfigured') : err.message, 'error'));
  };

  const syncStrava = () => {
    setStravaSyncing(true);
    api
      .post('/api/integrations/strava/sync')
      .then((d) => {
        showToast(t('stravaSynced', { n: d.imported }), 'success');
        load();
      })
      .catch((err) => showToast(err.message, 'error'))
      .finally(() => setStravaSyncing(false));
  };

  if (loading) return <PageSkeleton variant="dashboard" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data || !data.enrollment) return <EmptyDashboard t={t} user={user} nextChallenge={nextChallenge} />;

  const { enrollment, totalValue, percent, thisWeekValue, thisWeekActivities, nextMilestone, milestones } = data;
  const unit = enrollment.goalUnit === 'km' ? t('unitKm') : t('unitSessions');
  const goal = Number(enrollment.goalValue);
  const total = Number(totalValue) || 0;
  const daysUntilStart = enrollment.daysUntilStart || 0;
  const started = !(daysUntilStart > 0);
  const startLabel = new Date(enrollment.startDate + 'T00:00:00').toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric'
  });
  const name = user?.name || '';

  const nodes = journeyNodes(milestones, goal);
  const next = nextMilestone || null;
  const nextPct = next ? Math.min(100, Math.round((total / next.threshold) * 100)) : 0;

  const showPrompt =
    !promptDismissed && (!integrations.stravaConnected || !integrations.telegramConnected);

  return (
    <div className="dashboard dash-page">
      <header className="dash-hero">
<div className="dash-hero__art" aria-hidden="true">
        <span className="dash-hero__slash" />
        <span className="dash-hero__hundred">100</span>
      </div>
        <p className="dash-label">{t('your100')}</p>
        <h1 className="dash-hero__title">{t('welcomeToYour100')}</h1>
        <p className="dash-hero__name">{name || ''}</p>
        <p className="dash-hero__support">
          {started ? t('your100Live', { day: enrollment.day }) : t('beginOn', { date: startLabel })}
        </p>
        <p className="dash-hero__statement">{t('sameGoalsStrongerYou')}</p>
      </header>

      <section className="dash-section">
        <div className="dash-head-row">
          <p className="dash-label">{t('yourWhy')}</p>
          <button className="dash-link" onClick={editingWhy ? saveWhy : startEditingWhy}>
            {editingWhy ? t('done') : t('edit')}
          </button>
        </div>
        {editingWhy ? (
          <div className="dash-why-edit">
            {MOTIVATION_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                className={`dash-chip ${whySelection.includes(key) ? 'is-selected' : ''}`.trim()}
                onClick={() => toggleWhy(key)}
              >
                {t(motivationLabelKey(key))}
              </button>
            ))}
          </div>
        ) : (
          <div className="dash-why-list">
            {(user?.motivation || []).map((key) => (
              <div className="dash-why-item" key={key}>
                <span className="dash-why-item__label">{t(motivationLabelKey(key))}</span>
                <span className="dash-why-item__phrase">{t(motivationPhraseKey(key))}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="dash-section dash-section--progress">
        <div className="dash-head-row">
          <p className="dash-label">{t('yourProgress')}</p>
          <p className="dash-goal-label">
            {t('goal')}: {goal} {unit}
          </p>
        </div>
        <CircularProgress value={total} max={goal || 1} size={228} stroke={10}>
          <span className="dash-ring__num">
            {fmt(total)} <span className="dash-ring__unit">{unit}</span>
          </span>
          <span className="dash-ring__of">
            {t('of')} {goal} {unit}
          </span>
        </CircularProgress>
        <p className="dash-percent">{percent}% {t('completeLabel').toUpperCase()}</p>
      </section>

      <section className="dash-section">
        <div className="dash-stats">
          <div className="dash-stat">
            <span className="dash-stat__value">
              {fmt(thisWeekValue)} <span className="dash-stat__unit">{unit}</span>
            </span>
            <span className="dash-stat__label">{t('thisWeek')}</span>
          </div>
          <div className="dash-stat">
            <span className="dash-stat__value">{thisWeekActivities}</span>
            <span className="dash-stat__label">{t('activities')}</span>
          </div>
        </div>
      </section>

      {next ? (
        <section className="dash-section">
          <p className="dash-label">{t('nextMilestone')}</p>
          <p className="dash-milestone__value">
            {next.threshold} <span className="dash-milestone__unit">{unit}</span>
          </p>
          <p className="dash-milestone__away">
            {t('milestoneAway', { remaining: fmt(next.remaining), unit, name: name || t('member') })}
          </p>
          <div className="dash-milestone__meta">
            <span>
              {fmt(total)} / {next.threshold} {unit}
            </span>
            <span>{nextPct}%</span>
          </div>
          <ProgressBar value={total} max={next.threshold || 1} accent="var(--ds-accent)" />
          <p className="dash-statement">{t('smallStepsLeadToBigChanges')}</p>
        </section>
      ) : null}

      <section className="dash-section">
        <div className="dash-head-row">
          <p className="dash-label">{t('yourJourney')}</p>
          <p className="dash-journey__day">
            {t('dayLabel', { day: enrollment.day })} / {enrollment.totalDays}
          </p>
        </div>
        <div className="dash-journey">
          {nodes.map((node, i) => {
            const active = node.kind === 'start' || (node.value != null && total >= node.value) || (node.kind === 'days' && total >= goal);
            const isCurrent = active && !(nodes[i + 1] && nodes[i + 1].value != null && total >= nodes[i + 1].value);
            return (
              <div className={`dash-journey__node ${active ? 'is-active' : ''} ${isCurrent ? 'is-current' : ''}`.trim()} key={node.key}>
                <span className="dash-journey__dot" />
                <span className="dash-journey__label">
                  {node.kind === 'km' ? `${node.key} ${unit}` : node.key === 'DAYS' ? '100 DAYS' : node.key}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="dash-section">
        <div className="dash-head-row">
          <p className="dash-label">{t('activityRecording')}</p>
        </div>
        <div className="dash-strava">
          <p className="dash-strava__status">
            Strava · {integrations.stravaConnected ? t('connected') : t('notConnected')}
          </p>
          {integrations.stravaConnected ? (
            integrations.stravaLastSynced ? (
              <p className="dash-strava__meta">
                {t('lastSynced')}: {new Date(integrations.stravaLastSynced).toLocaleString()}
              </p>
            ) : null
          ) : (
            <div className="dash-strava__actions">
              <Button variant="primary" size="md" onClick={connectStrava}>
                {t('connectStrava')}
              </Button>
            </div>
          )}
        </div>
      </section>

      <section className="dash-section dash-section--full">
        <p className="dash-label">{t('yourNextMove')}</p>
        <LogSection onLogged={load} />
        {integrations.stravaConnected ? (
          <button className="dash-sync" type="button" onClick={syncStrava} disabled={stravaSyncing}>
            {stravaSyncing ? t('syncing') : t('preferStravaSync')}
          </button>
        ) : null}
      </section>

      <section className="dash-closing">
        <span className="dash-closing__line" aria-hidden="true" />
        <p className="dash-closing__text">{t('disciplineStatement')}</p>
        <p className="dash-closing__brand">— THE 100</p>
      </section>

      <ConnectPrompt open={showPrompt} onClose={dismissPrompt} />
    </div>
  );
}

function EmptyDashboard({ t, user, nextChallenge }) {
  return (
    <div className="dashboard dash-page dash-empty">
      <p className="dash-label">{t('your100')}</p>
      <h1 className="dash-empty__title">{t('welcomeName', { name: user?.name })}</h1>
      <p className="dash-empty__body">{t('emptyWelcomeSub')}</p>
      {nextChallenge ? (
        <div className="dash-empty__countdown">
          <p className="dash-label">{t('the100Begins')}</p>
          <DashCountdown target={nextChallenge.startDate} />
        </div>
      ) : null}
    </div>
  );
}