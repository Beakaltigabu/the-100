import './StatusBadge.css';
import { useLanguage } from '../context/LanguageContext';

const STATUS_KEY = {
  on_track: 'onTrack',
  falling_behind: 'fallingBehind',
  inactive: 'inactive',
  completed: 'completed',
  not_started: 'notStarted',
  connected: 'connected',
  not_connected: 'notConnected'
};

export default function StatusBadge({ status, label, className = '' }) {
  const { t } = useLanguage();
  const key = STATUS_KEY[status];
  return (
    <span className={`status-badge status-badge--${status} ${className}`.trim()}>
      <span className="status-badge__dot" />
      <span className="status-badge__text">{label || (key ? t(key) : status)}</span>
    </span>
  );
}