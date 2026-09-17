import { useEffect, useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import './Countdown.css';

function getParts(targetDate) {
  const diff = Math.max(0, targetDate.getTime() - Date.now());
  const s = Math.floor(diff / 1000);
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60
  };
}

export default function Countdown({ target }) {
  const { t } = useLanguage();
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const targetDate = typeof target === 'string' ? new Date(target + 'T00:00:00') : target;
  const { days, hours, minutes, seconds } = getParts(targetDate);
  const pad = (n) => String(n).padStart(2, '0');

  const units = [
    { value: days, label: t('cdDays') },
    { value: pad(hours), label: t('cdHours') },
    { value: pad(minutes), label: t('cdMinutes') },
    { value: pad(seconds), label: t('cdSeconds') }
  ];

  return (
    <div className="countdown">
      {units.map((u, i) => (
        <div className="countdown__unit" key={i}>
          <span className="countdown__num">{u.value}</span>
          <span className="countdown__label">{u.label}</span>
        </div>
      ))}
    </div>
  );
}