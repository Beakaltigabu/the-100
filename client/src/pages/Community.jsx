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
import ComposerCard from '../components/ComposerCard';
import MembersRoster from '../components/MembersRoster';
import SpotlightCard from '../components/SpotlightCard';
import Leaderboard from '../components/Leaderboard';
import StreakStrip from '../components/StreakStrip';
import SocialProofBand from '../components/SocialProofBand';
import CommunityChallenge from '../components/CommunityChallenge';
import WeeklyRecap from '../components/WeeklyRecap';
import EventCard from '../components/EventCard';
import Celebration from '../components/Celebration';
import TelegramBridge from '../components/TelegramBridge';
import { activityLabelKey } from '../lib/activity';
import { openSafeUrl } from '../lib/url';
import './Community.css';

const FILTERS = ['all', 'check_in', 'milestone', 'finish', 'join', 'announcement'];

function fmt(n) {
  return Math.round(n * 100) / 100;
}

// Compact single-line personal summary — links to the full My 100 dashboard.
function Your100Summary({ progress }) {
  const { t } = useLanguage();
  if (!progress || !progress.enrollment) {
    return (
      <Link to="/onboarding" className="cl-your100-sum">
        <span className="cl-your100-sum__text">{t('chooseYourChallenge')}</span>
        <span className="cl-your100-sum__cta">→</span>
      </Link>
    );
  }
  const enr = progress.enrollment;
  const unit = enr.goalUnit === 'km' ? t('unitKm') : t('unitSessions');
  const total = Number(progress.totalValue) || 0;
  const pct = Number(progress.percent) || 0;
  return (
    <Link to="/dashboard" className="cl-your100-sum" aria-label={t('your100')}>
      <span className="cl-your100-sum__text">
        {t(activityLabelKey(enr.activityType))} · {fmt(total)}/{enr.goalValue} {unit} · {pct}%
      </span>
      <span className="cl-your100-sum__cta">→</span>
    </Link>
  );
}

