import { useState, useEffect } from 'react';
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
import { passwordStrength } from '../lib/password';
import { passwordIssues, authErrorMessage } from '../lib/validation';
import './Auth.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Register() {
  usePageMeta({ title: 'Create your account', path: '/register', index: false });
  const { register } = useAuth();
  const { t } = useLanguage();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [googleNoAccount, setGoogleNoAccount] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('google_no_account') === '1') {
      setGoogleNoAccount(true);
    }
  }, []);

  const nameOk = form.name.trim().length >= 2;
  const emailOk = EMAIL_RE.test(form.email);
  const pwdIssues = form.password ? passwordIssues(form.password) : [];
  const passwordOk = pwdIssues.length === 0;
  const matchOk = form.confirm.length > 0 && form.password === form.confirm;
  const strength = passwordStrength(form.password);
  const valid = nameOk && emailOk && passwordOk && matchOk && acceptedTerms;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!matchOk) {
      setError(t('passwordsMismatch'));
      return;
    }
    if (!acceptedTerms) {
      setError(t('termsRequired'));
      return;
    }
    setBusy(true);
    try {
      await register({ name: form.name, email: form.email, password: form.password });
      showToast(t('registerSuccess'), 'success');
      navigate('/onboarding');
    } catch (err) {
      setError(authErrorMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <AuthShell
        kicker={t('authJoin')}
        title={t('authRegisterTitle')}
        subtitle={t('authRegisterSub')}
        switchTo="login"
        onSubmit={submit}
      >
        {googleNoAccount ? <p className="auth-card__note auth-card__note--warn">{t('googleNoAccount')}</p> : null}

        <TextField
          label={t('name')}
          icon="user"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder={t('namePlaceholder')}
          autoComplete="name"
          invalid={form.name && !nameOk}
          hint={form.name && !nameOk ? t('nameTooShort') : null}
        />

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
          placeholder={t('passwordPlaceholder')}
          autoComplete="new-password"
          minLength={10}
          required
          showStrength
          strength={strength}
          issues={pwdIssues}
        />

        <PasswordField
          label={t('confirmPassword')}
          value={form.confirm}
          onChange={(e) => setForm({ ...form, confirm: e.target.value })}
          autoComplete="new-password"
          required
          invalid={form.confirm && !matchOk}
        />
        {form.confirm && !matchOk ? <span className="field__hint">{t('passwordsMismatch')}</span> : null}

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

        {error ? <p className="auth-card__error">{error}</p> : null}

        <SubmitButton type="submit" variant="primary" size="lg" full busy={busy} disabled={!valid}>
          {t('register')}
        </SubmitButton>

        <OAuthButtons mode="register" disabled={!acceptedTerms} onBlocked={() => setError(t('termsRequired'))} />
      </AuthShell>
    </div>
  );
}