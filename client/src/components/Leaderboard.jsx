import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import './Leaderboard.css';

const PERIODS = ['week', 'all'];
const UNITS = ['km', 'sessions'];

// Weekly/all-time rankings, segmented by unit (km vs sessions) so a resistance
// member's sessions are never ranked against kilometers. Keeps a skeleton
// mounted during load/error to avoid layout jumps ("glitchiness").
export default function Leaderboard({ onMemberClick }) {
  const { t } = useLanguage();
  const [period, setPeriod] = useState('week');
  const [unit, setUnit] = useState('km');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api
      .get(`/api/community/leaderboard?period=${period}&unit=${unit}`)
      .then(setData)
      .catch((err) => setError(err.message || t('lbFailed')))
      .finally(() => setLoading(false));
  }, [period, unit, t]);

  useEffect(load, [load]);

  const entries = (data && data.entries) || [];

  return (
    <section className="lb">
      <div className="lb__head">
        <p className="lb__label">{t('leaderboardTitle')}</p>
        <div className="lb__tabs">
          {UNITS.map((u) => (
            <button
              key={u}
              type="button"
              className={`lb__tab ${unit === u ? 'is-active' : ''}`}
              onClick={() => setUnit(u)}
            >
              {t(u === 'km' ? 'unitKm' : 'unitSessions')}
            </button>
          ))}
        </div>
      </div>

      <div className="lb__tabs lb__tabs--period">
        {PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            className={`lb__tab ${period === p ? 'is-active' : ''}`}
            onClick={() => setPeriod(p)}
          >
            {t(p === 'week' ? 'leaderboardWeek' : 'leaderboardAll')}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="lb__state">
          {[1, 2, 3, 4].map((i) => (
            <div className="skeleton skeleton--row" key={i} />
          ))}
        </div>
      ) : error ? (
        <div className="lb__state lb__error">
          <p>{t('lbFailed')}</p>
          <button type="button" className="lb__retry" onClick={load}>
            {t('retry')}
          </button>
        </div>
      ) : entries.length === 0 ? (
        <p className="lb__empty">{t('leaderboardEmpty')}</p>
      ) : (
        <ol className="lb__list">
          {entries.map((e, i) => (
            <li className={`lb__row ${e.isMe ? 'is-me' : ''}`} key={e.id}>
              <span className={`lb__rank ${e.rank <= 3 ? 'is-top' : ''}`}>{e.rank || i + 1}</span>
              <button type="button" className="lb__person" onClick={() => onMemberClick && onMemberClick(e.id)}>
                {e.name}
                {e.isMe ? <span className="lb__you-tag">{t('youTag')}</span> : null}
              </button>
              <span className="lb__total">
                {e.total} {e.unit || unit}
              </span>
            </li>
          ))}
        </ol>
      )}

      {data && data.viewer && data.viewer.rank ? (
        <p className="lb__you">
          {t(period === 'week' ? 'leaderboardYourRankWeek' : 'leaderboardYourRankAll', { rank: data.viewer.rank })}
        </p>
      ) : null}
    </section>
  );
}