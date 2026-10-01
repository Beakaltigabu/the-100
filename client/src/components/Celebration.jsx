import { useEffect, useState } from 'react';
import './Celebration.css';

const COLORS = ['#FF4D00', '#22C55E', '#3B82F6', '#EAB308', '#DC2626'];

// Lightweight CSS confetti celebration overlay (no external lib).
export default function Celebration({ trigger }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!trigger) return;
    setShow(true);
    const t = setTimeout(() => setShow(false), 3200);
    return () => clearTimeout(t);
  }, [trigger]);

  if (!show) return null;

  const pieces = Array.from({ length: 40 }, (_, i) => ({
    left: `${(i * 37) % 100}%`,
    delay: `${(i % 10) * 0.1}s`,
    color: COLORS[i % COLORS.length],
    size: 6 + (i % 4) * 2
  }));

  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti__piece"
          style={{ left: p.left, animationDelay: p.delay, background: p.color, width: p.size, height: p.size }}
        />
      ))}
    </div>
  );
}