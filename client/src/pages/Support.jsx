import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import { usePageMeta } from '../hooks/usePageMeta';
import { useToast } from '../components/Toast';
import Button from '../components/Button';
import './Support.css';

const STRAVA_MANAGE_APPS = 'https://www.strava.com/settings/apps';
const STRAVA_SUPPORT = 'https://support.strava.com';

export default function Support() {
  const { t } = useLanguage();
  usePageMeta({
    title: 'Support & Help',
    description: 'Get help with THE 100, contact support, and learn how your Strava data is used. We typically reply within a day.',
    path: '/support'
  });
  const { showToast } = useToast();
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    // Client-side validation mirrors the server schema (name 2+, valid email,
    // message 5+) so empty/invalid submissions fail fast with clear feedback.
    const name = form.name.trim();
    const email = form.email.trim();
    const message = form.message.trim();
    if (name.length < 2) return showToast(t('nameTooShort'), 'error');
    if (!EMAIL_RE.test(email)) return showToast(t('validEmailRequired'), 'error');
    if (message.length < 5) return showToast(t('contactMessageShort'), 'error');
    setBusy(true);
    try {
      await api.post('/api/contact', { name, email, message });
      setSent(true);
      setForm({ name: '', email: '', message: '' });
      showToast(t('contactSent'), 'success');
    } catch (err) {
      // Surface the server's message when it's specific, else the generic error.
      showToast(err.status === 400 && err.message ? err.message : t('contactError'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="support">
      <div className="support__inner">
        <header className="support__header">
          <p className="support__brand">
            THE <span className="support__slash">/</span> 100
          </p>
          <p className="support__kicker">{t('supportLink')}</p>
          <h1 className="support__title">{t('supportTitle')}</h1>
          <p className="support__sub">{t('supportSub')}</p>
        </header>

        <section className="support__section">
          <h2 className="support__h2">{t('contactTitle')}</h2>
          <a className="support__mailto" href={`mailto:${t('supportEmailLabel')}`}>
            {t('supportEmailLabel')}
          </a>
          <p className="support__text">{t('responseTime')}</p>
          <p className="support__text">{t('supportInclude')}</p>

          <form className="support__form" onSubmit={submit} noValidate>
            <label className="support__field">
              <span className="support__label">{t('contactName')}</span>
              <input
                className="support__input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                minLength={2}
                maxLength={120}
              />
            </label>
            <label className="support__field">
              <span className="support__label">{t('contactEmail')}</span>
              <input
                className="support__input"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
                maxLength={255}
              />
            </label>
            <label className="support__field">
              <span className="support__label">{t('contactMessage')}</span>
              <textarea
                className="support__input support__input--area"
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                required
                minLength={5}
                maxLength={5000}
                rows={5}
              />
            </label>
            <Button type="submit" variant="primary" size="lg" busy={busy} disabled={busy || sent}>
              {sent ? '✓' : t('contactSubmit')}
            </Button>
          </form>
          <p className="support__text">{t('contactNote')}</p>
        </section>

        <section className="support__section">
          <h2 className="support__h2">{t('stravaDataTitle')}</h2>
          <p className="support__text">{t('stravaDataIntro')}</p>

          <h3 className="support__h3">{t('stravaCollectTitle')}</h3>
          <p className="support__text">{t('stravaCollectBody')}</p>

          <h3 className="support__h3">{t('stravaWhyTitle')}</h3>
          <p className="support__text">{t('stravaWhyBody')}</p>

          <h3 className="support__h3">{t('stravaHowTitle')}</h3>
          <p className="support__text">{t('stravaHowBody')}</p>

          <h3 className="support__h3">{t('stravaStoreTitle')}</h3>
          <p className="support__text">{t('stravaStoreBody')}</p>

          <h3 className="support__h3">{t('stravaNeverTitle')}</h3>
          <p className="support__text">{t('stravaNeverBody')}</p>

          <h3 className="support__h3">{t('stravaControlTitle')}</h3>
          <ul className="support__list">
            <li>{t('stravaControlDisconnect')}</li>
            <li>{t('stravaControlDelete')}</li>
            <li>{t('stravaControlRevoke')}</li>
          </ul>
        </section>

        <section className="support__section">
          <h2 className="support__h2">{t('stravaLinksTitle')}</h2>
          <div className="support__links">
            <a className="support__link" href={STRAVA_MANAGE_APPS} target="_blank" rel="noopener noreferrer">
              {t('stravaManageApps')} →
            </a>
            <a className="support__link" href={STRAVA_SUPPORT} target="_blank" rel="noopener noreferrer">
              {t('stravaSupportLink')} →
            </a>
          </div>
          <p className="support__note">{t('stravaTrademark')}</p>
        </section>

        <footer className="support__footer">
          <Link to="/privacy" className="support__link">
            {t('readPrivacyPolicy')}
          </Link>
          <p className="support__rights">{t('footerRights')} — THE 100</p>
        </footer>
      </div>
    </div>
  );
}