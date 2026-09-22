import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { usePageMeta } from '../hooks/usePageMeta';
import { useToast } from '../components/Toast';
import { LoadingState } from '../components/States';
import Button from '../components/Button';
import GoalCard from '../components/GoalCard';
import ProgressBar from '../components/ProgressBar';
import PasswordField from '../components/PasswordField';
import OAuthButtons from '../components/OAuthButtons';
import { ACTIVITY_KEYS, ACTIVITY_SUBTITLE_KEYS, activityLabelKey, baselineOptionsFor, unitKey } from '../lib/activity';
import { MOTIVATION_KEYS, MOTIVATION_MAX, motivationLabelKey, motivationGuidanceKey } from '../lib/motivation';
import { passwordStrength } from '../lib/password';
import { passwordIssues, authErrorMessage } from '../lib/validation';
import './Onboarding.css';

const DRAFT_KEY = 'the100_draft';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EXPERIENCE_KEYS = ['beginner', 'occasional', 'consistent', 'experienced'];
const TIME_KEYS = ['morning', 'evening', 'flexible'];
const DAY_KEYS = ['daySun', 'dayMon', 'dayTue', 'dayWed', 'dayThu', 'dayFri', 'daySat'];
const STAGE_KEYS = ['stageActivity', 'stageWhy', 'stageStart', 'stageGoal', 'stageWhen', 'stageAuth'];

function cap(k) {
  return k[0].toUpperCase() + k.slice(1);
}

function loadDraft() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY)) || null;
  } catch {
    return null;
  }
}

function saveDraft(draft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* ignore */
  }
}

function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
}

function StageHeading({ title, sub }) {
  return (
    <div className="ob-head">
      <h1 className="ob-head__title">{title}</h1>
      {sub ? <p className="ob-note">{sub}</p> : null}
    </div>
  );
}

function OptionGrid({ options, selected, onSelect }) {
  return (
    <div className="ob-options">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`ob-option ${selected === opt.value ? 'is-selected' : ''}`.trim()}
          onClick={() => onSelect(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function ActivityGrid({ options, selected, onSelect }) {
  return (
    <div className="ob-options">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`ob-option ${selected === opt.value ? 'is-selected' : ''}`.trim()}
          onClick={() => onSelect(opt.value)}
        >
          <span className="ob-option__label">{opt.label}</span>
          {opt.sub ? <span className="ob-option__sub">{opt.sub}</span> : null}
        </button>
      ))}
    </div>
  );
}

function MotivationChips({ selected, onToggle, t }) {
  return (
    <div className="ob-days">
      {MOTIVATION_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          className={`chip ${selected.includes(key) ? 'is-selected' : ''}`.trim()}
          onClick={() => onToggle(key)}
        >
          {t(motivationLabelKey(key))}
        </button>
      ))}
    </div>
  );
}

function DayChips({ selected, onToggle, t }) {
  return (
    <div className="ob-days">
      {DAY_KEYS.map((key, i) => (
        <button
          key={key}
          type="button"
          className={`chip ${selected.includes(i) ? 'is-selected' : ''}`.trim()}
          onClick={() => onToggle(i)}
        >
          {t(key)}
        </button>
      ))}
    </div>
  );
}

