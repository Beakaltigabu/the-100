import { useLanguage } from '../context/LanguageContext';
import ProgressBar from '../components/ProgressBar';
import StatusBadge from '../components/StatusBadge';
import { activityLabelKey } from '../lib/activity';
import { timeAgo } from '../lib/time';
import './MemberProfile.css';

function initials(name) {
  const parts = (name || '?').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

// Social-style profile body — rendered inside the bottom-sheet modal.
export function MemberProfileContent({ data }) {
  const { t } = useLanguage();
  const { member, challenge, progress, completed, checkIns } = data;
  const unit = challenge ? (challenge.goalUnit === 'km' ? t('unitKm') : t('unitSessions')) : '';

  return (
    <>
      <div className="member-profile__head">
        {member.avatarUrl ? (
          <img className="member-profile__avatar" src={member.avatarUrl} alt={member.name} />
        ) : (
          <span className="member-profile__avatar" aria-hidden="true">
            {initials(member.name)}
          </span>
        )}
        <div className="member-profile__head-main">
          <h1 className="member-profile__name">{member.name}</h1>
          {member.socialHandle ? (
            <p className="member-profile__handle">Strava · @{member.socialHandle}</p>
          ) : null}
          {member.activityType ? (
            <p className="member-profile__sub">{t(activityLabelKey(member.activityType))}</p>
          ) : null}
        </div>
      </div>

      {challenge ? (
        <section className="member-profile__card">
          <div className="row--between row">
            <span className="member-profile__kicker">{t('your100')}</span>
            {progress ? <StatusBadge status={progress.status} /> : null}
          </div>
          <p className="member-profile__goal">
            {challenge.goalValue} <span className="member-profile__unit">{unit}</span>
          </p>
          <ProgressBar value={progress ? progress.totalValue : 0} max={challenge.goalValue || 1} />
          <div className="row--between row">
            <span className="member-profile__frac">
              {progress ? progress.totalValue : 0} / {challenge.goalValue} {unit}
            </span>
            <span className="member-profile__day">
              {t('dayLabel', { day: progress ? progress.day : 1 })} / {challenge.totalDays ?? 100}
            </span>
          </div>
        </section>
      ) : (
        <section className="member-profile__card">
          <p className="member-profile__kicker">{t('your100')}</p>
          <p className="member-profile__empty">{t('noActiveChallenge')}</p>
        </section>
      )}

      {completed && completed.length ? (
        <section>
          <p className="section-kicker">{t('completedChallenges')}</p>
          <div className="member-profile__completed">
            {completed.map((c, i) => (
              <span key={i} className="member-profile__chip">
                {c.goal} {c.unit}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <p className="section-kicker">{t('recentCheckIns')}</p>
        {checkIns && checkIns.length ? (
          <div className="member-profile__checkins">
            {checkIns.map((c) => (
              <div className="member-profile__checkin" key={c.id}>
                <p className="member-profile__checkin-body">
                  {c.body || t('noTextCheckIn')}
                  {c.distance != null ? (
                    <span className="member-profile__checkin-distance">
                      {' '}· <strong>{c.distance}</strong> {t('unitKm')}
                    </span>
                  ) : null}
                </p>
                <span className="member-profile__checkin-time">{timeAgo(c.ts, t)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="member-profile__empty">{t('noCheckInsYet')}</p>
        )}
      </section>
    </>
  );
}