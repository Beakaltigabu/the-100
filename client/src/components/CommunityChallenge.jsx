import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import './CommunityChallenge.css';

// Community-wide shared goal — collective accountability (social identity).
export default function CommunityChallenge() {
  const { t } = useLanguage();
  const [challenges, setChallenges] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .get('/api/community/challenges')
      .then((d) => setChallenges(d.challenges || []))
      .catch(() => {});
  }, []);

  useEffect(load, [load]);

  if (!challenges.length) return null;

  const toggle = async (c) => {
    setBusy(true);
    try {
      await api.post(`/api/community/challenges/${c.id}/join`);
      load();
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="cc">
      <p className="cc__label">{t('communityChallenge')}</p>
      {challenges.map((c) => (
        <div className="cc__card" key={c.id}>
          <p className="cc__title">{c.title}</p>
          {c.description ? <p className="cc__desc">{c.description}</p> : null}
          <div className="cc__meta">
            <span>
              {c.value} / {c.goalValue} {c.goalUnit}
            </span>
            <span>{c.pct}%</span>
          </div>
          <div className="cc__bar">
            <div className="cc__fill" style={{ width: `${c.pct}%` }} />
          </div>
          <div className="cc__foot">
            <span className="cc__who">{c.participants} {t('communityChallengeParticipants')}</span>
            <button className={`btn btn--sm ${c.joined ? 'btn--secondary' : 'btn--primary'}`} onClick={() => toggle(c)} disabled={busy}>
              {c.joined ? t('communityChallengeLeave') : t('communityChallengeJoin')}
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}