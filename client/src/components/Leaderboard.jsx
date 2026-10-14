import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import './Leaderboard.css';

const PERIODS = ['week', 'all'];
const UNITS = ['km', 'sessions'];
const PAGE_SIZE = 10;

// Weekly/all-time rankings, segmented by unit (km vs sessions) so a resistance
// member's sessions are never ranked against kilometers. Keeps a skeleton
// mounted during load/error to avoid layout jumps ("glitchiness").
export default function Leaderboard({ onMemberClick }) {
  const { t } = useLanguage();
  const [period, setPeriod] = useState('week');
  const [unit, setUnit] = useState('km');
  const [data, setData] = useState(null);
  const [allEntries, setAllEntries] = useState([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback((append = false) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setAllEntries([]);
      setOffset(0);
    }
    setError('');
    api
      .get(`/api/community/leaderboard?period=${period}&unit=${unit}&offset=${append ? offset : 0}&limit=${PAGE_SIZE}`)
      .then((res) => {
        setData(res);
        if (append) {
          setAllEntries((prev) => [...prev, ...(res.entries || [])]);
          setOffset((prev) => prev + PAGE_SIZE);
        } else {
          setAllEntries(res.entries || []);
          setOffset(PAGE_SIZE);
        }
        setHasMore(res.totalCount > (append ? offset + (res.entries || []).length : (res.entries || []).length));
      })
      .catch((err) => setError(err.message || t('lbFailed')))
      .finally(() => {
        setLoading(false);
        setLoadingMore(false);
      });
  }, [period, unit, offset, t]);

  useEffect(() => {
    load(false);
  }, [load]);

  const handleLoadMore = () => load(true);

  const entries = allEntries;

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
          <button type="button" className="lb__retry" onClick={() => load(false)}>
            {t('retry')}
          </button>
        </div>
      ) : entries.length === 0 ? (
        <p className="lb__empty">{t('leaderboardEmpty')}</p>
      ) : (
        <>
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
          {hasMore && (
            <button
              type="button"
              className="lb__load-more"
              onClick={handleLoadMore}
              disabled={loadingMore}
            >
              {loadingMore ? (
                <>
                  <span className="lb__spinner" />
                  {t('loading')}
                </>
              ) : (
                t('viewMore')
              )}
            </button>
          )}
        </>
      )}

      {data && data.viewer && data.viewer.rank ? (
        <p className="lb__you">
          {t(period === 'week' ? 'leaderboardYourRankWeek' : 'leaderboardYourRankAll', { rank: data.viewer.rank })}
        </p>
      ) : null}
    </section>
  );
}