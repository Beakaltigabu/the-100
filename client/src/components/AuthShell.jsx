import './AuthShell.css';
import { useLanguage } from '../context/LanguageContext';

// Decorative day-dot strip echoing the dashboard's 100-day motif.
function Dots({ total = 36 }) {
  return (
    <div className="auth-shell__dots" aria-hidden="true">
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} className="auth-shell__dot" style={{ animationDelay: `${i * 90}ms` }} />
      ))}
    </div>
  );
}

export default function AuthShell({ kicker, title, subtitle, onSubmit, children }) {
  const { t } = useLanguage();
  const Card = onSubmit ? 'form' : 'div';
  const formProps = onSubmit ? { onSubmit, noValidate: true } : {};
  return (
    <div className="auth-shell">
      <div className="auth-shell__bg" aria-hidden="true">
        <span className="auth-shell__orb auth-shell__orb--one" />
        <span className="auth-shell__orb auth-shell__orb--two" />
      </div>

      <aside className="auth-shell__brand">
        <div className="auth-shell__watermark" aria-hidden="true">
          100
        </div>
        <div className="auth-shell__brand-inner">
          <p className="auth-shell__kicker">{kicker}</p>
          <p className="auth-shell__manifesto">
            <span>{t('manifesto1')}</span>
            <span className="auth-shell__manifesto-accent">{t('manifesto2')}</span>
          </p>
          <Dots />
          <p className="auth-shell__signoff">{t('movementSignoff')}</p>
        </div>
      </aside>

      <main className="auth-shell__main">
        <div className="auth-shell__head">
          {kicker ? <p className="auth-shell__kicker auth-shell__kicker--main">{kicker}</p> : null}
          <h1 className="auth-shell__title">{title}</h1>
          {subtitle ? <p className="auth-shell__subtitle">{subtitle}</p> : null}
        </div>
        <Card className="auth-card" {...formProps}>
          {children}
        </Card>
      </main>
    </div>
  );
}