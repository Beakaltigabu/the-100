import './FeedItem.css';
import { useLanguage } from '../context/LanguageContext';
import { timeAgo } from '../lib/time';
import { activityLabelKey } from '../lib/activity';

function Avatar({ name, url }) {
  const parts = (name || '?').trim().split(/\s+/).filter(Boolean);
  const initials = ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
  if (url) return <img className="fi__avatar" src={url} alt={name} loading="lazy" />;
  return (
    <span className="fi__avatar" aria-hidden="true">
      {initials}
    </span>
  );
}

function MemberName({ actor, onMemberClick }) {
  const cls = 'fi__name fi__member-link';
  if (onMemberClick && actor.id) {
    return (
      <button type="button" className={cls} onClick={() => onMemberClick(actor.id)}>
        {actor.name}
      </button>
    );
  }
  return <span className="fi__name">{actor.name}</span>;
}

function MemberAvatar({ actor, onMemberClick }) {
  const avatar = <Avatar name={actor.name} url={actor.avatarUrl} />;
  if (onMemberClick && actor.id) {
    return (
      <button type="button" className="fi__avatar-btn" onClick={() => onMemberClick(actor.id)}>
        {avatar}
      </button>
    );
  }
  return avatar;
}

export default function FeedItem({ item, onCheer, onShare, onDelete, onReport, onMemberClick }) {
  const { t } = useLanguage();
  const actor = item.actor || {};
  const d = item.data || {};
  const cheers = item.engagement ? item.engagement.cheers : 0;
  const cheered = item.engagement ? item.engagement.cheeredByMe : false;
  const isMine = item.isMine;
  const unit = t('unitKm');

  const cheerBtn = (className = '') => (
    <button
      className={`fi__action ${cheered ? 'is-cheered' : ''} ${className}`.trim()}
      onClick={() => onCheer(item)}
      aria-pressed={cheered}
    >
      <span className="fi__cheer-mark">{cheered ? '✦' : '✧'}</span> {t('cheer')} {cheers > 0 ? `· ${cheers}` : ''}
    </button>
  );

  if (item.type === 'announcement') {
    return (
      <article className="fi fi--announcement">
        <div className="fi__meta">
          <span className="fi__official">{t('hqLabel')}</span>
          {d.pinned ? <span className="fi__pin">{t('pinned')}</span> : null}
          <span className="fi__time">{timeAgo(item.createdAt, t)}</span>
        </div>
        <h3 className="fi__title">{d.title}</h3>
        {d.body ? <p className="fi__body">{d.body}</p> : null}
      </article>
    );
  }

  if (item.type === 'milestone') {
    return (
      <article className="fi fi--milestone">
        <span className="fi__accent" aria-hidden="true" />
        <p className="fi__kicker">{t('percentComplete', { percent: d.percent ?? 0 })}</p>
        <div className="fi__who">
          <MemberAvatar actor={actor} onMemberClick={onMemberClick} />
          <p className="fi__name">
            <MemberName actor={actor} onMemberClick={onMemberClick} /> <span className="fi__verb">{t('reachedLabel')}</span>
            {actor.socialHandle ? <span className="fi__handle">@{actor.socialHandle}</span> : null}
          </p>
        </div>
        <p className="fi__big">
          {d.threshold ?? 0} <span className="fi__unit">{d.unit || ''}</span>
        </p>
        <div className="fi__foot">
          <span className="fi__activity">{actor.activityType ? t(activityLabelKey(actor.activityType)) : ''}</span>
          {cheerBtn()}
          <button className="fi__action" onClick={() => onShare(item)}>
            {t('share')}
          </button>
        </div>
      </article>
    );
  }

  if (item.type === 'finish') {
    return (
      <article className="fi fi--finish">
        <p className="fi__kicker">{t('finishedLabel')}</p>
        <p className="fi__finish-name">{actor.name}</p>
        <p className="fi__finish-line">{t('finishedTheir100')}</p>
        <p className="fi__finish-stats">
          {d.goal ?? 0} {d.unit || ''} · 100 DAYS
        </p>
        <div className="fi__foot">{cheerBtn()}</div>
      </article>
    );
  }

  if (item.type === 'join') {
    return (
      <article className="fi">
        <p className="fi__kicker">{t('welcomeLabel')}</p>
        <div className="fi__who">
          <MemberAvatar actor={actor} onMemberClick={onMemberClick} />
          <p className="fi__name">
            <MemberName actor={actor} onMemberClick={onMemberClick} /> <span className="fi__verb">{t('justStartedThe100')}</span>
          </p>
        </div>
        <p className="fi__big">
          <span className="fi__activity">{actor.activityType ? t(activityLabelKey(actor.activityType)) : ''}</span>
          <span>·</span>
          <span>
            {d.goal ?? 0} {d.unit || ''}
          </span>
        </p>
        <div className="fi__foot">{cheerBtn()}</div>
      </article>
    );
  }

  // check_in
  return (
    <article className="fi">
      <div className="fi__head">
        <MemberAvatar actor={actor} onMemberClick={onMemberClick} />
        <div className="fi__who">
          <MemberName actor={actor} onMemberClick={onMemberClick} />
          {actor.socialHandle ? <span className="fi__handle">@{actor.socialHandle}</span> : null}
          <span className="fi__sub">
            {d.day ? `${t('dayLabel', { day: d.day })} · ` : ''}
            {d.activityType ? t(activityLabelKey(d.activityType)) : t('checkIn')}
          </span>
        </div>
        <span className="fi__time">{timeAgo(item.createdAt, t)}</span>
      </div>
      {d.body ? <p className="fi__quote">{d.body}</p> : null}
      {d.distance != null ? (
        <p className="fi__distance">
          <strong>{d.distance}</strong> <span className="fi__unit">{unit}</span>
        </p>
      ) : null}
      <div className="fi__foot">
        {cheerBtn()}
        {isMine ? (
          <button className="fi__action fi__action--danger" onClick={() => onDelete(item)}>
            {t('delete')}
          </button>
        ) : (
          <button className="fi__action" onClick={() => onReport(item)}>
            {t('report')}
          </button>
        )}
      </div>
    </article>
  );
}