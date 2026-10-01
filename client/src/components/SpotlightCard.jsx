import { useLanguage } from '../context/LanguageContext';
import './SpotlightCard.css';

// Rotating "member of the day" spotlight card.
export default function SpotlightCard({ spotlight, onMemberClick }) {
  const { t } = useLanguage();
  if (!spotlight) return null;
  const parts = (spotlight.name || '?').trim().split(/\s+/).filter(Boolean);
  const initials = ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';

  return (
    <section className="sc">
      <p className="sc__label">{t('spotlightTitle')}</p>
      <button type="button" className="sc__body" onClick={() => onMemberClick && onMemberClick(spotlight.id)}>
        {spotlight.avatarUrl ? (
          <img className="sc__avatar" src={spotlight.avatarUrl} alt={spotlight.name} loading="lazy" />
        ) : (
          <span className="sc__avatar" aria-hidden="true">{initials}</span>
        )}
        <span className="sc__text">
          <span className="sc__name">{spotlight.name}</span>
          <span className="sc__goal">
            {spotlight.goalValue} {spotlight.unit}
          </span>
        </span>
        <span className="sc__cta">→</span>
      </button>
    </section>
  );
}