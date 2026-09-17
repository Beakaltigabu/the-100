import './States.css';
import { useLanguage } from '../context/LanguageContext';

export function LoadingState({ label }) {
  const { t } = useLanguage();
  return (
    <div className="state">
      <div className="state__spinner" />
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