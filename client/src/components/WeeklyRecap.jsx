import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import './WeeklyRecap.css';

// Personal week summary + community digest highlights.
export default function WeeklyRecap() {
  const { t } = useLanguage();
  const [recap, setRecap] = useState(null);
  const [digest, setDigest] = useState(null);

  const load = useCallback(() => {
    api
      .get('/api/community/recap')
      .then((d) => setRecap(d.recap))
      .catch(() => {});
    api
      .get('/api/community/digest')
      .then((d) => setDigest(d.digest))
      .catch(() => {});
  }, []);

  useEffect(load, [load]);

  if (!recap && !digest) return null;

  return (
    <section className="wr">
      <p className="wr__label">{t('weeklyRecap')}</p>
      {recap ? (
        <div className="wr__grid">
          <div className="wr__cell">
            <span className="wr__num">{recap.checkIns}</span>
            <span className="wr__sub">{t('weeklyCheckIns')}</span>
          </div>
          <div className="wr__cell">
            <span className="wr__num">{recap.distance}</span>
            <span className="wr__sub">{t('unitKm')}</span>
          </div>
          <div className="wr__cell">
            <span className="wr__num">{recap.days}</span>
            <span className="wr__sub">{t('weeklyDays')}</span>
          </div>
          <div className="wr__cell">
            <span className="wr__num">{recap.badges.length}</span>
            <span className="wr__sub">{t('weeklyBadges')}</span>
          </div>
        </div>
      ) : null}
      {digest ? (
        <p className="wr__digest">
          {t('weeklyDigest', { checkIns: digest.checkIns, milestones: digest.milestones, finishes: digest.finishes })}
        </p>
      ) : null}
    </section>
  );
}