import './GoalCard.css';
import { useLanguage } from '../context/LanguageContext';

const LEVEL_KEY = {
  comfortable: 'comfortable',
  challenging: 'challenging',
  serious: 'serious',
  extreme: 'extreme'
};

export default function GoalCard({ value, level, unit, selected, recommended, pace, vsBaseline, onSelect }) {
  const { t } = useLanguage();
  return (
    <button
      className={`goal-card ${selected ? 'is-selected' : ''} ${recommended ? 'is-recommended' : ''}`.trim()}
      onClick={onSelect}
      type="button"
    >
      {recommended ? <div className="goal-card__badge">{t('recommended')}</div> : null}
      <div className="goal-card__km">{value}</div>
      <div className="goal-card__unit">{t(unit)}</div>
      <div className="goal-card__level">{t(LEVEL_KEY[level] || level)}</div>
      {pace ? <div className="goal-card__pace">{t('pacePerWeek', { pace })}</div> : null}
      {vsBaseline && vsBaseline > 0 ? (
        <div className="goal-card__pace">{t('vsBaselinePace', { x: vsBaseline })}</div>
      ) : null}
      {selected ? <div className="goal-card__check">✓</div> : null}
    </button>
  );
}