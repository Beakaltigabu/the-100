import { useLanguage } from '../context/LanguageContext';
import { activityLabelKey } from '../lib/activity';
import { todayISO } from '../lib/time';

function initials(name) {
  const parts = (name || '?').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

// Social-style "moving now" rail: horizontal story-row on mobile, vertical
// list on larger screens. Each member has a progress ring + a live dot when
// they logged today. Tapping opens their profile sheet.
export default function PeopleMovingNow({ people, onMemberClick }) {
  const { t } = useLanguage();
  const today = todayISO();
  if (!people || !people.length) return null;

  const isLive = (p) => p.lastActivity === today;

  return (
    <section className="people" aria-label={t('peopleMovingNow')}>
      <p className="rail-kicker">{t('peopleMovingNow')}</p>
      <div className="people__list">
        {people.map((p) => (
          <button className="people__row" key={p.id} type="button" onClick={() => onMemberClick && onMemberClick(p.id)}>
            <span
              className="people__ring"
              style={{ '--pct': `${Math.min(100, p.percent || 0)}%` }}
            >
              <span className="people__avatar-wrap">
                {p.avatarUrl ? (
                  <img className="people__avatar" src={p.avatarUrl} alt={p.name} loading="lazy" />
                ) : (
                  <span className="people__avatar" aria-hidden="true">
                    {initials(p.name)}
                  </span>
                )}
              </span>
              {isLive(p) ? <span className="people__live" title={t('activeNow')} /> : null}
            </span>
            <span className="people__meta">
              <span className="people__name">{p.name}</span>
              <span className="people__sub">
                {isLive(p) ? t('activeNow') : t(activityLabelKey(p.activityType))} · {p.percent}%
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}