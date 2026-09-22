import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import { usePageMeta } from '../hooks/usePageMeta';
import { useToast } from '../components/Toast';
import Button from '../components/Button';
import FeedItem from '../components/FeedItem';
import MemberProfileModal from '../components/MemberProfileModal';
import ErrorBoundary from '../components/ErrorBoundary';
import CommunityPulse from '../components/CommunityPulse';
import ComposerCard from '../components/ComposerCard';
import PeopleMovingNow from '../components/PeopleMovingNow';
import TelegramBridge from '../components/TelegramBridge';
import { activityLabelKey } from '../lib/activity';
import { openSafeUrl } from '../lib/url';
import './Community.css';

const FILTERS = ['all', 'check_in', 'milestone', 'finish', 'join', 'announcement'];

export default function Community() {
  usePageMeta({ title: 'Community', path: '/community', index: false });
  const { t } = useLanguage();
  const { showToast } = useToast();
  const [items, setItems] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [filter, setFilter] = useState('all');
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState('');
  const [stats, setStats] = useState(null);
  const [people, setPeople] = useState([]);
  const [progress, setProgress] = useState(null);
  const [telegram, setTelegram] = useState({ configured: true });
  const [posting, setPosting] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);

  const loadFeed = useCallback(async ({ cursor, type } = {}) => {
    const qs = new URLSearchParams();
    if (cursor) qs.set('cursor', cursor);
    if (type && type !== 'all') qs.set('type', type);
    const f = await api.get(`/api/community/feed?${qs.toString()}`);
    setItems((prev) => (cursor ? [...prev, ...f.items] : f.items));
    setNextCursor(f.nextCursor || null);
  }, []);

  const load = useCallback(() => {
    setFeedLoading(true);
    setFeedError('');
    Promise.all([
      api.get('/api/community/feed'),
      api.get('/api/community/stats').then((d) => setStats(d.stats)).catch(() => {}),
      api.get('/api/community/people').then((d) => setPeople(d.people || [])).catch(() => {}),
      api.get('/api/progress').then((d) => setProgress(d)).catch(() => {}),
      api.get('/api/integrations/telegram/status').catch(() => null)
    ])
      .then(([f, , , , tg]) => {
        setItems(f.items || []);
        setNextCursor(f.nextCursor || null);
        if (tg) setTelegram(tg);
      })
      .catch((err) => setFeedError(err.message))
      .finally(() => setFeedLoading(false));
  }, []);

  // Refetch on window focus only when data is stale — the full 5-request fan-out
  // on every alt-tab is wasted work (and /people is the priciest endpoint).
  const lastLoadedAt = useRef(0);
  useEffect(() => {
    load();
    lastLoadedAt.current = Date.now();
    const onFocus = () => {
      if (Date.now() - lastLoadedAt.current > 60 * 1000) {
        lastLoadedAt.current = Date.now();
        load();
      }
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  const onFilterChange = async (e) => {
    const value = e.target.value;
    setFilter(value);
    setItems([]);
    setNextCursor(null);
    setFeedLoading(true);
    setFeedError('');
    try {
      await loadFeed({ type: value });
    } catch (err) {
      setFeedError(err.message);
    } finally {
      setFeedLoading(false);
    }
  };

  const joinTelegram = () => {
    api
      .get('/api/integrations/telegram/connect')
      .then((d) => openSafeUrl(d.deepLink))
      .catch((err) => showToast(err.status === 503 ? t('telegramNotConfigured') : err.message, 'error'));
  };

  const submitCheckIn = async ({ body, distance, activityType }) => {
    setPosting(true);
    try {
      await api.post('/api/community/posts', { body, distance, activity_type: activityType });
      showToast(t('checkInCreated'), 'success');
      await loadFeed({ type: filter });
      return true;
    } catch (err) {
      showToast(err.message, 'error');
      return false;
    } finally {
      setPosting(false);
    }
  };

  const cheer = async (item) => {
    try {
      const res = await api.post(`/api/community/items/${item.id}/cheer`);
      setItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, engagement: { cheers: res.cheers, cheeredByMe: res.cheered } } : it))
      );
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const removePost = async (item) => {
    if (!item.postId) return;
    if (!window.confirm(t('deleteCheckInConfirm'))) return;
    try {
      await api.del(`/api/community/posts/${item.postId}`);
      showToast(t('deleted'), 'success');
      await loadFeed({ type: filter });
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const reportPost = async (item) => {
    if (!item.postId) return;
    if (!window.confirm(t('reportConfirm'))) return;
    try {
      await api.post(`/api/community/posts/${item.postId}/report`, {});
      showToast(t('reported'), 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const shareEvent = async (item) => {
    const d = item.data || {};
    const text =
      item.type === 'finish'
        ? t('shareFinishText', { goal: d.goal, unit: d.unit })
        : t('shareMilestoneText', { threshold: d.threshold, unit: d.unit });
    if (navigator.share) {
      try {
        await navigator.share({ title: 'THE 100', text });
      } catch {
        /* cancelled */
      }
    } else if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(text);
        showToast(t('share'), 'success');
      } catch {
        /* ignore */
      }
    }
  };

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      await loadFeed({ cursor: nextCursor, type: filter });
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoadingMore(false);
    }
  };

  const hasEnrollment = !!(progress && progress.enrollment);

  return (
    <div className="community community-page">
      <div className="community-layout">
        <header className="cl-hero">
          <div className="cl-hero__art" aria-hidden="true">
            <span className="cl-hero__slash" />
            <span className="cl-hero__hundred">100</span>
          </div>
          <p className="cl-hero__kicker">
            THE 100 <span className="cl-hero__slash-inline">/</span> COMMUNITY
          </p>
          <h1 className="cl-hero__title">
            <span>WE MOVE</span>
            <span className="cl-hero__title--accent">TOGETHER.</span>
          </h1>
          <p className="cl-hero__support">{t('communitySub')}</p>
        </header>

        <div className="cl-pulse">
          {stats ? <CommunityPulse stats={stats} /> : <div className="skeleton skeleton--pulse" />}
        </div>

        <div className="cl-feed">
          {progress ? (
            <Link
              to="/dashboard"
              className="your100-mini"
              aria-label={t('your100')}
            >
              <span className="your100-mini__kicker">{t('your100')}</span>
              {progress.enrollment ? (
                <span className="your100-mini__detail">
                  {t(activityLabelKey(progress.enrollment.activityType))} · {progress.enrollment.goalValue}{' '}
                  {progress.enrollment.goalUnit === 'km' ? t('unitKm') : t('unitSessions')} · {progress.percent}%
                </span>
              ) : (
                <span className="your100-mini__detail">{t('chooseYourChallenge')}</span>
              )}
              <span className="your100-mini__cta">→</span>
            </Link>
          ) : null}

          <div className="feed-toolbar">
            <h2 className="feed-toolbar__title">{t('todayInThe100')}</h2>
            <label className="feed-toolbar__filter">
              <span className="feed-toolbar__filter-label">{t('filter')}</span>
              <select className="feed-toolbar__select" value={filter} onChange={onFilterChange} aria-label={t('filter')}>
                {FILTERS.map((f) => (
                  <option key={f} value={f}>
                    {t(`filter_${f}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <ComposerCard onSubmit={submitCheckIn} busy={posting} />

          {feedError ? (
            <div className="feed-error">
              <p>{t('feedFailed')}</p>
              <Button variant="secondary" size="sm" onClick={load}>
                {t('retry')}
              </Button>
            </div>
          ) : feedLoading ? (
            <div className="feed-skeleton">
              {[1, 2, 3].map((i) => (
                <div className="skeleton skeleton--item" key={i} />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="feed-empty">
              {hasEnrollment ? (
                <>
                  <p className="feed-empty__title">{t('movementStartsHere')}</p>
                  <p className="feed-empty__body">{t('nobodyPostedYet')}</p>
                  <p className="feed-empty__body">{t('startFirstMoment')}</p>
                </>
              ) : (
                <>
                  <p className="feed-empty__title">{t('youAreHere')}</p>
                  <p className="feed-empty__body">{t('nowMakeItReal')}</p>
                  <p className="feed-empty__body">{t('chooseYourChallengeThenFirstStep')}</p>
                  <Link to="/onboarding">
                    <Button variant="primary">{t('startYour100')}</Button>
                  </Link>
                </>
              )}
            </div>
          ) : (
            <div className="feed">
              {items.map((item, i) => (
                <ErrorBoundary key={item.id || i}>
                  <FeedItem
                    item={item}
                    onCheer={cheer}
                    onShare={shareEvent}
                    onDelete={removePost}
                    onReport={reportPost}
                    onMemberClick={setSelectedMember}
                  />
                </ErrorBoundary>
              ))}
            </div>
          )}

          {nextCursor ? (
            <div className="feed-more">
              <Button variant="secondary" full onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? t('loading') : t('loadMore')}
              </Button>
            </div>
          ) : null}
        </div>

        <div className="cl-rail-r">
          <ErrorBoundary>
            <PeopleMovingNow people={people} onMemberClick={setSelectedMember} />
          </ErrorBoundary>
          <TelegramBridge
            telegram={telegram}
            onJoinBot={joinTelegram}
            onJoinGroup={() => telegram.groupLink && openSafeUrl(telegram.groupLink)}
          />
        </div>
      </div>

      <MemberProfileModal memberId={selectedMember} onClose={() => setSelectedMember(null)} />
    </div>
  );
}