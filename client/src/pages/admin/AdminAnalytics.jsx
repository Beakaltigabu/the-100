import { useState, useEffect, useCallback } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar } from 'recharts';
import { api } from '../../api/client';
import { ErrorState } from '../../components/States';
import PageSkeleton from '../../components/PageSkeleton';
import AdminShell from '../../components/admin/AdminShell';
import { StatCard } from '../../components/admin/ui';
import './Admin.css';
import './AdminAnalytics.css';

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

export default function AdminAnalytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api
      .get('/api/admin/analytics')
      .then((d) => setData(d))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  if (loading) return <PageSkeleton variant="admin" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return null;

  const funnel = [
    { label: 'Registered', value: data.funnel.registered },
    { label: 'Onboarded', value: data.funnel.onboarded },
    { label: 'Enrolled', value: data.funnel.enrolled },
    { label: 'Active', value: data.funnel.active },
    { label: 'Completed', value: data.funnel.completed }
  ];

  return (
    <AdminShell title="Analytics">
      <div className="stats-grid">
        <StatCard value={data.dau} label="DAU" />
        <StatCard value={data.wau} label="WAU" />
        <StatCard value={data.mau} label="MAU" tone="info" />
        <StatCard value={data.totalUsers} label="Total users" />
        <StatCard value={data.enrolled} label="Enrolled" tone="success" />
        <StatCard value={data.completed} label="Completed" tone="warning" />
      </div>

      <div className="ana__grid">
        <section className="admin-card">
          <div className="admin-card__head">
            <h2 className="admin-card__title">Activities (30 days)</h2>
          </div>
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
                <Tooltip contentStyle={{ background: 'var(--card-bg)', border: '1px solid var(--color-line)', borderRadius: 10 }} />
                <Area type="monotone" dataKey="km" stroke="var(--color-accent)" fill="url(#km)" name="km" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="admin-card">
          <div className="admin-card__head">
            <h2 className="admin-card__title">New users (30 days)</h2>
          </div>
          <div className="ana__chart">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.userSeries} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" />
                <XAxis dataKey="day" stroke="var(--color-muted)" fontSize={11} />
                <YAxis stroke="var(--color-muted)" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ background: 'var(--card-bg)', border: '1px solid var(--color-line)', borderRadius: 10 }} />
                <Bar dataKey="count" fill="var(--color-accent)" name="users" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <section className="admin-card">
        <div className="admin-card__head">
          <h2 className="admin-card__title">Enrollment funnel</h2>
        </div>
        <div className="funnel">
          {funnel.map((f) => (
            <FunnelRow key={f.label} label={f.label} value={f.value} max={funnel[0].value} />
          ))}
        </div>
      </section>
    </AdminShell>
  );
}
