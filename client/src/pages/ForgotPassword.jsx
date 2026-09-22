import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import { usePageMeta } from '../hooks/usePageMeta';
import AuthShell from '../components/AuthShell';
import TextField from '../components/TextField';
import SubmitButton from '../components/SubmitButton';
import { CheckIcon } from '../components/icons';
import './Auth.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPassword() {
  usePageMeta({ title: 'Forgot password', path: '/forgot-password', index: false });
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.post('/api/auth/forgot-password', { email });
      setSent(true);
    } catch (err) {
      setError(err.message || t('resetFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <AuthShell
        kicker={t('brand')}
        title={t('forgotPasswordTitle')}
        subtitle={t('forgotPasswordSub')}
        onSubmit={submit}
      >
        {sent ? (
          <div className="auth-card__success">
            <span className="auth-card__success-mark">
              <CheckIcon size={26} />
            </span>
            <p className="auth-card__note">{t('resetLinkSent')}</p>
            <p className="auth-card__note">{t('forgotCheckTelegram')}</p>
          </div>
        ) : (
          <>
            <TextField
              label={t('email')}
              icon="mail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('emailPlaceholder')}
              autoComplete="email"
              invalid={email && !EMAIL_RE.test(email)}
              hint={email && !EMAIL_RE.test(email) ? t('validEmailRequired') : null}
            />
            {error ? <p className="auth-card__error">{error}</p> : null}
            <SubmitButton type="submit" variant="primary" size="lg" full busy={busy} disabled={!EMAIL_RE.test(email)}>
              {t('sendResetLink')}
            </SubmitButton>
          </>
        )}
        <p className="auth-card__switch">
          <Link to="/login">{t('backToLogin')}</Link>
        </p>
      </AuthShell>
    </div>
  );
}