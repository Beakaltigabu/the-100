import './States.css';
import { useLanguage } from '../context/LanguageContext';

// On-brand loading state: THE 100 wordmark over a 100-segment progress ring.
export function LoadingState({ label }) {
  const { t } = useLanguage();
  return (
    <div className="state state--branded" role="status" aria-live="polite">
      <span className="state__ghost" aria-hidden="true">
        100
      </span>
      <p className="state__brand">
        THE <span className="state__slash">/</span> 100
      </p>
      <div className="state__ring" aria-hidden="true" />
      <p className="state__label">{label || t('loading')}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  const { t } = useLanguage();
  return (
    <div className="state">
      <p className="state__label">{message || t('error')}</p>
      {onRetry ? (
        <button className="state__retry" onClick={onRetry}>
          {t('retry')}
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({ title, body }) {
  return (
    <div className="state">
      <p className="state__title">{title}</p>
      {body ? <p className="state__label">{body}</p> : null}
    </div>
  );
}