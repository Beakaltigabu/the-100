import { Link } from 'react-router-dom';
import './AuthShell.css';
import { useLanguage } from '../context/LanguageContext';

export default function AuthShell({ kicker, title, subtitle, onSubmit, switchTo, children }) {
  const { t } = useLanguage();
  const Card = onSubmit ? 'form' : 'div';
  const formProps = onSubmit ? { onSubmit, noValidate: true } : {};

  const switchData =
    switchTo === 'login'
      ? { label: t('authAlreadyHave'), cta: t('authSignIn'), to: '/login' }
      : switchTo === 'register'
        ? { label: t('authDontHave'), cta: t('authSignUp'), to: '/register' }
        : null;

  return (
    <div className="auth-shell">
      <header className="auth-shell__top">
        <Link to="/" className="auth-shell__brand">
          THE <span className="auth-shell__slash">/</span> 100
        </Link>
        {switchData ? (
          <div className="auth-shell__switch">
            <span className="auth-shell__switch-label">{switchData.label}</span>
            <Link to={switchData.to} className="auth-shell__switch-cta">
              {switchData.cta}
            </Link>
          </div>
        ) : null}
      </header>

      <div className="auth-shell__stage">
        <span className="auth-shell__ghost" aria-hidden="true">
          100
        </span>
        <div className="auth-shell__head">
          {kicker ? <p className="auth-shell__kicker">{kicker}</p> : null}
          <h1 className="auth-shell__title">{title}</h1>
          {subtitle ? <p className="auth-shell__subtitle">{subtitle}</p> : null}
        </div>
        <Card className="auth-card" {...formProps}>
          {children}
        </Card>
      </div>
    </div>
  );
}