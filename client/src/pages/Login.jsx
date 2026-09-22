import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { usePageMeta } from '../hooks/usePageMeta';
import { useToast } from '../components/Toast';
import AuthShell from '../components/AuthShell';
import TextField from '../components/TextField';
import PasswordField from '../components/PasswordField';
import SubmitButton from '../components/SubmitButton';
import OAuthButtons from '../components/OAuthButtons';
import './Auth.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login() {
  usePageMeta({ title: 'Log in', path: '/login', index: false });
  const { login } = useAuth();
  const { t } = useLanguage();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);

  const emailOk = EMAIL_RE.test(form.email);
  const valid = emailOk && form.password.length >= 1;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setAttempted(true);
    if (!emailOk || !form.password) return;
    setBusy(true);
    try {
      const me = await login(form);
      showToast(t('loginSuccess'), 'success');
      navigate(me && !me.hasEnrollment ? '/onboarding' : '/dashboard');
    } catch (err) {
      setError(err.message || t('invalidCredentials'));
    } finally {
      setBusy(false);
    }
  };

  const emailHint = attempted && !form.email ? t('emailRequired') : form.email && !emailOk ? t('validEmailRequired') : null;

  return (
    <div className="auth-page">
      <AuthShell
        kicker={t('authWelcomeBack')}
        title={t('authLoginTitle')}
        subtitle={t('authLoginSub')}
        switchTo="register"
        onSubmit={submit}
      >
        <TextField
          label={t('email')}
          icon="mail"
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder={t('emailPlaceholder')}
          autoComplete="email"
          invalid={(attempted || form.email) && !emailOk}
          hint={emailHint}
        />

        <PasswordField
          label={t('password')}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          autoComplete="current-password"
          invalid={attempted && !form.password}
        />
        {attempted && !form.password ? <span className="field__hint">{t('passwordRequired')}</span> : null}

        <Link to="/forgot-password" className="auth-card__link">
          {t('forgotPassword')}
        </Link>

        {error ? <p className="auth-card__error">{error}</p> : null}

        <SubmitButton type="submit" variant="primary" size="lg" full busy={busy} disabled={!valid}>
          {t('login')}
        </SubmitButton>

        <OAuthButtons mode="login" />
      </AuthShell>
    </div>
  );
}