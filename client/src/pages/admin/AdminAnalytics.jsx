import { useState, useEffect, useCallback } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, LineChart, Line } from 'recharts';
import { api } from '../../api/client';
import { ErrorState } from '../../components/States';
import PageSkeleton from '../../components/PageSkeleton';
import AdminShell from '../../components/admin/AdminShell';
import { StatCard, StatusBadge } from '../../components/admin/ui';
import './Admin.css';
import './AdminAnalytics.css';

function Section({ title, sub, children }) {
  return (
    <section className="ana__section">
      <div className="ana__section-head">
        <h2 className="ana__section-title">{title}</h2>
        {sub ? <p className="ana__section-sub">{sub}</p> : null}
      </div>
      {children}
    </section>
  );
}

function FunnelRow({ label, value, max }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="funnel__row">
      <span className="funnel__label">{label}</span>
      <div className="funnel__bar"><div className="funnel__fill" style={{ width: `${pct}%` }} /></div>
      <span className="funnel__value">{value}</span>
    </div>
  );
}

function fmtH(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function fmtMs(ms) {
  if (!ms) return '0ms';
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
}
function fmtBytes(b) {
  if (!b) return '0';
  const mb = b / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}
function fmtUptime(sec) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : `${h}h ${m}m`;
}
function tooltipStyle() {
  return { background: 'var(--card-bg)', border: '1px solid var(--color-line)', borderRadius: 10 };
}

