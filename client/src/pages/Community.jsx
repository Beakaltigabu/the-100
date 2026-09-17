import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../components/Toast';
import Button from '../components/Button';
import StatusBadge from '../components/StatusBadge';
import FeedPost from '../components/FeedPost';
import { LoadingState, ErrorState, EmptyState } from '../components/States';
import './Community.css';

const TABS = ['all', 'post', 'join', 'milestone', 'finish'];

export default function Community() {
  const { t } = useLanguage();
  const { showToast } = useToast();
  const [events, setEvents] = useState([]);
  const [telegram, setTelegram] = useState({ configured: true });
  const [filter, setFilter] = useState('all');
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([api.get('/api/community/feed'), api.get('/api/integrations/telegram/status').catch(() => null)])
      .then(([f, tg]) => {
        setEvents(f.events || []);
        if (tg) setTelegram(tg);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const joinTelegram = () => {
    api
      .get('/api/integrations/telegram/connect')
      .then((d) => window.open(d.deepLink, '_blank'))
      .catch((err) => showToast(err.status === 503 ? t('telegramNotConfigured') : err.message, 'error'));
  };

  const submitPost = async (e) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setPosting(true);
    try {
      await api.post('/api/community/posts', { body });
      setDraft('');
      load();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setPosting(false);
    }
  };

  const cheer = async (item) => {
    try {
      const res = await api.post(`/api/community/posts/${item.id}/cheer`);
      setEvents((prev) =>
        prev.map((p) => (p.kind === 'post' && p.id === item.id ? { ...p, cheers: res.cheers, cheered: res.cheered } : p))
      );
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const removePost = async (item) => {
    if (!window.confirm(t('deleteConfirm'))) return;
    try {
      await api.del(`/api/community/posts/${item.id}`);
      load();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const shareEvent = async (ev) => {
    const text = t('shareMilestoneText', { threshold: ev.threshold, unit: ev.unit });
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

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const filtered = filter === 'all' ? events : events.filter((e) => e.kind === filter);

  return (
    <div className="community page">
      <div className="community__head">
        <p className="community__kicker">THE 100</p>
        <h1 className="community__title">{t('community')}</h1>
        <p className="community__sub">{t('communitySub')}</p>
      </div>

      <form className="composer" onSubmit={submitPost}>
        <textarea
          className="composer__input"
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('composePlaceholder')}
          maxLength={500}
        />
        <Button type="submit" variant="primary" size="sm" disabled={posting || !draft.trim()}>
          {posting ? t('loading') : t('postBtn')}
        </Button>
      </form>

      <div className="community__tabs">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            className={`community__tab ${filter === tab ? 'is-active' : ''}`.trim()}
            onClick={() => setFilter(tab)}
          >
            {t(tab)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState title={t('feedEmpty')} />
      ) : (
        <div className="feed">
          {filtered.map((ev, i) => (
            <FeedPost key={`${ev.kind}-${ev.id || ev.ts || i}`} item={ev} onShare={shareEvent} onCheer={cheer} onDelete={removePost} />
          ))}
        </div>
      )}

      <div className="community__telegram">
        <div className="row--between row">
          <span className="community__tg-title">{t('telegram')}</span>
          {telegram.configured !== false ? (
            <StatusBadge status={telegram.state === 'active' ? 'connected' : 'not_connected'} />
          ) : null}
        </div>
        <p className="community__tg-note">
          {telegram.configured === false ? t('telegramNotConfigured') : t('joinCommunity')}
        </p>
        <Button
          variant={telegram.state === 'active' ? 'secondary' : 'primary'}
          full
          onClick={joinTelegram}
          disabled={telegram.configured === false}
        >
          {telegram.state === 'active' ? t('openTelegram') : t('joinCommunity')}
        </Button>
        {telegram.groupLink ? (
          <Button variant="secondary" full onClick={() => window.open(telegram.groupLink, '_blank')}>
            {t('joinCommunityGroup')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}