import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import ProgressBar from '../components/ProgressBar';
import Stat from '../components/Stat';
import Button from '../components/Button';
import StatusBadge from '../components/StatusBadge';
import LogSection from '../components/LogSection';
import Countdown from '../components/Countdown';
import ConnectPrompt from '../components/ConnectPrompt';
import { LoadingState, ErrorState } from '../components/States';
import { motivationLabelKey } from '../lib/motivation';
import { getGreeting } from '../lib/greeting';
import './Dashboard.css';

function formatKm(n) {
  return Math.round(n * 100) / 100;
}

function DayStrip({ day, total }) {
  return (
    <div className="dash-strip" aria-hidden="true">
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} className={`dash-strip__dot ${i < day ? 'is-done' : ''}`.trim()} />
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [data, setData] = useState(null);
  const [nextChallenge, setNextChallenge] = useState(null);
  const [integrations, setIntegrations] = useState({ stravaConnected: false, telegramConnected: false });
  const [promptDismissed, setPromptDismissed] = useState(() => {
    try {
      return localStorage.getItem('the100_connect_prompt_seen') === '1';
    } catch {
      return false;
    }
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // Toast when returning from the Strava OAuth connect flow.
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
          telegramConnected: !!tg?.connected
        });
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data || !data.enrollment) return <EmptyDashboard t={t} user={user} nextChallenge={nextChallenge} />;

  const { enrollment, totalValue, percent, thisWeekValue, thisWeekActivities, nextMilestone, status } = data;
  const unit = enrollment.goalUnit || 'km';
  const daysUntilStart = enrollment.daysUntilStart || 0;
  const preStart = daysUntilStart > 0;
  const startLabel = new Date(enrollment.startDate + 'T00:00:00').toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric'
  });
  const greeting = getGreeting({ preStart, day: enrollment.day, totalValue, status });
  const greetingTitle = t(greeting.titleKey, { name: user?.name });
  const greetingSub = t(greeting.subKey, { date: startLabel });

  const showPrompt =
    !promptDismissed && (!integrations.stravaConnected || !integrations.telegramConnected);
  const dismissPrompt = () => {
    try {
      localStorage.setItem('the100_connect_prompt_seen', '1');
    } catch {
      /* ignore */
    }
    setPromptDismissed(true);
  };

  return (
    <div className="dashboard page">
      <div className="dash-head">
        <div>
          <span className="dash-head__kicker">{t('your100')}</span>
          <h1 className="dash-head__title">{greetingTitle}</h1>
          <p className="dash-head__sub">{greetingSub}</p>
        </div>
        <StatusBadge status={status} />
      </div>

      {preStart ? (
        <div className="dash-begins">
          <span className="dash-begins__kicker">{t('the100Begins')}</span>
          <p className="dash-begins__starts">{t('startsIn', { n: daysUntilStart })}</p>
          <Countdown target={enrollment.startDate} />
        </div>
      ) : null}

      {user?.motivation?.length ? (
        <div className="dash-why">
          <span className="dash-why__label">{t('yourWhy')}</span>
          <div className="dash-why__chips">
            {user.motivation.map((key) => (
              <span key={key} className="dash-why__chip">
                {t(motivationLabelKey(key))}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="dash-hero">
        <div className="dash-hero__num">
          {formatKm(totalValue)}
          <span className="dash-hero__unit"> {t(unit)}</span>
        </div>
        <p className="dash-hero__of">
          {t('of')} {enrollment.goalValue} {t(unit)}
        </p>
        <ProgressBar value={totalValue} max={enrollment.goalValue} />
        <p className="dash-hero__pct">{percent}%</p>
        {!preStart ? (
          <>
            <p className="dash-hero__day">
              {t('day')} {enrollment.day} / {enrollment.totalDays}
            </p>
            <DayStrip day={enrollment.day} total={enrollment.totalDays} />
          </>
        ) : null}
      </div>

      <div className="dash-stats">
        <Stat label={t('thisWeek')} value={`${formatKm(thisWeekValue)} ${t(unit)}`} />
        <Stat label={t('activities')} value={thisWeekActivities} />
      </div>

      {nextMilestone ? (
        <div className="dash-milestone">
          <div className="row--between row">
            <span className="dash-milestone__label">{t('nextMilestone')}</span>
            <span className="dash-milestone__km">{nextMilestone.threshold} {t(unit)}</span>
          </div>
          <p className="dash-milestone__remaining">
            {t('milestoneAway', {
              remaining: formatKm(nextMilestone.remaining),
              unit: t(unit),
              name: user?.name
            })}
          </p>
          <ProgressBar value={totalValue} max={nextMilestone.threshold} accent="var(--color-success)" />
        </div>
      ) : null}

      {preStart ? (
        <div className="dash-locked">
          <span className="dash-locked__icon" aria-hidden="true">◷</span>
          <p className="dash-locked__text">{t('loggingOpensOn', { date: startLabel })}</p>
        </div>
      ) : (
        <LogSection onLogged={load} />
      )}

      <ConnectPrompt open={showPrompt} onClose={dismissPrompt} />
    </div>
  );
}

function EmptyDashboard({ t, user, nextChallenge }) {
  return (
    <div className="dashboard page dash-empty">
      <span className="dash-head__kicker">{t('your100')}</span>
      <h1 className="dash-empty__title">{t('welcomeName', { name: user?.name })}</h1>
      <p className="dash-empty__body">{t('emptyWelcomeSub')}</p>
      {nextChallenge ? (
        <div className="dash-begins dash-begins--empty">
          <span className="dash-begins__kicker">{t('the100Begins')}</span>
          <Countdown target={nextChallenge.startDate} />
        </div>
      ) : null}
      <Link to="/onboarding" style={{ width: '100%', maxWidth: 320 }}>
        <Button variant="primary" size="lg" full>
          {t('chooseYour100')}
        </Button>
      </Link>
    </div>
  );
}