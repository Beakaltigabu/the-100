import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { usePageMeta } from '../hooks/usePageMeta';
import './Support.css';

export default function Privacy() {
  const { t } = useLanguage();
  usePageMeta({
    title: 'Privacy Policy & Terms',
    description: 'THE 100 privacy policy and terms of service — how we handle your data, Strava connection, and account.',
    path: '/privacy'
  });

  return (
    <div className="support">
      <div className="support__inner">
        <header className="support__header">
          <p className="support__brand">
            THE <span className="support__slash">/</span> 100
          </p>
          <p className="support__kicker">{t('privacyPolicyTitle')}</p>
          <h1 className="support__title">{t('privacyPolicyTitle')}</h1>
          <p className="support__sub">{t('privacyUpdated')}</p>
        </header>

        <section className="support__section">
          <p className="support__text">{t('privacyIntro')}</p>
        </section>

        <section className="support__section">
          <h2 className="support__h2">{t('privacyCollectTitle')}</h2>
          <p className="support__text">{t('privacyCollectBody')}</p>
        </section>

        <section className="support__section">
          <h2 className="support__h2">{t('privacyUseTitle')}</h2>
          <p className="support__text">{t('privacyUseBody')}</p>
        </section>

        <section className="support__section">
          <h2 className="support__h2">{t('privacyStravaTitle')}</h2>
          <p className="support__text">{t('privacyStravaBody')}</p>
          <Link to="/support" className="support__link">
            {t('stravaDataTitle')} →
          </Link>
        </section>

        <section className="support__section">
          <h2 className="support__h2">{t('privacyConsentTitle')}</h2>
          <p className="support__text">{t('privacyConsentBody')}</p>
        </section>

        <section className="support__section">
          <h2 className="support__h2">{t('privacyDeletionTitle')}</h2>
          <p className="support__text">{t('privacyDeletionBody')}</p>
        </section>

        <section className="support__section">
          <h2 className="support__h2">{t('privacyUsageTitle')}</h2>
          <p className="support__text">{t('privacyUsageBody')}</p>
        </section>

        <section className="support__section">
          <h2 className="support__h2">{t('privacyNoShareTitle')}</h2>
          <p className="support__text">{t('privacyNoShareBody')}</p>
        </section>

        <section className="support__section">
          <h2 className="support__h2">{t('privacyHostingTitle')}</h2>
          <p className="support__text">{t('privacyHostingBody')}</p>
        </section>

        <section className="support__section">
          <h2 className="support__h2">{t('privacyContactTitle')}</h2>
          <p className="support__text">{t('privacyContactBody')}</p>
        </section>

        <section className="support__section">
          <h2 className="support__h2">{t('termsTitle')}</h2>
          <p className="support__text">{t('termsIntro')}</p>
        </section>

        <section className="support__section">
          <h2 className="support__h2">{t('termsServiceTitle')}</h2>
          <p className="support__text">{t('termsServiceBody')}</p>
        </section>

        <section className="support__section">
          <h2 className="support__h2">{t('termsAccountsTitle')}</h2>
          <p className="support__text">{t('termsAccountsBody')}</p>
        </section>

        <section className="support__section">
          <h2 className="support__h2">{t('termsUseTitle')}</h2>
          <p className="support__text">{t('termsUseBody')}</p>
        </section>

        <section className="support__section">
          <h2 className="support__h2">{t('termsContentTitle')}</h2>
          <p className="support__text">{t('termsContentBody')}</p>
        </section>

        <section className="support__section">
          <h2 className="support__h2">{t('termsLiabilityTitle')}</h2>
          <p className="support__text">{t('termsLiabilityBody')}</p>
        </section>

        <section className="support__section">
          <h2 className="support__h2">{t('termsTerminationTitle')}</h2>
          <p className="support__text">{t('termsTerminationBody')}</p>
        </section>

        <section className="support__section">
          <h2 className="support__h2">{t('termsLawTitle')}</h2>
          <p className="support__text">{t('termsLawBody')}</p>
        </section>

        <footer className="support__footer">
          <Link to="/support" className="support__link">
            {t('backToSupport')}
          </Link>
          <p className="support__rights">{t('footerRights')} — THE 100</p>
        </footer>
      </div>
    </div>
  );
}