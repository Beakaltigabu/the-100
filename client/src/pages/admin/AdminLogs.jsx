import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import { useLanguage } from '../../context/LanguageContext';
import { ErrorState } from '../../components/States';
import PageSkeleton from '../../components/PageSkeleton';
import Stat from '../../components/Stat';
import AdminNav from './AdminNav';
import './Admin.css';

const TABS = ['requests', 'errors', 'events', 'system', 'usage'];

function fmtTs(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  return d.toLocaleString();
}

function fmtMem(bytes) {
  const mb = Math.round(bytes / (1024 * 1024));
  return `${mb} MB`;
}

function fmtUptime(sec) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

function useFetch(path, query, deps) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api
      .get(path + (query ? `?${query}` : ''))
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, query, ...deps]);
  useEffect(load, [load]);
  return { data, loading, error, reload: load };
}

export default function AdminLogs() {
  const { t } = useLanguage();
  const [tab, setTab] = useState('requests');
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState({ status: '', source: '', path: '', level: '', type: '' });
  const [live, setLive] = useState(false);

  const qs = new URLSearchParams({ page: String(page), limit: '50' });
  if (tab === 'requests') {
    if (filter.status) qs.set('status', filter.status);
    if (filter.source) qs.set('source', filter.source);
    if (filter.path) qs.set('path', filter.path);
  }
  if (tab === 'errors' && filter.level) qs.set('level', filter.level);
  if (tab === 'events' && filter.source) qs.set('source', filter.source);

  const isListTab = tab === 'requests' || tab === 'errors' || tab === 'events';
  const list = useFetch(`/api/admin/logs/${tab}`, tab === 'system' || tab === 'usage' ? null : qs.toString(), [page, tab, filter]);
  const system = useFetch('/api/admin/system', null, []);
  const stats = useFetch('/api/admin/logs/stats', null, []);

  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => {
      list.reload();
      if (tab === 'system') system.reload();
      if (tab === 'usage') stats.reload();
    }, 15000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, tab]);

  if (tab === 'system') {
    if (system.loading) return <PageSkeleton variant="admin" />;
    if (system.error) return <ErrorState message={system.error} onRetry={system.reload} />;
    const s = system.data;
    return (
      <div className="admin page page--full">
      <AdminNav />
        <Head tab={tab} setTab={setTab} t={t} live={live} setLive={setLive} reload={system.reload} />
        <div className="admin__stats">
          <Stat label={t('adminUptime')} value={fmtUptime(s.uptimeSec)} />
          <Stat label={t('adminNode')} value={s.node} />
          <Stat label={t('adminEnv')} value={s.env} />
          <Stat label={t('adminTimezone')} value={s.timezone} />
          <Stat label={t('adminDbOk')} value={s.dbOk ? 'OK' : 'DOWN'} />
          <Stat label={t('adminQueue')} value={s.queueBacklog} />
          <Stat label={t('adminPending')} value={s.pendingLogWrites} />
          <Stat label={t('adminMemory')} value={fmtMem(s.memory.rss)} />
          <Stat label={t('adminLogCounts')} value={`${s.logCounts.requests} / ${s.logCounts.errors} / ${s.logCounts.events}`} />
        </div>
      </div>
    );
  }

  if (tab === 'usage') {
    if (stats.loading) return <PageSkeleton variant="admin" />;
    if (stats.error) return <ErrorState message={stats.error} onRetry={stats.reload} />;
    const u = stats.data;
    return (
      <div className="admin page page--full">
      <AdminNav />
        <Head tab={tab} setTab={setTab} t={t} live={live} setLive={setLive} reload={stats.reload} />
        <div className="admin__stats">
          <Stat label={t('adminRequests24h')} value={u.last24h.requests} />
          <Stat label={t('adminUsers24h')} value={u.last24h.users} />
          <Stat label={t('adminErrors24h')} value={u.last24h.errors} />
          <Stat label={t('adminAvgMs')} value={u.last24h.avgMs} />
          <Stat label={t('adminMaxMs')} value={u.last24h.maxMs} />
          <Stat label={t('adminP95')} value={u.last24h.p95Ms} />
        </div>
        <h3 className="admin__subtitle">{t('adminDaily')}</h3>
        <div className="admin__table-wrap">
          <table className="admin__table">
            <thead>
              <tr>
                <th>{t('adminTs')}</th>
                <th>{t('adminRequests24h')}</th>
                <th>{t('adminUsers24h')}</th>
              </tr>
            </thead>
            <tbody>
              {(u.daily || []).map((d) => (
                <tr key={d.day}>
                  <td>{d.day}</td>
                  <td>{d.count}</td>
                  <td>{d.users}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="admin__split">
          <div>
            <h3 className="admin__subtitle">{t('adminTopPaths')}</h3>
            <div className="admin__table-wrap">
              <table className="admin__table">
                <thead>
                  <tr>
                    <th>{t('adminPath')}</th>
                    <th>{t('adminStatus')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(u.topPaths || []).map((p) => (
                    <tr key={p.path}>
                      <td>{p.path}</td>
                      <td>{p.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <h3 className="admin__subtitle">{t('adminStatusBuckets')}</h3>
            <div className="admin__table-wrap">
              <table className="admin__table">
                <thead>
                  <tr>
                    <th>{t('adminStatus')}</th>
                    <th>{t('adminStatus')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(u.statusBuckets || []).map((b) => (
                    <tr key={b.status}>
                      <td>{b.status}</td>
                      <td>{b.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // List tabs (requests / errors / events)
  if (list.loading) return <PageSkeleton variant="admin" />;
  if (list.error) return <ErrorState message={list.error} onRetry={list.reload} />;
  const entries = list.data.entries || [];

  return (
    <div className="admin page page--full">
      <AdminNav />
      <Head tab={tab} setTab={setTab} t={t} live={live} setLive={setLive} reload={list.reload} />
      {tab === 'requests' ? (
        <div className="admin__filters">
          <input
            className="admin__filter-input"
            placeholder={t('adminPath')}
            value={filter.path}
            onChange={(e) => setFilter((f) => ({ ...f, path: e.target.value }))}
          />
          <input
            className="admin__filter-input admin__filter-input--sm"
            placeholder={t('adminStatus')}
            value={filter.status}
            onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value }))}
          />
          <input
            className="admin__filter-input admin__filter-input--sm"
            placeholder={t('adminSource')}
            value={filter.source}
            onChange={(e) => setFilter((f) => ({ ...f, source: e.target.value }))}
          />
        </div>
      ) : null}
      {tab === 'errors' ? (
        <div className="admin__filters">
          <input
            className="admin__filter-input admin__filter-input--sm"
            placeholder={t('adminLevel')}
            value={filter.level}
            onChange={(e) => setFilter((f) => ({ ...f, level: e.target.value }))}
          />
        </div>
      ) : null}
      {tab === 'events' ? (
        <div className="admin__filters">
          <input
            className="admin__filter-input admin__filter-input--sm"
            placeholder={t('adminSource')}
            value={filter.source}
            onChange={(e) => setFilter((f) => ({ ...f, source: e.target.value }))}
          />
        </div>
      ) : null}

      <div className="admin__table-wrap">
        <table className="admin__table">
          <thead>
            <tr>
              <th>{t('adminTs')}</th>
              {tab === 'requests' ? (
                <>
                  <th>{t('adminMethod')}</th>
                  <th>{t('adminPath')}</th>
                  <th>{t('adminStatus')}</th>
                  <th>{t('adminDuration')}</th>
                  <th>{t('adminIp')}</th>
                  <th>{t('adminUser')}</th>
                  <th>{t('adminSource')}</th>
                </>
              ) : null}
              {tab === 'errors' ? (
                <>
                  <th>{t('adminLevel')}</th>
                  <th>{t('adminSource')}</th>
                  <th>{t('adminMessage')}</th>
                  <th>{t('adminPath')}</th>
                </>
              ) : null}
              {tab === 'events' ? (
                <>
                  <th>{t('adminSource')}</th>
                  <th>{t('adminType')}</th>
                  <th>{t('adminMessage')}</th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={8}>{t('adminNoLogs')}</td>
              </tr>
            ) : (
              entries.map((e) => (
                <tr key={e.id}>
                  <td>{fmtTs(e.created_at || e.ts)}</td>
                  {tab === 'requests' ? (
                    <>
                      <td>{e.method}</td>
                      <td>{e.path}</td>
                      <td>{e.status}</td>
                      <td>{e.duration_ms}</td>
                      <td>{e.ip}</td>
                      <td>{e.user_id || ''}</td>
                      <td>{e.source}</td>
                    </>
                  ) : null}
                  {tab === 'errors' ? (
                    <>
                      <td>{e.level}</td>
                      <td>{e.source}</td>
                      <td>{e.message}</td>
                      <td>{e.path || ''}</td>
                    </>
                  ) : null}
                  {tab === 'events' ? (
                    <>
                      <td>{e.source}</td>
                      <td>{e.type}</td>
                      <td>{e.message || ''}</td>
                    </>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="admin__pager">
        <button className="btn btn--secondary btn--sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          ‹
        </button>
        <span className="admin__page">
          {list.data.page} / {Math.max(1, Math.ceil(list.data.total / list.data.limit))}
        </span>
        <button
          className="btn btn--secondary btn--sm"
          disabled={page * list.data.limit >= list.data.total}
          onClick={() => setPage((p) => p + 1)}
        >
          ›
        </button>
      </div>
    </div>
  );
}

function Head({ tab, setTab, t, live, setLive, reload }) {
  return (
    <div className="admin__head">
      <h1 className="admin__title">{t('adminLogs')}</h1>
      <div className="admin__tabs">
        {TABS.map((k) => (
          <button
            key={k}
            type="button"
            className={`admin__tab ${tab === k ? 'is-active' : ''}`.trim()}
            onClick={() => setTab(k)}
          >
            {t(`admin${k.charAt(0).toUpperCase()}${k.slice(1)}`)}
          </button>
        ))}
        <button
          className={`btn btn--sm ${live ? 'btn--primary' : 'btn--secondary'}`}
          onClick={() => setLive((v) => !v)}
          title={t('adminLive')}
        >
          {t('adminRefresh')}
        </button>
      </div>
    </div>
  );
}