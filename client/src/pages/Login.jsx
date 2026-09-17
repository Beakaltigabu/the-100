import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../components/Toast';
import AuthShell from '../components/AuthShell';
import TextField from '../components/TextField';
import PasswordField from '../components/PasswordField';
import SubmitButton from '../components/SubmitButton';
import OAuthButtons from '../components/OAuthButtons';
import './Auth.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login() {
  const { login } = useAuth();
  const { t } = useLanguage();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const emailOk = EMAIL_RE.test(form.email);
  const valid = emailOk && form.password.length >= 1;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(form);
      showToast(t('loginSuccess'), 'success');
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || t('invalidCredentials'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <AuthShell kicker={t('brand')} title={t('welcomeBack')} subtitle={t('loginSub')} onSubmit={submit}>
        <TextField
          label={t('email')}
          icon="mail"
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder={t('emailPlaceholder')}
          autoComplete="email"
          invalid={form.email && !emailOk}
          hint={form.email && !emailOk ? t('validEmailRequired') : null}
        />

        <PasswordField
          label={t('password')}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          autoComplete="current-password"
        />

        <Link to="/forgot-password" className="auth-card__link">
          {t('forgotPassword')}
        </Link>

        {error ? <p className="auth-card__error">{error}</p> : null}

        <SubmitButton type="submit" variant="primary" size="lg" full busy={busy} disabled={!valid}>
          {t('login')}
        </SubmitButton>

        <OAuthButtons />

        <p className="auth-card__switch">
          {t('needAccount')} <Link to="/register">{t('register')}</Link>
        </p>
      </AuthShell>
    </div>
  );
}