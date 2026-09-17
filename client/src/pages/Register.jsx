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
import { passwordStrength } from '../lib/password';
import './Auth.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Register() {
  const { register } = useAuth();
  const { t } = useLanguage();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const nameOk = form.name.trim().length >= 2;
  const emailOk = EMAIL_RE.test(form.email);
  const passwordOk = form.password.length >= 10;
  const matchOk = form.confirm.length > 0 && form.password === form.confirm;
  const strength = passwordStrength(form.password);
  const valid = nameOk && emailOk && passwordOk && matchOk;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!matchOk) {
      setError(t('passwordsMismatch'));
      return;
    }
    setBusy(true);
    try {
      await register({ name: form.name, email: form.email, password: form.password });
      showToast(t('registerSuccess'), 'success');
      navigate('/onboarding');
    } catch (err) {
      setError(err.message || t('registerFail'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <AuthShell
        kicker={t('brand')}
        title={t('createAccount')}
        subtitle={t('registerSub')}
        onSubmit={submit}
      >
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
        />

        <PasswordField
          label={t('confirmPassword')}
          value={form.confirm}
          onChange={(e) => setForm({ ...form, confirm: e.target.value })}
          autoComplete="new-password"
          required
        />
        {form.confirm && !matchOk ? <span className="field__hint">{t('passwordsMismatch')}</span> : null}

        {error ? <p className="auth-card__error">{error}</p> : null}

        <SubmitButton type="submit" variant="primary" size="lg" full busy={busy} disabled={!valid}>
          {t('register')}
        </SubmitButton>

        <OAuthButtons />

        <p className="auth-card__switch">
          {t('alreadyHaveAccount')} <Link to="/login">{t('login')}</Link>
        </p>
      </AuthShell>
    </div>
  );
}