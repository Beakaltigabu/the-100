import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './Landing.css';
import { api } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import { usePageMeta } from '../hooks/usePageMeta';
import Button from '../components/Button';
import { todayISO } from '../lib/time';

function CountdownBlock({ target }) {
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
    { value: String(Math.floor(s / 86400)).padStart(2, '0'), label: t('cdDays') },
    { value: String(Math.floor((s % 86400) / 3600)).padStart(2, '0'), label: t('cdHours') },
    { value: String(Math.floor((s % 3600) / 60)).padStart(2, '0'), label: t('cdMinutes') },
    { value: String(s % 60).padStart(2, '0'), label: t('cdSeconds') }
  ];
  return (
    <div className="ld-count">
      {parts.map((p, i) => (
        <div className="ld-count__unit" key={i}>
          <span className="ld-count__num">{p.value}</span>
          <span className="ld-count__label">{p.label}</span>
        </div>
      ))}
    </div>
  );
}

const START_POINTS = [
  { km: '50 KM', label: 'spBeginning' },
  { km: '500 KM', label: 'spBuild' },
  { km: '1,000 KM', label: 'spChallenge' }
];

const MILESTONES = [10, 50, 100, 250, 500, 750, 1000];

const STEPS = [
  { title: 'step1Title', body: 'step1Body' },
  { title: 'step2Title', body: 'step2Body' },
  { title: 'step3Title', body: 'step3Body' },
  { title: 'step4Title', body: 'step4Body' },
  { title: 'step5Title', body: 'step5Body' },
  { title: 'step6Title', body: 'step6Body' }
];

const FAQ = Array.from({ length: 8 }, (_, i) => ({ q: `faq${i + 1}q`, a: `faq${i + 1}a` }));

