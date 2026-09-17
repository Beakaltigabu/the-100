import './FeedPost.css';
import { useLanguage } from '../context/LanguageContext';
import { timeAgo } from '../lib/time';

function initials(name) {
  const parts = (name || '?').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

export default function FeedPost({ item, onShare, onCheer, onDelete }) {
  const { t } = useLanguage();

  const content = () => {
    switch (item.kind) {
      case 'milestone':
        return t('hitMilestone', { threshold: item.threshold, unit: item.unit });
      case 'finish':
        return t('finishedTheir100');
      case 'join':
        return t('joinedThe100');
      case 'streak':
        return t('streakPost', { days: item.days });
      default:
        return item.body;
    }
  };

  const isPost = item.kind === 'post';

  return (
    <article className={`feed-post ${item.isPinned ? 'feed-post--pinned' : ''}`.trim()}>
      <div className="feed-post__avatar">{initials(item.name)}</div>
      <div className="feed-post__body">
        <div className="feed-post__head">
          <span className="feed-post__name">{item.name}</span>
          {item.isPinned ? <span className="feed-post__pin">{t('pinned')}</span> : null}
          <span className="feed-post__time">{timeAgo(item.ts, t)}</span>
        </div>
        <p className="feed-post__content">{content()}</p>
        {isPost || item.kind === 'milestone' ? (
          <div className="feed-post__actions">
            {isPost ? (
              <button
                className={`feed-post__action ${item.cheered ? 'is-cheered' : ''}`.trim()}
                onClick={() => onCheer(item)}
              >
                <span className="feed-post__cheer-mark">{item.cheered ? '✦' : '✧'}</span>
                {t('cheer')} · {item.cheers || 0}
              </button>
            ) : null}
            {item.kind === 'milestone' ? (
              <button className="feed-post__action" onClick={() => onShare(item)}>
                {t('share')}
              </button>
            ) : null}
            {isPost && item.isMine ? (
              <button className="feed-post__action feed-post__action--danger" onClick={() => onDelete(item)}>
                {t('delete')}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}