import './Milestone.css';
import { useLanguage } from '../context/LanguageContext';

export default function Milestone({ threshold, reached, isNext, unit = 'km', onShare }) {
  const { t } = useLanguage();
  return (
    <div className={`milestone ${reached ? 'is-reached' : ''} ${isNext ? 'is-next' : ''}`.trim()}>
      <div className="milestone__mark">{reached ? '✓' : '○'}</div>
      <div className="milestone__label">
        {reached ? t('logged') : isNext ? t('nextMilestone') : ''}
      </div>
      <div className="milestone__km">{threshold} {t(unit)}</div>
      {isNext && onShare ? (
        <button className="milestone__share" onClick={onShare}>
          {t('shareMilestone')}
        </button>
      ) : null}
    </div>
  );
}