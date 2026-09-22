import { useLanguage } from '../context/LanguageContext';

export default function CommunityPulse({ stats }) {
  const { t } = useLanguage();
  const items = [
    { label: t('members'), value: stats ? Number(stats.members).toLocaleString() : null },
    { label: t('distanceMoved'), value: stats ? `${Math.round(stats.distanceMoved).toLocaleString()} KM` : null },
    { label: t('activeThisWeek'), value: stats ? Number(stats.activeWeek).toLocaleString() : null }
  ];
  return (
    <div className="pulse" aria-label={t('communityPulse')}>
      {items.map((it, i) => (
        <div className="pulse__stat" key={it.label}>
          <span className="pulse__value">{it.value ?? '—'}</span>
          <span className="pulse__label">{it.label}</span>
          {i < items.length - 1 ? <span className="pulse__divider" aria-hidden="true" /> : null}
        </div>
      ))}
    </div>
  );
}