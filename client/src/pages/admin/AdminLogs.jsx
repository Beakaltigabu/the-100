import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import { useLanguage } from '../../context/LanguageContext';
import { ErrorState } from '../../components/States';
import PageSkeleton from '../../components/PageSkeleton';
import Stat from '../../components/Stat';
import AdminShell from '../../components/admin/AdminShell';
import './Admin.css';

const TABS = ['requests', 'errors', 'events', 'system', 'usage'];

function fmtTs(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? String(ts) : d.toLocaleString();
}
function fmtMem(b) { return `${Math.round(b / (1024 * 1024))} MB`; }
function fmtUptime(sec) {
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : `${h}h ${m}m`;
}

export default function AdminLogs() {
  const { t } = useLanguage();
  const [tab, setTab] = useState('requests');
  const [live, setLive] = useState(false);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({});
  const [rows, setRows] = useState(null);
  const [system, setSystem] = useState(null);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadList = useCallback(() => {
    const endpoints = { requests: 'requests', errors: 'errors', events: 'events' };
    if (!endpoints[tab]) return;
    setLoading(true);
    setError('');
    const qs = new URLSearchParams({ page: String(page), limit: '50' });
    Object.entries(filters).forEach(([k, v]) => v && qs.set(k, v));
    api
      .get(`/api/admin/logs/${endpoints[tab]}?${qs.toString()}`)
      .then((d) => setRows(d))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [tab, page, filters]);

  useEffect(() => {
    if (['requests', 'errors', 'events'].includes(tab)) loadList();
    else if (tab === 'system') api.get('/api/admin/system').then(setSystem).catch(() => setSystem(null));
    else if (tab === 'usage') api.get('/api/admin/logs/stats').then(setUsage).catch(() => setUsage(null));
  }, [tab, loadList]);

  useEffect(() => {
    if (!live) return;
    const id = setInterval(loadList, 15000);
    return () => clearInterval(id);
  }, [live, loadList]);

  const setF = (k) => (e) => { setPage(1); setFilters((f) => ({ ...f, [k]: e.target.value })); };

  const tabs = (
    <div className="admin__tabs">
      {TABS.map((x) => (
        <button key={x} className={`admin__tab ${tab === x ? 'is-active' : ''}`} onClick={() => { setTab(x); setPage(1); setFilters({}); }}>
          {t(`admin${x.charAt(0).toUpperCase()}${x.slice(1)}`)}
        </button>
      ))}
      <button className={`btn btn--sm ${live ? 'btn--primary' : 'btn--secondary'}`} onClick={() => setLive((v) => !v)}>
        {t('adminRefresh')}
      </button>
    </div>
  );

  const listEntries = rows ? rows.entries || [] : [];

  const renderListTable = (cols) => (
    <div className="admin__table-wrap">
      <table className="admin__table">
        <thead>
          <tr>{cols.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {listEntries.length === 0 ? (
            <tr><td colSpan={cols.length}>No entries.</td></tr>
          ) : (
            listEntries.map((r, i) => (
              <tr key={i}>{cols.map((c) => <td key={c.key} style={c.style}>{c.render ? c.render(r) : r[c.key]}</td>)}</tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <AdminShell title={t('adminLogs')} actions={tabs}>
      {error ? <p className="ob-error">{error}</p> : null}

      {tab === 'requests' && (
        <>
          <div className="admin__filters">
            <input className="admin__filter-input" placeholder="Path" value={filters.path || ''} onChange={setF('path')} />
            <input className="admin__filter-input admin__filter-input--sm" placeholder="Status" value={filters.status || ''} onChange={setF('status')} />
          </div>
          {loading ? <PageSkeleton variant="admin" /> : renderListTable([
            { key: 'id', label: 'ID' },
            { key: 'path', label: 'Path' },
            { key: 'method', label: 'Method' },
            { key: 'status', label: 'Status' },
            { key: 'duration_ms', label: 'ms' },
            { key: 'created_at', label: 'Time', render: (r) => fmtTs(r.created_at) }
          ])}
          <Pager data={rows} page={page} setPage={setPage} />
        </>
      )}

      {tab === 'errors' && (
        <>
          <div className="admin__filters">
            <input className="admin__filter-input admin__filter-input--sm" placeholder="Level" value={filters.level || ''} onChange={setF('level')} />
          </div>
          {loading ? <PageSkeleton variant="admin" /> : renderListTable([
            { key: 'level', label: 'Level' },
            { key: 'message', label: 'Message', style: { whiteSpace: 'normal', minWidth: 320 } },
            { key: 'path', label: 'Path' },
            { key: 'created_at', label: 'Time', render: (r) => fmtTs(r.created_at) }
          ])}
          <Pager data={rows} page={page} setPage={setPage} />
        </>
      )}

      {tab === 'events' && (
        <>
          <div className="admin__filters">
            <input className="admin__filter-input admin__filter-input--sm" placeholder="Source" value={filters.source || ''} onChange={setF('source')} />
            <input className="admin__filter-input admin__filter-input--sm" placeholder="Type" value={filters.type || ''} onChange={setF('type')} />
          </div>
          {loading ? <PageSkeleton variant="admin" /> : renderListTable([
            { key: 'source', label: 'Source' },
            { key: 'type', label: 'Type' },
            { key: 'message', label: 'Message', style: { whiteSpace: 'normal', minWidth: 280 } },
            { key: 'created_at', label: 'Time', render: (r) => fmtTs(r.created_at) }
          ])}
          <Pager data={rows} page={page} setPage={setPage} />
        </>
      )}

      {tab === 'system' && system && (
        <div className="admin__stats">
          <Stat label={t('adminUptime')} value={fmtUptime(system.uptimeSec)} />
          <Stat label={t('adminNode')} value={system.node} />
          <Stat label={t('adminEnv')} value={system.env} />
          <Stat label={t('adminTimezone')} value={system.timezone} />
          <Stat label={t('adminDbOk')} value={system.dbOk ? 'OK' : 'DOWN'} />
          <Stat label={t('adminQueue')} value={system.queueBacklog} />
          <Stat label={t('adminPending')} value={system.pendingLogWrites} />
          <Stat label={t('adminMemory')} value={fmtMem(system.memory.rss)} />
          <Stat label={t('adminLogCounts')} value={`${system.logCounts.requests} / ${system.logCounts.errors} / ${system.logCounts.events}`} />
        </div>
      )}

      {tab === 'usage' && usage && (
        <>
          <div className="admin__stats">
            <Stat label={t('adminRequests24h')} value={usage.last24h.requests} />
            <Stat label={t('adminUsers24h')} value={usage.last24h.users} />
            <Stat label={t('adminErrors24h')} value={usage.last24h.errors} />
            <Stat label={t('adminAvgMs')} value={usage.last24h.avgMs} />
            <Stat label={t('adminMaxMs')} value={usage.last24h.maxMs} />
            <Stat label={t('adminP95')} value={usage.last24h.p95Ms} />
          </div>
          <h3 className="admin__subtitle">{t('adminDaily')}</h3>
          <div className="admin__table-wrap">
            <table className="admin__table" style={{ minWidth: 0 }}>
              <thead><tr><th>Day</th><th>Requests</th><th>Users</th></tr></thead>
              <tbody>
                {usage.daily.map((d) => (
                  <tr key={d.day}><td>{d.day}</td><td>{d.count}</td><td>{d.users}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </AdminShell>
  );
}

function Pager({ data, page, setPage }) {
  if (!data) return null;
  const totalPages = Math.max(1, Math.ceil(data.total / data.limit));
  return (
    <div className="admin__pager">
      <button className="btn btn--secondary btn--sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹</button>
      <span className="admin__page">{page} / {totalPages}</span>
      <button className="btn btn--secondary btn--sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>›</button>
    </div>
  );
}
