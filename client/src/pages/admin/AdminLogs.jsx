import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../components/Toast';
import { ErrorState } from '../../components/States';
import PageSkeleton from '../../components/PageSkeleton';
import Stat from '../../components/Stat';
import AdminShell from '../../components/admin/AdminShell';
import { ConfirmDialog, AdminPager, DateRange } from '../../components/admin/ui';
import './Admin.css';

const TABS = ['requests', 'errors', 'events', 'system', 'usage'];
const LIST_ENDPOINTS = { requests: 'requests', errors: 'errors', events: 'events' };

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
  const { showToast } = useToast();
  const [tab, setTab] = useState('requests');
  const [live, setLive] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [filters, setFilters] = useState({});
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rows, setRows] = useState(null);
  const [system, setSystem] = useState(null);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [flushConfirm, setFlushConfirm] = useState(false);

  const loadSystem = useCallback(() => {
    api.get('/api/admin/system').then(setSystem).catch(() => setSystem(null));
  }, []);

  const loadList = useCallback(() => {
    const endpoint = LIST_ENDPOINTS[tab];
    if (!endpoint) return;
    setLoading(true);
    setError('');
    const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
    Object.entries(filters).forEach(([k, v]) => v && qs.set(k, v));
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    api
      .get(`/api/admin/logs/${endpoint}?${qs.toString()}`)
      .then((d) => setRows(d))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [tab, page, limit, filters, from, to]);

  useEffect(() => {
    if (LIST_ENDPOINTS[tab]) loadList();
    else if (tab === 'system') loadSystem();
    else if (tab === 'usage') api.get('/api/admin/logs/stats').then(setUsage).catch(() => setUsage(null));
  }, [tab, loadList, loadSystem]);

  useEffect(() => {
    if (!live || !LIST_ENDPOINTS[tab]) return;
    const id = setInterval(loadList, 15000);
    return () => clearInterval(id);
  }, [live, tab, loadList]);

  const resetFilters = () => {
    setPage(1);
    setFilters({});
    setFrom('');
    setTo('');
  };

  const setF = (k) => (e) => { setPage(1); setFilters((f) => ({ ...f, [k]: e.target.value })); };
  const setDate = (fn) => (v) => { setPage(1); fn(v); };

  const runJobs = async () => {
    setBusy(true);
    try {
      const r = await api.post('/api/admin/system/run-jobs');
      showToast(r.ran ? t('adminRunJobsDone') : t('adminRunJobsSkipped'), r.ran ? 'success' : 'info');
      loadSystem();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const flushLogs = async () => {
    setBusy(true);
    try {
      const r = await api.post('/api/admin/system/flush-logs');
      showToast(r.ran ? t('adminFlushDone', { n: r.removed }) : t('adminFlushSkipped'), r.ran ? 'success' : 'info');
      setFlushConfirm(false);
      loadSystem();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const syncStrava = async () => {
    setBusy(true);
    try {
      const r = await api.post('/api/admin/system/backfill-strava');
      showToast(r.message || 'Strava sync triggered', 'success');
      loadSystem();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const tabs = (
    <div className="admin__tabs">
      {TABS.map((x) => (
        <button key={x} className={`admin__tab ${tab === x ? 'is-active' : ''}`} onClick={() => { setTab(x); setPage(1); resetFilters(); }}>
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

  const listFooter = rows ? (
    <>
      <AdminPager page={rows.page} limit={rows.limit} total={rows.total} onPage={setPage} />
      {rows.page * rows.limit < rows.total ? (
        <div className="admin__pager">
          <button className="btn btn--secondary btn--sm" onClick={() => setLimit((l) => l + 10)}>
            {t('adminViewMore')}
          </button>
        </div>
      ) : null}
    </>
  ) : null;

  return (
    <AdminShell title={t('adminLogs')} actions={tabs}>
      {error ? <p className="ob-error">{error}</p> : null}

      {tab === 'requests' && (
        <>
          <div className="admin__filters">
            <input className="admin__filter-input" placeholder="Path" value={filters.path || ''} onChange={setF('path')} />
            <input className="admin__filter-input admin__filter-input--sm" placeholder="Status" value={filters.status || ''} onChange={setF('status')} />
            <DateRange from={from} to={to} onFrom={setDate(setFrom)} onTo={setDate(setTo)} />
          </div>
          {loading && !listEntries.length ? <PageSkeleton variant="admin" /> : renderListTable([
            { key: 'id', label: 'ID' },
            { key: 'path', label: 'Path' },
            { key: 'method', label: 'Method' },
            { key: 'status', label: 'Status' },
            { key: 'duration_ms', label: 'ms' },
            { key: 'created_at', label: 'Time', render: (r) => fmtTs(r.created_at) }
          ])}
          {listFooter}
        </>
      )}

      {tab === 'errors' && (
        <>
          <div className="admin__filters">
            <input className="admin__filter-input admin__filter-input--sm" placeholder="Level" value={filters.level || ''} onChange={setF('level')} />
            <DateRange from={from} to={to} onFrom={setDate(setFrom)} onTo={setDate(setTo)} />
          </div>
          {loading && !listEntries.length ? <PageSkeleton variant="admin" /> : renderListTable([
            { key: 'level', label: 'Level' },
            { key: 'message', label: 'Message', style: { whiteSpace: 'normal', minWidth: 320 } },
            { key: 'path', label: 'Path' },
            { key: 'created_at', label: 'Time', render: (r) => fmtTs(r.created_at) }
          ])}
          {listFooter}
        </>
      )}

      {tab === 'events' && (
        <>
          <div className="admin__filters">
            <input className="admin__filter-input admin__filter-input--sm" placeholder="Source" value={filters.source || ''} onChange={setF('source')} />
            <input className="admin__filter-input admin__filter-input--sm" placeholder="Type" value={filters.type || ''} onChange={setF('type')} />
            <DateRange from={from} to={to} onFrom={setDate(setFrom)} onTo={setDate(setTo)} />
          </div>
          {loading && !listEntries.length ? <PageSkeleton variant="admin" /> : renderListTable([
            { key: 'source', label: 'Source' },
            { key: 'type', label: 'Type' },
            { key: 'message', label: 'Message', style: { whiteSpace: 'normal', minWidth: 280 } },
            { key: 'created_at', label: 'Time', render: (r) => fmtTs(r.created_at) }
          ])}
          {listFooter}
        </>
      )}

      {tab === 'system' && system && (
        <>
          <div className="admin__row-actions" style={{ marginBottom: 'var(--space-4)' }}>
            <button className="btn btn--primary btn--sm" onClick={runJobs} disabled={busy}>
              {t('adminRunJobs')}
            </button>
            <button className="btn btn--secondary btn--sm" onClick={syncStrava} disabled={busy} title={t('adminSyncStravaHint')}>
              {t('adminSyncStrava')}
            </button>
            <button className="btn btn--secondary btn--sm" onClick={() => setFlushConfirm(true)} disabled={busy}>
              {t('adminFlushLogs')}
            </button>
          </div>
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
        </>
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

      <ConfirmDialog
        open={flushConfirm}
        title={t('adminFlushLogs')}
        message={t('adminFlushConfirm')}
        confirmLabel="Flush"
        busy={busy}
        onConfirm={flushLogs}
        onCancel={() => setFlushConfirm(false)}
      />
    </AdminShell>
  );
}