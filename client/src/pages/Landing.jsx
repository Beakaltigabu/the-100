import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './Landing.css';
import { api } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import Button from '../components/Button';
import Countdown from '../components/Countdown';
import useReveal from '../hooks/useReveal';

export default function Landing() {
  const { t } = useLanguage();
  const [next, setNext] = useState(null);

  const [movementRef, movementVisible] = useReveal();
  const [founderRef, founderVisible] = useReveal();
  const [howRef, howVisible] = useReveal();
  const [ctaRef, ctaVisible] = useReveal();

  useEffect(() => {
    api
      .get('/api/challenges/next')
      .then((d) => setNext(d.challenge))
      .catch(() => {});
  }, []);

  const startLabel = next
    ? new Date(next.startDate + 'T00:00:00').toLocaleDateString(undefined, {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      })
    : '';

  const steps = [
    { title: t('step1Title'), body: t('step1Body') },
    { title: t('step2Title'), body: t('step2Body') },
    { title: t('step3Title'), body: t('step3Body') },
    { title: t('step4Title'), body: t('step4Body') },
    { title: t('step5Title'), body: t('step5Body') },
    { title: t('step6Title'), body: t('step6Body') }
  ];

  return (
    <div className="landing">
      <section className="hero">
        <div className="hero__watermark" aria-hidden="true">
          100
        </div>

        <p className="hero__kicker">{t('heroKicker')}</p>

        <div className="hero__manifesto">
          <span className="hero__manifesto-line">{t('manifesto1')}</span>
          <span className="hero__manifesto-line hero__manifesto-line--accent">{t('manifesto2')}</span>
        </div>

        <p className="hero__support">{t('heroSupport')}</p>

        <div className="hero__actions">
          <Link to="/onboarding">
            <Button variant="primary" size="lg" full>
              {t('joinThe100')}
            </Button>
          </Link>
          <a href="#how" className="hero__link">
            {t('seeHowItWorks')}
          </a>
        </div>
      </section>

      {next ? (
        <section className="begins">
          <p className="begins__kicker">{t('the100Begins')}</p>
          <p className="begins__date">
            {t('beginsOn')} · {startLabel}
          </p>
          <Countdown target={next.startDate} />
          <Link to="/onboarding">
            <Button variant="primary" size="lg">
              {t('chooseYour100')}
            </Button>
          </Link>
        </section>
      ) : null}

      <section
        className={`movement ${movementVisible ? 'is-visible' : ''}`.trim()}
        ref={movementRef}
      >
        <p className="movement__kicker">{t('movementKicker')}</p>
        <p className="movement__letter">{t('movementLetter')}</p>
        <p className="movement__signoff">{t('movementSignoff')}</p>
      </section>

      <section
        className={`founder ${founderVisible ? 'is-visible' : ''}`.trim()}
        ref={founderRef}
      >
        <p className="founder__title">{t('founderStoryTitle')}</p>
        <p className="founder__line">{t('founderStory1')}</p>
        <p className="founder__line founder__line--dim">{t('founderStory2')}</p>
        <p className="founder__sub">{t('founderStorySub')}</p>
      </section>

      <section
        className={`how ${howVisible ? 'is-visible' : ''}`.trim()}
        ref={howRef}
        id="how"
      >
        <p className="how__kicker">{t('howKicker')}</p>
        <h2 className="how__title">{t('howItWorksTitle')}</h2>

        <div className="timeline">
          {steps.map((step, i) => (
            <div className="timeline__step" key={i} style={{ animationDelay: `${i * 80}ms` }}>
              <div className="timeline__rail" aria-hidden="true">
                <span className="timeline__node">{i + 1}</span>
              </div>
              <div className="timeline__content">
                <h3>{step.title}</h3>
                <p className="text-muted">{step.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={`cta ${ctaVisible ? 'is-visible' : ''}`.trim()} ref={ctaRef}>
        <h2 className="cta__title">{t('campaign')}</h2>
        <Link to="/onboarding">
          <Button variant="primary" size="lg" full>
            {t('chooseYour100')}
          </Button>
        </Link>
      </section>
    </div>
  );
}