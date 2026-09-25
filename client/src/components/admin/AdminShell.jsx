import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import './AdminShell.css';

const SECTIONS = [
  {
    label: 'Monitor',
    items: [
      { to: '/admin', key: 'Overview', end: true },
      { to: '/admin/analytics', key: 'Analytics' }
    ]
  },
  {
    label: 'Engage',
    items: [
      { to: '/admin/broadcast', key: 'Broadcasts' },
      { to: '/admin/members', key: 'Members' }
    ]
  },
  {
    label: 'Manage',
    items: [
      { to: '/admin/support', key: 'Support' },
      { to: '/admin/audit', key: 'Audit' },
      { to: '/admin/logs', key: 'Logs & System' }
    ]
  }
];

export default function AdminShell({ title, actions, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ash">
      <aside className={`ash__side ${open ? 'is-open' : ''}`}>
        <div className="ash__brand">THE 100 · Admin</div>
        <nav className="ash__nav">
          {SECTIONS.map((s) => (
            <div className="ash__section" key={s.label}>
              <span className="ash__section-label">{s.label}</span>
              {s.items.map((i) => (
                <NavLink
                  key={i.to}
                  to={i.to}
                  end={i.end}
                  className={({ isActive }) => `ash__item ${isActive ? 'is-active' : ''}`}
                  onClick={() => setOpen(false)}
                >
                  {i.key}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <button className={`ash__scrim ${open ? 'is-open' : ''}`} aria-label="Close menu" onClick={() => setOpen(false)} />

      <div className="ash__main">
        <header className="ash__topbar">
          <button className="ash__burger" aria-label="Open menu" onClick={() => setOpen(true)}>
            <span />
            <span />
            <span />
          </button>
          <div className="ash__title-block">
            <h1 className="admin__title">{title}</h1>
          </div>
          {actions ? <div className="ash__topbar-actions">{actions}</div> : null}
        </header>
        <div className="ash__content">{children}</div>
      </div>
    </div>
  );
}
