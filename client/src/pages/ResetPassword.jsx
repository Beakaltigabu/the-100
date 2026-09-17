import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../components/Toast';
import AuthShell from '../components/AuthShell';
import PasswordField from '../components/PasswordField';
import SubmitButton from '../components/SubmitButton';
import { passwordStrength } from '../lib/password';
import './Auth.css';

export default function ResetPassword() {
  const { t } = useLanguage();
  const { showToast } = useToast();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const strength = passwordStrength(password);
  const valid =
    password.length >= 10 && password === confirm && /[A-Za-z]/.test(password) && /[0-9]/.test(password);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.post('/api/auth/reset-password', { token, password });
      try {
        await logout();
      } catch {
        // server already cleared the cookie; client auth state is cleared below
      }
      setBusy(false);
      setDone(true);
      setTimeout(() => {
        navigate('/login');
      }, 1100);
    } catch (err) {
      setError(err.message || t('resetFailed'));
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <AuthShell
        kicker={t('brand')}
        title={t('resetPassword')}
        subtitle={t('resetInstructions')}
        onSubmit={submit}
      >
        <PasswordField
          label={t('newPassword')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          minLength={10}
          showStrength
          strength={strength}
        />

        <PasswordField
          label={t('confirmPassword')}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
        />
        {confirm && password !== confirm ? <span className="field__hint">{t('passwordsMismatch')}</span> : null}

        {error ? <p className="auth-card__error">{error}</p> : null}

        <SubmitButton type="submit" variant="primary" size="lg" full busy={busy} done={done} disabled={!valid}>
          {t('resetPassword')}
        </SubmitButton>

        <p className="auth-card__switch">
          <Link to="/login">{t('backToLogin')}</Link>
        </p>
      </AuthShell>
    </div>
  );
}