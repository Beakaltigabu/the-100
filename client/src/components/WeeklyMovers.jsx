import './WeeklyMovers.css';
import { useLanguage } from '../context/LanguageContext';

function Avatar({ name, url }) {
  const parts = (name || '?').trim().split(/\s+/).filter(Boolean);
  const initials = ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
  if (url) return <img className="wm__avatar" src={url} alt={name} loading="lazy" />;
  return (
    <span className="wm__avatar" aria-hidden="true">
      {initials}
    </span>
  );
}

// Top movers this week by logged quantity.
export default function WeeklyMovers({ movers, onMemberClick }) {
  const { t } = useLanguage();
  if (!movers.length) return null;

  return (
    <section className="wm">
      <h3 className="wm__title">{t('communityMovers')}</h3>
      <ol className="wm__list">
        {movers.map((m, i) => (
          <li className="wm__row" key={m.id}>
            <span className={`wm__rank ${i < 3 ? 'is-top' : ''}`}>{i + 1}</span>
            <button type="button" className="wm__person" onClick={() => onMemberClick && onMemberClick(m.id)}>
              <Avatar name={m.name} url={m.avatarUrl} />
              <span className="wm__name">{m.name}</span>
            </button>
            <span className="wm__total">
              {m.total} {m.unit}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}