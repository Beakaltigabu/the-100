import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import './Leaderboard.css';

// Weekly/all-time rankings — goal-gradient + social comparison.
export default function Leaderboard({ onMemberClick }) {
  const { t } = useLanguage();
  const [period, setPeriod] = useState('week');
  const [data, setData] = useState(null);

  const load = useCallback(() => {
    api
      .get(`/api/community/leaderboard?period=${period}`)
      .then(setData)
      .catch(() => {});
  }, [period]);

  useEffect(load, [load]);

  const entries = (data && data.entries) || [];
  if (!entries.length) return null;

  return (
    <section className="lb">
      <div className="lb__head">
        <p className="lb__label">{t('leaderboardTitle')}</p>
        <div className="lb__tabs">
          {['week', 'all'].map((p) => (
            <button
              key={p}
              className={`lb__tab ${period === p ? 'is-active' : ''}`}
              onClick={() => setPeriod(p)}
            >
              {t(p === 'week' ? 'leaderboardWeek' : 'leaderboardAll')}
            </button>
          ))}
        </div>
      </div>
      <ol className="lb__list">
        {entries.map((e, i) => (
          <li className={`lb__row ${e.isMe ? 'is-me' : ''}`} key={e.id}>
            <span className={`lb__rank ${i < 3 ? 'is-top' : ''}`}>{i + 1}</span>
            <button type="button" className="lb__person" onClick={() => onMemberClick && onMemberClick(e.id)}>
              {e.name}
              {e.isMe ? <span className="lb__you-tag">{t('youTag')}</span> : null}
            </button>
            <span className="lb__total">
              {e.total} {e.unit}
            </span>
          </li>
        ))}
      </ol>
      {data.viewer && data.viewer.rank ? (
        <p className="lb__you">
          {t(period === 'week' ? 'leaderboardYourRankWeek' : 'leaderboardYourRankAll', { rank: data.viewer.rank })}
        </p>
      ) : null}
    </section>
  );
}