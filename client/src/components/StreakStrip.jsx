import { useLanguage } from '../context/LanguageContext';
import './StreakStrip.css';

// Your streak, front and center — the strongest daily-habit driver
// (Seinfeld "don't break the chain" / loss aversion).
export default function StreakStrip({ progress }) {
  const { t } = useLanguage();
  if (!progress || !progress.enrollment) return null;
  const day = progress.enrollment.day;
  const totalDays = progress.enrollment.totalDays;
  const streak = Number(progress.streak) || 0;

  return (
    <div className="ss" role="status">
      <span className="ss__flame" aria-hidden="true">🔥</span>
      <div className="ss__text">
        <span className="ss__line">
          <strong>{t('dayLabel', { day })}</strong> / {totalDays}
        </span>
        {streak > 0 ? (
          <span className="ss__sub">
            {t('dashStreak', { n: streak })} · {t('dashKeepAlive')}
          </span>
        ) : (
          <span className="ss__sub">{t('dashStreakZero')}</span>
        )}
      </div>
    </div>
  );
}