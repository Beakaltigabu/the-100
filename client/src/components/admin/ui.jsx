import './ui.css';

// Small reusable admin primitives (EN-only, internal surface).

const TONES = {
  accent: 'sb--accent',
  success: 'sb--success',
  warning: 'sb--warning',
  danger: 'sb--danger',
  info: 'sb--info',
  muted: 'sb--muted'
};

export function StatusBadge({ tone = 'muted', children, dot = true }) {
  return (
    <span className={`sb ${TONES[tone] || TONES.muted}`}>
      {dot ? <span className="sb__dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

export function PageHeader({ kicker, title, actions }) {
  return (
    <header className="ph">
      <div className="ph__text">
        {kicker ? <p className="admin__kicker">{kicker}</p> : null}
        <h1 className="admin__title">{title}</h1>
      </div>
      {actions ? <div className="ph__actions">{actions}</div> : null}
    </header>
  );
}

export function StatCard({ value, label, sub, tone }) {
  return (
    <div className={`stat-card ${tone ? `stat-card--${tone}` : ''}`}>
      <span className="stat-card__value">{value}</span>
      <span className="stat-card__label">{label}</span>
      {sub ? <span className="stat-card__sub">{sub}</span> : null}
    </div>
  );
}

export function EmptyState({ message, action }) {
  return (
    <div className="empty">
      <p className="empty__msg">{message}</p>
      {action ? <div className="empty__action">{action}</div> : null}
    </div>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', danger, busy, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="confirm" role="dialog" aria-modal="true">
      <button className="confirm__scrim" aria-label="Close" onClick={onCancel} />
      <div className="confirm__card">
        <h3 className="confirm__title">{title}</h3>
        {message ? <p className="confirm__msg">{message}</p> : null}
        <div className="confirm__actions">
          <button className="btn btn--secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className={`btn ${danger ? 'btn--danger' : 'btn--primary'}`} onClick={onConfirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// Prev/next pager for admin list pages.
export function AdminPager({ page, limit, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / Math.max(1, limit)));
  return (
    <div className="admin__pager">
      <button className="btn btn--secondary btn--sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        ‹
      </button>
      <span className="admin__page">
        {page} / {pages}
      </span>
      <button className="btn btn--secondary btn--sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        ›
      </button>
    </div>
  );
}

// From/to date-range inputs for admin list filters (YYYY-MM-DD).
export function DateRange({ from, to, onFrom, onTo }) {
  return (
    <div className="admin__filters">
      <input className="admin__filter-input admin__filter-input--sm" type="date" value={from || ''} onChange={(e) => onFrom(e.target.value)} aria-label="From" />
      <input className="admin__filter-input admin__filter-input--sm" type="date" value={to || ''} onChange={(e) => onTo(e.target.value)} aria-label="To" />
    </div>
  );
}
