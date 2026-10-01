import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import { timeAgo } from '../lib/time';
import { activityLabelKey } from '../lib/activity';
import './SocialProofBand.css';

// Live activity ticker — social proof (seeing others move drives your own move).
export default function SocialProofBand() {
  const { t } = useLanguage();
  const [activity, setActivity] = useState([]);

  const load = useCallback(() => {
    api
      .get('/api/community/recent-activity')
      .then((d) => setActivity(d.activity || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 60000);
    return () => clearInterval(iv);
  }, [load]);

  if (!activity.length) return null;

  return (
    <div className="spb" role="status" aria-live="polite">
      <span className="spb__dot" aria-hidden="true" />
      <div className="spb__items">
        {activity.map((a) => (
          <span className="spb__item" key={a.id}>
            <strong>{a.name}</strong>{' '}
            {a.distance != null ? `+${a.distance} ${t('unitKm')}` : t('checkIn')}{' '}
            <span className="spb__time">· {timeAgo(a.ts, t)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}