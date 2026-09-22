import './CircularProgress.css';

export default function CircularProgress({ value, max, size = 240, stroke = 10, children }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;

  return (
    <div className="circular" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="circular__svg" aria-hidden="true">
        <circle className="circular__track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" />
        <circle
          className="circular__fill"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="circular__content">{children}</div>
    </div>
  );
}