export default function Landing() {
  const { t } = useLanguage();
  usePageMeta({
    title: 'THE 100 — 100 Day Commitment Challenge',
    description:
      'A free 100-day personal movement challenge. Choose your goal — running, walking, run + walk, or cycling — commit for 100 days, and finish what you started. Bilingual English / Amharic.',
    path: '/'
  });
  const [next, setNext] = useState(null);

  useEffect(() => {
    api
      .get('/api/challenges/next')
      .then((d) => setNext(d.challenge))
      .catch(() => {});
  }, []);

  const startLabel = next
    ? new Date(next.startDate + 'T00:00:00')
        .toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
        .toUpperCase()
    : '';

  // Once the challenge starts, the counter flips from a countdown to a live
  // "DAY N / 100" reading with the number of people moving.
  const started = next ? next.started : false;
  const day = next
    ? Math.min(100, Math.max(1, Math.floor((new Date(todayISO() + 'T00:00:00') - new Date(next.startDate + 'T00:00:00')) / 86400000) + 1))
    : 1;

  return (
    <div className="landing">
      <section className="ld-hero">
        <div className="ld-hero__art" aria-hidden="true">
          <span className="ld-hero__rule" />
          <span className="ld-hero__circle" />
          <span className="ld-hero__hundred">100</span>
        </div>
        <p className="ld-kicker">{t('heroKicker')}</p>
        <h1 className="ld-hero__title">
          <span>{t('heroHeadline')}</span>
          <span className="ld-accent">{t('manifesto2')}</span>
        </h1>
        <p className="ld-hero__support">{t('heroSupport')}</p>
        <div className="ld-hero__actions">
          <Link to="/onboarding">
            <Button variant="primary" size="lg" full>
              {t('joinThe100')} →
            </Button>
          </Link>
          <a href="#how" className="ld-link">
            {t('seeHowItWorks')} ↓
          </a>
        </div>
      </section>

      {next ? (
        <section className="ld-countdown">
          <p className="ld-kicker">{started ? t('the100IsLive') : t('the100Begins')}</p>
          <h2 className="ld-countdown__title">{started ? t('challengeLiveTitle') : t('countdownTitle')}</h2>
          {started ? (
            <div className="ld-live">
              <p className="ld-live__day">{t('challengeLiveDay', { day })}</p>
              <p className="ld-live__people">{t('peopleMovingCount', { n: next.memberCount })}</p>
            </div>
          ) : (
            <>
              <CountdownBlock target={next.startDate} />
              <p className="ld-countdown__date">{startLabel}</p>
            </>
          )}
          <Link to="/onboarding">
            <Button variant="primary" size="lg">
              {t('chooseYour100')} →
            </Button>
          </Link>
        </section>
      ) : null}

      <section className="ld-movement">
        <div className="ld-movement__left">
          <p className="ld-kicker">{t('manifestoKicker')}</p>
          <h2 className="ld-display">{t('manifestoTitle')}</h2>
          <h2 className="ld-display ld-accent">{t('manifestoClosing2')}</h2>
        </div>
        <div className="ld-movement__right">
          <p className="ld-body">{t('manifestoP1')}</p>
          <p className="ld-body">{t('manifestoP3')}</p>
          <p className="ld-body">
            {t('manifestoP4')} <strong>{t('manifestoBoth')}</strong>
          </p>
          <p className="ld-body">
            {t('manifestoP5')} <strong>{t('manifestoP6')}</strong>
          </p>
          <p className="ld-body">{t('manifestoP7')}</p>
          <p className="ld-body ld-accent">{t('manifestoP8')}</p>
        </div>
        <p className="ld-movement__statement">{t('movementStatement')}</p>
        <p className="ld-signoff">— THE 100</p>
      </section>

      <section className="ld-founder">
        <p className="ld-kicker">{t('founderKicker')}</p>
        <h2 className="ld-display ld-founder__big">{t('founderLine')}</h2>
        <p className="ld-founder__sub ld-accent">{t('founderSub')}</p>
        <div className="ld-stats">
          <div className="ld-stat">
            <span className="ld-stat__num">1,000 KM</span>
            <span className="ld-stat__label">{t('statFounder')}</span>
          </div>
          <div className="ld-stat">
            <span className="ld-stat__num">100 DAYS</span>
            <span className="ld-stat__label">{t('statCommitment')}</span>
          </div>
          <div className="ld-stat">
            <span className="ld-stat__num">ONE GOAL</span>
            <span className="ld-stat__label">{t('statJourney')}</span>
          </div>
        </div>
      </section>

      <section className="ld-how" id="how">
        <p className="ld-kicker">{t('howKicker')}</p>
        <h2 className="ld-display ld-section-title">{t('howItWorksTitle')}</h2>
        <div className="ld-timeline">
          {STEPS.map((step, i) => (
            <div className="ld-timeline__step" key={i}>
              <span className="ld-timeline__node">{String(i + 1).padStart(2, '0')}</span>
              <div className="ld-timeline__content">
                <h3>{t(step.title)}</h3>
                <p className="ld-body">{t(step.body)}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="ld-faq" id="faq">
        <p className="ld-kicker">{t('faqKicker')}</p>
        <h2 className="ld-display ld-section-title">{t('faqTitle')}</h2>
        <div className="ld-faq__list">
          {FAQ.map((item, i) => (
            <details className="ld-faq__item" key={i}>
              <summary>{t(item.q)}</summary>
              <p className="ld-body">{t(item.a)}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="ld-startpoints">
        <h2 className="ld-display ld-section-title">{t('spTitle')}</h2>
        <div className="ld-sp-grid">
          {START_POINTS.map((sp) => (
            <div className="ld-sp" key={sp.km}>
              <span className="ld-sp__num">{sp.km}</span>
              <span className="ld-sp__label">{t(sp.label)}</span>
            </div>
          ))}
        </div>
        <p className="ld-body ld-sp__support">{t('spSupport')}</p>
        <p className="ld-sp__note">{t('spNotRanking')}</p>
      </section>

      <section className="ld-milestones">
        <p className="ld-kicker">{t('progressKicker')}</p>
        <h2 className="ld-display ld-section-title">{t('milestonesTitle')}</h2>
        <div className="ld-ml">
          {MILESTONES.map((m, i) => (
            <div className="ld-ml__node" key={m}>
              <span className="ld-ml__dot" />
              <span className="ld-ml__km">{m}</span>
              {i < MILESTONES.length - 1 ? <span className="ld-ml__line" aria-hidden="true" /> : null}
            </div>
          ))}
        </div>
        <p className="ld-microcopy">{t('mlMicrocopy')}</p>
      </section>
    </div>
  );
}