// One small contextual action — not a blank "write a post" prompt.
function TodayInvitation({ onCheckIn }) {
  const { t } = useLanguage();
  return (
    <section className="cl-invite">
      <p className="cl-invite__label">{t('todayInvitation')}</p>
      <p className="cl-invite__title">{t('invitationHeading')}</p>
      <p className="cl-invite__body">{t('invitationBody')}</p>
      <button className="btn btn--primary cl-invite__cta" onClick={onCheckIn}>
        {t('checkIn')}
      </button>
    </section>
  );
}

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
  const [spotlight, setSpotlight] = useState(null);
  const [progress, setProgress] = useState(null);
  const [telegram, setTelegram] = useState({ configured: true });
  const [posting, setPosting] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [celebrate, setCelebrate] = useState(null);
  const composerRef = useRef(null);

  // Fire a celebration when the feed surfaces a NEW milestone/finish of mine.
  useEffect(() => {
    const item = items.find((i) => (i.type === 'milestone' || i.type === 'finish') && i.isMine);
    if (!item) return;
    let seen = [];
    try {
      seen = JSON.parse(localStorage.getItem('the100_celebrated') || '[]');
    } catch {
      seen = [];
    }
    if (seen.includes(item.id)) return;
    seen.push(item.id);
    try {
      localStorage.setItem('the100_celebrated', JSON.stringify(seen));
    } catch {
      /* ignore */
    }
    setCelebrate({ id: item.id, type: item.type });
  }, [items]);

  const loadFeed = useCallback(async ({ cursor, type } = {}) => {
    const qs = new URLSearchParams();
    qs.set('limit', '10');
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
      api.get('/api/community/feed?limit=10'),
      api.get('/api/community/stats').then((d) => setStats(d.stats)).catch(() => {}),
      api.get('/api/community/people?activeWeek=1&limit=200').then((d) => setPeople(d.people || [])).catch(() => {}),
      api.get('/api/community/spotlight').then((d) => setSpotlight(d.spotlight || null)).catch(() => {}),
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

  // Refetch on window focus only when data is stale.
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

  const openComposer = () => {
    if (composerRef.current) composerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setComposerOpen(true);
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

  const react = async (item, reaction) => {
    try {
      const res = await api.post(`/api/community/items/${item.id}/cheer`, { reaction });
      setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, engagement: res } : it)));
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const save = async (item) => {
    try {
      const res = await api.post(`/api/community/items/${item.id}/bookmark`);
      setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, savedByMe: res.saved } : it)));
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const crosspost = async (item) => {
    if (!item.postId) return;
    try {
      await api.post(`/api/community/posts/${item.postId}/crosspost-telegram`);
      showToast(t('communityCrossPosted'), 'success');
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
  const enr = progress && progress.enrollment;
  const day = enr ? enr.day : null;
  const daysLeft = enr ? Math.max(0, (enr.totalDays || 100) - enr.day) : null;

  const recentJoins = items.filter((i) => i.type === 'join').slice(0, 6);

  return (
    <div className="community community-page">
      <div className="community-layout">
        {/* Header */}
        <header className="cl-hero">
          <div className="cl-hero__art" aria-hidden="true">
            <span className="cl-hero__slash" />
            <span className="cl-hero__hundred">100</span>
          </div>
          <p className="cl-hero__kicker">{t('communityKicker')}</p>
          <h1 className="cl-hero__title">
            <span>WE MOVE</span>
            <span className="cl-hero__title--accent">TOGETHER.</span>
          </h1>
          <p className="cl-hero__support">{t('communitySub')}</p>
          {day != null ? (
            <div className="cl-hero__day">
              <span className="cl-hero__day-item">{t('dayLabel', { day })} / {enr.totalDays}</span>
              <span className="cl-hero__day-sep" />
              <span className="cl-hero__day-item">{t('daysLeft', { n: daysLeft })}</span>
            </div>
          ) : null}
        </header>

        {/* Pulse */}
        <div className="cl-pulse">
          <div className="cl-pulse__item">
            <span className="cl-pulse__num">{stats ? stats.members : '—'}</span>
            <span className="cl-pulse__label">{t('membersPulse')}</span>
          </div>
          <div className="cl-pulse__item">
            <span className="cl-pulse__num">{stats ? `${fmt(stats.distanceMoved)} ${t('unitKm')}` : '—'}</span>
            <span className="cl-pulse__label">{t('movedTogether')}</span>
          </div>
          <div className="cl-pulse__item">
            <span className="cl-pulse__num">{stats ? stats.activeWeek : '—'}</span>
            <span className="cl-pulse__label">{t('movingThisWeek')}</span>
          </div>
        </div>

        {/* Main 3-column hub */}
        <div className="cl-main">
          <aside className="cl-left">
            <ErrorBoundary>
              <Your100Summary progress={progress} />
            </ErrorBoundary>
            <StreakStrip progress={progress} />
            <ErrorBoundary>
              <Leaderboard onMemberClick={setSelectedMember} />
            </ErrorBoundary>
            <WeeklyRecap />
          </aside>

          <main className="cl-center">
            <TodayInvitation onCheckIn={openComposer} />

            <div className="cl-feed-head">
              <h2 className="cl-feed-title">{t('todayInThe100')}</h2>
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

            <div ref={composerRef}>
              <ComposerCard onSubmit={submitCheckIn} busy={posting} open={composerOpen} onOpenChange={setComposerOpen} />
            </div>

            <SocialProofBand />

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
                      onReact={react}
                      onSave={save}
                      onCrossPost={crosspost}
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
                  {loadingMore ? t('loading') : t('showMore')}
                </Button>
              </div>
            ) : null}
          </main>

          <aside className="cl-right">
            <ErrorBoundary>
              <Leaderboard onMemberClick={setSelectedMember} />
            </ErrorBoundary>
            <ErrorBoundary>
              <MembersRoster people={people} onMemberClick={setSelectedMember} />
            </ErrorBoundary>
            <ErrorBoundary>
              <SpotlightCard spotlight={spotlight} onMemberClick={setSelectedMember} />
            </ErrorBoundary>
          </aside>
        </div>

        {/* Supporting sections */}
        {recentJoins.length > 0 ? (
          <section className="cl-new">
            <div className="cl-new__head">
              <h2 className="cl-new__title">{t('newThisWeek')}</h2>
            </div>
            <div className="cl-new__list">
              {recentJoins.map((j) => (
                <span className="cl-new__item" key={j.id}>
                  <strong>{j.actor.name}</strong> {t('joinedThe100')}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        <section className="cl-happen">
          <h2 className="cl-happen__title">{t('whatsHappening')}</h2>
          <div className="cl-happen__grid">
            <ErrorBoundary><CommunityChallenge /></ErrorBoundary>
            <ErrorBoundary><EventCard /></ErrorBoundary>
          </div>
        </section>

        <section className="cl-bridge">
          <TelegramBridge
            telegram={telegram}
            onJoinBot={joinTelegram}
            onJoinGroup={() => telegram.groupLink && openSafeUrl(telegram.groupLink)}
          />
        </section>
      </div>

      <MemberProfileModal memberId={selectedMember} onClose={() => setSelectedMember(null)} />
      <Celebration trigger={celebrate} />
    </div>
  );
}