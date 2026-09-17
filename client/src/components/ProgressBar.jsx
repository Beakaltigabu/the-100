import './ProgressBar.css';

export default function ProgressBar({ value, max = 100, className = '', accent = 'var(--color-accent)' }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className={`progress ${className}`.trim()} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin="0" aria-valuemax="100">
      <div className="progress__fill" style={{ width: `${pct}%`, background: accent }} />
    </div>
  );
}