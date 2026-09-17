import './Stat.css';

export default function Stat({ label, value, sub, className = '' }) {
  return (
    <div className={`stat ${className}`.trim()}>
      <div className="stat__value">{value}</div>
      <div className="stat__label">{label}</div>
      {sub ? <div className="stat__sub">{sub}</div> : null}
    </div>
  );
}