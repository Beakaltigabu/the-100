// Localized relative-time string, e.g. "now", "12m", "3h", "yesterday", "5d".
export function timeAgo(ts, t) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now - d;
  const minutes = Math.floor(diffMs / 60000);

  if (minutes < 1) return t('timeNow');
  if (minutes < 60) return t('timeM', { n: minutes });

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('timeH', { n: hours });

  const days = Math.floor(hours / 24);
  if (days === 1) return t('timeYesterday');
  if (days < 30) return t('timeD', { n: days });

  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}