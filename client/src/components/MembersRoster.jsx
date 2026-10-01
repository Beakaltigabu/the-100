import { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { activityLabelKey } from '../lib/activity';
import { todayISO } from '../lib/time';
import './MembersRoster.css';

const DEFAULT_VISIBLE = 10;

function initials(name) {
  const parts = (name || '?').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

// "Members" roster — everyone active this week. Defaults to 10 rows with a
// SHOW MORE / SHOW LESS toggle. Never ranked by distance.
export default function MembersRoster({ people, onMemberClick }) {
  const { t } = useLanguage();
  const [showAll, setShowAll] = useState(false);
  if (!people || !people.length) return null;

  const today = todayISO();
  const visible = showAll ? people : people.slice(0, DEFAULT_VISIBLE);
  const showToggle = people.length > DEFAULT_VISIBLE;

  return (
    <section className="mr" aria-label={t('membersActiveWeek')}>
      <p className="mr__kicker">
        {t('membersActiveWeek')} <span className="mr__count">{people.length}</span>
      </p>
      <div className="mr__list">
        {visible.map((p) => {
          const live = p.lastActivity === today;
          return (
            <button className="mr__row" key={p.id} type="button" onClick={() => onMemberClick && onMemberClick(p.id)}>
              <span className="mr__avatar">
                {p.avatarUrl ? (
                  <img className="mr__img" src={p.avatarUrl} alt={p.name} loading="lazy" />
                ) : (
                  <span className="mr__img" aria-hidden="true">
                    {initials(p.name)}
                  </span>
                )}
                {live ? <span className="mr__live" title={t('activeNow')} /> : null}
              </span>
              <span className="mr__meta">
                <span className="mr__name">{p.name}</span>
                <span className="mr__sub">
                  {t(activityLabelKey(p.activityType))} · {p.percent}%
                </span>
                <span className="mr__bar">
                  <span className="mr__fill" style={{ width: `${Math.min(100, p.percent || 0)}%` }} />
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {showToggle ? (
        <button className="mr__toggle" type="button" onClick={() => setShowAll((v) => !v)}>
          {showAll ? t('showLess') : t('showMore')}
        </button>
      ) : null}
    </section>
  );
}