export default function AdminAnalytics() {
  const [data, setData] = useState(null);
  const [sys, setSys] = useState(null);
  const [logs, setLogs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    Promise.all([
      api.get('/api/admin/analytics'),
      api.get('/api/admin/system').catch(() => null),
      api.get('/api/admin/logs/stats').catch(() => null)
    ])
      .then(([a, s, l]) => {
        setData(a);
        setSys(s);
        setLogs(l);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  if (loading) return <PageSkeleton variant="admin" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return null;

  const funnel = [
    { label: 'Registered', value: data.funnel.registered },
    { label: 'Installed', value: data.funnel.installed },
    { label: 'Onboarded', value: data.funnel.onboarded },
    { label: 'Enrolled', value: data.funnel.enrolled },
    { label: 'Active', value: data.funnel.active },
    { label: 'Completed', value: data.funnel.completed }
  ];
  const cohorts = (data.cohorts || []).slice(0, 6);
  const last24 = logs?.last24h || {};
  const statusBuckets = logs?.statusBuckets || [];
  const topPaths = (logs?.topPaths || []).slice(0, 8);

  return (
    <AdminShell title="Analytics">
      {/* 1. Overview */}
      <Section title="Overview" sub="Who is on the platform and how engaged they are.">
        <div className="stats-grid">
          <StatCard value={data.dau} label="Daily active users" />
          <StatCard value={data.wau} label="Weekly active users" />
          <StatCard value={data.mau} label="Monthly active users" tone="info" />
          <StatCard value={data.stickiness} label="Stickiness — daily ÷ monthly" tone="warning" />
          <StatCard value={data.totalUsers} label="Total users" />
          <StatCard value={data.onboarded} label="Onboarded" />
          <StatCard value={data.enrolled} label="Enrolled" tone="success" />
          <StatCard value={data.completed} label="Completed" tone="warning" />
        </div>
      </Section>

      {/* 2. Acquisition */}
      <Section title="Acquisition" sub="New sign-ups and the path from install to completion.">
        <div className="ana__grid">
          <div className="admin-card">
            <div className="admin-card__head"><h2 className="admin-card__title">New users (30 days)</h2></div>
            <div className="ana__chart">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.userSeries} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" />
                  <XAxis dataKey="day" stroke="var(--color-muted)" fontSize={11} />
                  <YAxis stroke="var(--color-muted)" fontSize={11} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle()} />
                  <Bar dataKey="count" fill="var(--color-accent)" name="new users" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="admin-card">
            <div className="admin-card__head"><h2 className="admin-card__title">Install funnel</h2></div>
            <div className="funnel">
              {funnel.map((f) => <FunnelRow key={f.label} label={f.label} value={f.value} max={funnel[0].value} />)}
            </div>
            <p className="ana__hint">Install rate: {data.totalUsers > 0 ? Math.round((data.installed / data.totalUsers) * 100) : 0}% of registered users installed the app.</p>
          </div>
        </div>
      </Section>

      {/* 3. Engagement */}
      <Section title="Engagement" sub="Activity volume, time on platform, and connected integrations.">
        <div className="stats-grid">
          <StatCard value={fmtH(data.sessionSeconds)} label="Time on platform" sub={`${data.sessionUsers} active users`} />
          <StatCard value={data.connections.strava} label="Strava connected" tone="info" />
          <StatCard value={data.connections.telegram} label="Telegram active" tone="success" />
          <StatCard value={data.connections.installed} label="PWA installed" tone="warning" />
        </div>
        <div className="admin-card">
          <div className="admin-card__head"><h2 className="admin-card__title">Activity volume (30 days)</h2></div>
          <div className="ana__chart">
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={data.activitySeries} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="km" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" />
                <XAxis dataKey="day" stroke="var(--color-muted)" fontSize={11} />
                <YAxis stroke="var(--color-muted)" fontSize={11} />
                <Tooltip contentStyle={tooltipStyle()} />
                <Area type="monotone" dataKey="km" stroke="var(--color-accent)" fill="url(#km)" name="km" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Section>

      {/* 4. Retention */}
      {cohorts.length ? (
        <Section title="Retention" sub="Weekly cohorts — how many members of each sign-up week keep coming back.">
          <div className="admin-card">
            <div className="admin__table-wrap">
              <table className="admin__table" style={{ minWidth: 0 }}>
                <thead>
                  <tr>
                    <th>Cohort (sign-up week)</th>
                    <th>Size</th>
                    {cohorts.map((c) => <th key={c.week}>{c.week}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {cohorts.map((c) => (
                    <tr key={c.week}>
                      <td>{c.week}</td>
                      <td>{c.size}</td>
                      {cohorts.map((col) => {
                        const cell = c.retention.find((r) => r.week === col.week);
                        return <td key={col.week}>{cell ? `${cell.count} (${cell.pct}%)` : '—'}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Section>
      ) : null}

      {/* 5. System */}
      <Section title="System" sub="Server health, resource usage, and request traffic.">
        <div className="ana__sys">
          <div className="admin-card">
            <div className="admin-card__head"><h2 className="admin-card__title">Health</h2></div>
            <div className="admin__detail-grid">
              <div><div className="admin__detail-label">Database</div><div><StatusBadge tone={sys?.dbOk ? 'success' : 'danger'}>{sys?.dbOk ? 'OK' : 'DOWN'}</StatusBadge></div></div>
              <div><div className="admin__detail-label">Uptime</div><div>{sys ? fmtUptime(sys.uptimeSec) : '—'}</div></div>
              <div><div className="admin__detail-label">Node version</div><div>{sys?.node || '—'}</div></div>
              <div><div className="admin__detail-label">Environment</div><div>{sys?.env || '—'}</div></div>
              <div><div className="admin__detail-label">Timezone</div><div>{sys?.timezone || '—'}</div></div>
              <div><div className="admin__detail-label">Resident memory</div><div>{sys ? fmtBytes(sys.memory?.rss) : '—'}</div></div>
              <div><div className="admin__detail-label">Heap (used / total)</div><div>{sys ? `${fmtBytes(sys.memory?.heapUsed)} / ${fmtBytes(sys.memory?.heapTotal)}` : '—'}</div></div>
              <div><div className="admin__detail-label">Queue backlog</div><div>{sys?.queueBacklog ?? '—'}</div></div>
              <div><div className="admin__detail-label">Pending log writes</div><div>{sys?.pendingLogWrites ?? '—'}</div></div>
              <div><div className="admin__detail-label">Logged requests</div><div>{sys?.logCounts?.requests ?? '—'}</div></div>
              <div><div className="admin__detail-label">Logged errors</div><div>{sys?.logCounts?.errors ?? '—'}</div></div>
              <div><div className="admin__detail-label">Logged events</div><div>{sys?.logCounts?.events ?? '—'}</div></div>
            </div>
          </div>

          <div className="admin-card">
            <div className="admin-card__head"><h2 className="admin-card__title">Last 24 hours</h2></div>
            <div className="admin__detail-grid">
              <div><div className="admin__detail-label">Requests</div><div>{last24.requests ?? '—'}</div></div>
              <div><div className="admin__detail-label">Unique users</div><div>{last24.users ?? '—'}</div></div>
              <div><div className="admin__detail-label">Errors</div><div>{last24.errors ?? '—'}</div></div>
              <div><div className="admin__detail-label">Avg response time</div><div>{fmtMs(last24.avgMs)}</div></div>
              <div><div className="admin__detail-label">Slowest response</div><div>{fmtMs(last24.maxMs)}</div></div>
              <div><div className="admin__detail-label">95th-percentile time</div><div>{fmtMs(last24.p95Ms)}</div></div>
            </div>
            <div className="admin__table-wrap" style={{ marginTop: 'var(--space-3)' }}>
              <table className="admin__table" style={{ minWidth: 0 }}>
                <thead><tr><th>HTTP status</th><th>Count</th></tr></thead>
                <tbody>
                  {statusBuckets.map((b, i) => (
                    <tr key={i}><td>{b.status}</td><td>{b.count}</td></tr>
                  ))}
                  {!statusBuckets.length ? <tr><td colSpan={2}>No requests logged in the last 24 hours.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {logs?.daily?.length ? (
          <div className="admin-card" style={{ marginTop: 'var(--space-4)' }}>
            <div className="admin-card__head"><h2 className="admin-card__title">Request traffic (14 days)</h2></div>
            <div className="ana__chart">
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={logs.daily} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" />
                  <XAxis dataKey="day" stroke="var(--color-muted)" fontSize={11} />
                  <YAxis stroke="var(--color-muted)" fontSize={11} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle()} />
                  <Line type="monotone" dataKey="count" stroke="var(--color-accent)" name="requests" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="ana__hint">Top endpoints: {topPaths.map((p) => `${p.path} (${p.count})`).join(' · ') || '—'}</p>
          </div>
        ) : null}
      </Section>
    </AdminShell>
  );
}