export default function Onboarding() {
  usePageMeta({ title: 'Onboarding', path: '/onboarding', index: false });
  const { t } = useLanguage();
  const { user, register, login, refresh } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [activityType, setActivityType] = useState(null);
  const [motivation, setMotivation] = useState([]);
  const [experienceLevel, setExperienceLevel] = useState(null);
  const [baseline, setBaseline] = useState(null);
  const [goals, setGoals] = useState([]);
  const [selectedGoal, setSelectedGoal] = useState(null);
  const [customMode, setCustomMode] = useState(false);
  const [customGoal, setCustomGoal] = useState('');
  const [preferredTime, setPreferredTime] = useState(null);
  const [scheduleDays, setScheduleDays] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [authMode, setAuthMode] = useState('register');
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [authAttempted, setAuthAttempted] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  // Set when an authed user returns (e.g. after Google OAuth) with a draft goal:
  // we auto-complete once state settles so they land on the dashboard.
  const pendingAutoFinishRef = useRef(false);
  const finishRef = useRef(null);
  // While true, hide the onboarding steps (a stale goal step must not flash
  // before the auto-finish redirects to the dashboard).
  const [autoFinishing, setAutoFinishing] = useState(false);

  const stages = user ? STAGE_KEYS.slice(0, 5) : STAGE_KEYS;
  const totalSteps = stages.length;
  const unit = activityType ? unitKey(activityType) : 'km';

  // Resume a saved draft, or prefill from the profile for returning members (P4).
  useEffect(() => {
    const draft = loadDraft();
    if (draft) {
      setStep(draft.step || 1);
      setActivityType(draft.activityType || null);
      setMotivation(draft.motivation || []);
      setExperienceLevel(draft.experienceLevel || null);
      setBaseline(draft.baseline ?? null);
      setSelectedGoal(draft.goal ?? null);
      setCustomMode(!!draft.customMode);
      setCustomGoal(draft.customGoal || '');
      setPreferredTime(draft.preferredTime || null);
      setScheduleDays(draft.scheduleDays || []);
      if ((draft.step === 4 || draft.step === 5) && draft.baseline != null && draft.activityType) {
        api
          .get(
            `/api/onboarding/recommendations?baseline=${draft.baseline}&activity_type=${draft.activityType}&experience_level=${draft.experienceLevel || 'consistent'}`
          )
          .then((rec) => {
            setGoals(rec.goals);
            const recGoal = rec.goals.find((g) => g.recommended);
            setSelectedGoal(recGoal ? recGoal.value : null);
          })
          .catch(() => {});
      }

      // After OAuth (authed) with a goal already chosen, auto-complete to the dashboard.
      if (user && (draft.goal != null || (draft.customMode && draft.customGoal))) {
        pendingAutoFinishRef.current = true;
        setAutoFinishing(true);
      }
      return;
    }

    if (user && (user.activityType || user.experienceLevel || user.weeklyBaseline)) {
      if (user.activityType) setActivityType(user.activityType);
      if (user.motivation && user.motivation.length) setMotivation(user.motivation);
      if (user.experienceLevel) setExperienceLevel(user.experienceLevel);
      if (user.weeklyBaseline != null) setBaseline(user.weeklyBaseline);
      if (user.preferredTime) setPreferredTime(user.preferredTime);
      if (user.scheduleDays && user.scheduleDays.length) setScheduleDays(user.scheduleDays);

      if (user.activityType && user.experienceLevel && user.weeklyBaseline != null) {
        api
          .get(
            `/api/onboarding/recommendations?baseline=${user.weeklyBaseline}&activity_type=${user.activityType}&experience_level=${user.experienceLevel}`
          )
          .then((rec) => {
            setGoals(rec.goals);
            const recGoal = rec.goals.find((g) => g.recommended);
            setSelectedGoal(recGoal ? recGoal.value : null);
            setStep(4);
          })
          .catch(() => {});
      }
    }
  }, [user]);

  // Persist the draft as the guest moves through the wizard
  useEffect(() => {
    if (step > totalSteps) return;
    // Don't overwrite a saved draft with the empty initial state (fixes the
    // step-reset-to-1 after OAuth, especially under StrictMode).
    const hasData =
      activityType ||
      experienceLevel ||
      baseline !== null ||
      motivation.length ||
      selectedGoal != null ||
      preferredTime ||
      scheduleDays.length;
    if (step === 1 && !hasData) return;
    saveDraft({
      step,
      activityType,
      motivation,
      experienceLevel,
      baseline,
      goal: selectedGoal,
      customMode,
      customGoal,
      preferredTime,
      scheduleDays
    });
  }, [step, activityType, motivation, experienceLevel, baseline, selectedGoal, customMode, customGoal, preferredTime, scheduleDays, totalSteps]);

  const activityOptions = ACTIVITY_KEYS.map((k) => ({
    value: k,
    label: t(activityLabelKey(k)),
    sub: t(ACTIVITY_SUBTITLE_KEYS[k])
  }));
  const experienceOptions = EXPERIENCE_KEYS.map((k) => ({ value: k, label: t(k) }));
  const baselineOptions = baselineOptionsFor(activityType).map((o) => ({ value: o.value, label: t(o.label) }));
  const timeOptions = TIME_KEYS.map((k) => ({ value: k, label: t(`time${cap(k)}`) }));

  const next = async () => {
    setError('');
    if (step === 3) {
      setBusy(true);
      try {
        const rec = await api.get(
          `/api/onboarding/recommendations?baseline=${baseline}&activity_type=${activityType}&experience_level=${experienceLevel}`
        );
        setGoals(rec.goals);
        const recGoal = rec.goals.find((g) => g.recommended);
        setSelectedGoal(recGoal ? recGoal.value : null);
        setCustomMode(false);
        setCustomGoal('');
        setStep(4);
      } catch (err) {
        setError(err.message);
      } finally {
        setBusy(false);
      }
    } else {
      setStep((s) => s + 1);
    }
  };

  const back = () => {
    setError('');
    if (step === 6) setStep(5);
    else if (step === 5) setStep(4);
    else if (step === 4) setStep(3);
    else setStep((s) => s - 1);
  };

  const goalValue = customMode ? parseFloat(customGoal) : selectedGoal;

  // After auth (or for an already-logged-in user): apply draft and commit.
  const finishInFlight = useRef(false);
  const finish = useCallback(
    async (me) => {
      if (finishInFlight.current) return;
      finishInFlight.current = true;
      setBusy(true);
      setError('');
      try {
        if (!me.onboardingComplete) {
          await api.put('/api/onboarding', {
            activity_type: activityType,
            experience_level: experienceLevel,
            weekly_baseline: baseline,
            motivation,
            preferred_time: preferredTime,
            schedule_days: scheduleDays
          });
          await refresh(); // reload the context user so motivation/WHY show immediately
        }
        const cur = await api.get('/api/challenges/current');
        if (cur.enrollment) {
          await refresh(); // keep hasEnrollment current before leaving
          clearDraft();
          showToast(t('alreadyIn100'), 'info');
          navigate('/dashboard');
          return;
        }
        const res = await api.post('/api/challenges/enroll', {
          activity_type: activityType,
          goal_value: goalValue
        });
        await refresh(); // enroll done → hasEnrollment is true so /dashboard isn't bounced back
        clearDraft();
        showToast(res.alreadyEnrolled ? t('alreadyIn100') : t('commitmentStarted'), 'success');
        navigate('/dashboard');
      } catch (err) {
        if (err.status === 409) {
          await refresh();
          clearDraft();
          showToast(t('alreadyIn100'), 'info');
          navigate('/dashboard');
          return;
        }
        setAutoFinishing(false);
        setError(err.message);
      } finally {
        finishInFlight.current = false;
        setBusy(false);
      }
    },
    [activityType, experienceLevel, baseline, motivation, preferredTime, scheduleDays, goalValue, navigate, showToast, t, refresh]
  );

  useEffect(() => {
    finishRef.current = finish;
  });

  // After OAuth (authed + draft goal restored), auto-complete to the dashboard once.
  useEffect(() => {
    if (pendingAutoFinishRef.current && user && (selectedGoal != null || (customMode && customGoal))) {
      pendingAutoFinishRef.current = false;
      finishRef.current?.(user);
    }
  }, [user, selectedGoal, customMode, customGoal]);

  const confirmGoal = () => {
    setError('');
    setStep(5); // next: WHEN — auth (for guests) comes after the schedule
  };

  const submitAuth = async (e) => {
    e.preventDefault();
    setError('');
    setAuthAttempted(true);
    if (authMode === 'register' && !acceptedTerms) {
      setError(t('termsRequired'));
      return;
    }
    if (!emailOk || !authForm.password || (authMode === 'register' && (!nameOk || !passwordOk || !matchOk))) return;
    setBusy(true);
    try {
      const me =
        authMode === 'register'
          ? await register({ name: authForm.name, email: authForm.email, password: authForm.password })
          : await login({ email: authForm.email, password: authForm.password });
      showToast(authMode === 'register' ? t('registerSuccess') : t('loginSuccess'), 'success');
      await finish(me);
    } catch (err) {
      // Login failures stay generic; register surfaces the real reason
      // (duplicate email, weak password) via the shared error mapper.
      setError(authMode === 'register' ? authErrorMessage(err, t) : t('invalidCredentials'));
    } finally {
      setBusy(false);
    }
  };

  const toggleDay = (i) => {
    setScheduleDays((prev) => (prev.includes(i) ? prev.filter((d) => d !== i) : [...prev, i]));
  };

  const toggleMotivation = (key) => {
    setMotivation((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      if (prev.length >= MOTIVATION_MAX) return prev;
      return [...prev, key];
    });
  };

  const canContinue =
    (step === 1 && activityType) ||
    (step === 2 && motivation.length >= 1) ||
    (step === 3 && experienceLevel && baseline !== null) ||
    (step === 4 && (customMode ? goalValue > 0 : !!selectedGoal)) ||
    (step === 5 && preferredTime);

  const nameOk = authForm.name.trim().length >= 2;
  const emailOk = EMAIL_RE.test(authForm.email);
  const pwdIssues = authMode === 'register' && authForm.password ? passwordIssues(authForm.password) : [];
  const passwordOk = pwdIssues.length === 0;
  const matchOk = authMode !== 'register' || (authForm.confirm.length > 0 && authForm.password === authForm.confirm);
  const strength = passwordStrength(authForm.password);

  const authValid =
    authMode === 'register'
      ? nameOk && emailOk && passwordOk && matchOk && acceptedTerms
      : emailOk && authForm.password.length >= 1;

  // While auto-finishing (OAuth return with a restored goal), never show the
  // steps — redirect straight to the dashboard instead of flashing a step.
  if (autoFinishing) {
    return <LoadingState />;
  }

  return (
    <div className="ob page">
      <div className="ob-progress">
        <ProgressBar value={step} max={totalSteps} />
        <div className="ob-stages">
          {stages.map((key, i) => (
            <span
              key={key}
              className={`ob-stage ${i === step - 1 ? 'is-active' : ''} ${i < step - 1 ? 'is-done' : ''}`.trim()}
            >
              {t(key)}
            </span>
          ))}
        </div>
      </div>

      <div key={step} className="ob__stage">
        {step === 1 && (
          <div className="stack">
            <StageHeading title={t('whatAreYouCommittingTo')} />
            <ActivityGrid options={activityOptions} selected={activityType} onSelect={setActivityType} />
          </div>
        )}

        {step === 2 && (
          <div className="stack">
            <StageHeading title={t('whatDrivesYou')} sub={t('whySub')} />
            <p className="ob-note">
              {t('chooseUpTo')} · {t('selectedCount', { n: motivation.length })}
            </p>
            <MotivationChips selected={motivation} onToggle={toggleMotivation} t={t} />
            {motivation.length ? (
              <div className="ob-motivation">
                {motivation.map((key) => (
                  <p key={key} className="ob-motivation__line">
                    <span className="ob-motivation__name">{t(motivationLabelKey(key))}</span>
                    <span className="ob-motivation__guidance">{t(motivationGuidanceKey(key))}</span>
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        )}

        {step === 3 && (
          <div className="stack">
            <StageHeading title={t('whereAreYouStarting')} />
            <OptionGrid options={experienceOptions} selected={experienceLevel} onSelect={setExperienceLevel} />
            <h2 className="ob-subtitle">{t('howMuchPerWeek')}</h2>
            <OptionGrid options={baselineOptions} selected={baseline} onSelect={setBaseline} />
          </div>
        )}

        {step === 4 && (
          <div className="stack">
            <StageHeading
              title={t('yourGoal')}
              sub={t('socialProofNote', { exp: experienceLevel ? t(experienceLevel) : '' })}
            />
            <p className="ob-note">{t('basedOnYourStart')}</p>
            <div className="ob-goals">
              {goals.map((g) => (
                <GoalCard
                  key={g.value}
                  value={g.value}
                  level={g.level}
                  unit={unit}
                  recommended={g.recommended}
                  pace={g.weeklyPace}
                  vsBaseline={g.vsBaseline}
                  selected={!customMode && selectedGoal === g.value}
                  onSelect={() => {
                    setCustomMode(false);
                    setSelectedGoal(g.value);
                  }}
                />
              ))}
            </div>

            <button
              type="button"
              className={`ob-option ${customMode ? 'is-selected' : ''}`.trim()}
              onClick={() => {
                setCustomMode(true);
                setSelectedGoal(null);
              }}
            >
              {t('setMyOwnGoal')}
            </button>

            {customMode ? (
              <label className="field">
                <span className="field__label">{t('customGoalHint', { unit: t(unit) })}</span>
                <input
                  className="field__input"
                  type="number"
                  min="1"
                  step="0.1"
                  value={customGoal}
                  onChange={(e) => setCustomGoal(e.target.value)}
                  placeholder={t('customGoalPlaceholder')}
                />
              </label>
            ) : null}

            <p className="ob-note">{t('recommendationNote')}</p>
          </div>
        )}

        {step === 5 && (
          <div className="stack">
            <StageHeading title={t('whenWillYour100Happen')} />
            <OptionGrid options={timeOptions} selected={preferredTime} onSelect={setPreferredTime} />
            <h2 className="ob-subtitle">{t('selectDays')}</h2>
            <DayChips selected={scheduleDays} onToggle={toggleDay} t={t} />
          </div>
        )}

        {step === 6 && (
          <div className="stack">
            <StageHeading title={t('almostIn')} />
            <p className="ob-note">
              {authMode === 'register' ? t('createAccountToFinish') : t('loginToFinish')}
            </p>

            <div className="ob-auth__tabs">
              <button
                type="button"
                className={`ob-auth__tab ${authMode === 'register' ? 'is-active' : ''}`.trim()}
                onClick={() => setAuthMode('register')}
              >
                {t('register')}
              </button>
              <button
                type="button"
                className={`ob-auth__tab ${authMode === 'login' ? 'is-active' : ''}`.trim()}
                onClick={() => setAuthMode('login')}
              >
                {t('login')}
              </button>
            </div>

            <OAuthButtons returnTo="/onboarding" mode="register" disabled={!acceptedTerms} onBlocked={() => setError(t('termsRequired'))} />

            <form className="ob-auth" onSubmit={submitAuth} noValidate>
              {authMode === 'register' ? (
                <label className="field">
                  <span className="field__label">{t('name')}</span>
                  <input
                    className={`field__input ${authAttempted && !nameOk ? 'field__input--invalid' : ''}`.trim()}
                    value={authForm.name}
                    onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
                    placeholder={t('namePlaceholder')}
                    autoComplete="name"
                    required
                  />
                  {authAttempted && !authForm.name ? (
                    <span className="field__hint">{t('nameRequired')}</span>
                  ) : authForm.name && !nameOk ? (
                    <span className="field__hint">{t('nameTooShort')}</span>
                  ) : null}
                </label>
              ) : null}

              <label className="field">
                <span className="field__label">{t('email')}</span>
                <input
                  className={`field__input ${(authAttempted || authForm.email) && !emailOk ? 'field__input--invalid' : ''}`.trim()}
                  type="email"
                  value={authForm.email}
                  onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                  placeholder={t('emailPlaceholder')}
                  autoComplete="email"
                  required
                />
                {authAttempted && !authForm.email ? (
                  <span className="field__hint">{t('emailRequired')}</span>
                ) : authForm.email && !emailOk ? (
                  <span className="field__hint">{t('validEmailRequired')}</span>
                ) : null}
              </label>

              <PasswordField
                label={t('password')}
                value={authForm.password}
                onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                placeholder={t('passwordPlaceholder')}
                minLength={10}
                required
                showStrength={authMode === 'register'}
                strength={strength}
                issues={authMode === 'register' ? pwdIssues : []}
                invalid={authAttempted && !authForm.password}
              />
              {authAttempted && !authForm.password ? (
                <span className="field__hint">{t('passwordRequired')}</span>
              ) : null}

              {authMode === 'register' ? (
                <PasswordField
                  label={t('confirmPassword')}
                  value={authForm.confirm}
                  onChange={(e) => setAuthForm({ ...authForm, confirm: e.target.value })}
                  required
                  invalid={authForm.confirm && !matchOk}
                />
              ) : null}
              {authMode === 'register' && authForm.confirm && !matchOk ? (
                <span className="field__hint">{t('passwordsMismatch')}</span>
              ) : null}

              {authMode === 'register' ? (
                <label className="auth-terms">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    required
                  />
                  <span>
                    {t('termsAccept')} <Link to="/privacy" className="auth-card__link">{t('termsAndPrivacy')}</Link>
                  </span>
                </label>
              ) : null}

              {error ? <p className="ob-error">{error}</p> : null}

              <Button type="submit" variant="primary" size="lg" full disabled={busy || !authValid}>
                {busy ? t('finishing') : t('finishYour100')}
              </Button>
            </form>
          </div>
        )}
      </div>

      {error && step !== 6 ? <p className="ob-error">{error}</p> : null}

      <div className="ob-actions">
        {step > 1 && (
          <Button variant="secondary" onClick={back} disabled={busy}>
            {step === 6 ? t('backToGoal') : t('back')}
          </Button>
        )}

        {step < 3 ? (
          <Button variant="primary" onClick={next} disabled={!canContinue || busy} full>
            {t('continue')}
          </Button>
        ) : null}

        {step === 3 ? (
          <Button variant="primary" onClick={next} disabled={!canContinue || busy} full>
            {busy ? t('loading') : t('continue')}
          </Button>
        ) : null}

        {step === 4 ? (
          <Button variant="primary" onClick={confirmGoal} disabled={!canContinue || busy} full>
            {busy ? t('loading') : t('imIn')}
          </Button>
        ) : null}

        {step === 5 ? (
          <Button
            variant="primary"
            onClick={() => (user ? finish(user) : next())}
            disabled={!canContinue || busy}
            full
          >
            {t('continue')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}