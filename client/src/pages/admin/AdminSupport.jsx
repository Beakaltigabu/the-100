import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import { useLanguage } from '../../context/LanguageContext';
import { ErrorState } from '../../components/States';
import PageSkeleton from '../../components/PageSkeleton';
import AdminNav from './AdminNav';
import './Admin.css';

function fmtTs(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  return d.toLocaleString();
}

export default function AdminSupport() {
  const { t } = useLanguage();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    const qs = new URLSearchParams({ page: String(page), limit: '50' });
    if (status) qs.set('status', status);
    api
      .get(`/api/admin/contact?${qs.toString()}`)
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [page, status]);

  useEffect(load, [load]);

  const setStatusFor = async (id, next) => {
    try {
      await api.post(`/api/admin/contact/${id}/status`, { status: next });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) return <PageSkeleton variant="admin" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  const entries = (data && data.entries) || [];

  return (
    <div className="admin page page--full">
      <AdminNav />
      <div className="admin__head">
        <h1 className="admin__title">{t('adminSupport')}</h1>
        <div className="admin__tabs">
          {['', 'new', 'replied', 'resolved'].map((s) => (
            <button
              key={s || 'all'}
              type="button"
              className={`admin__tab ${status === s ? 'is-active' : ''}`.trim()}
              onClick={() => {
                setStatus(s);
                setPage(1);
              }}
            >
              {s ? t(`contactStatus${s.charAt(0).toUpperCase()}${s.slice(1)}`) : 'ALL'}
            </button>
          ))}
        </div>
      </div>

      <div className="admin__table-wrap">
        <table className="admin__table">
          <thead>
            <tr>
              <th>{t('adminTs')}</th>
              <th>{t('contactName')}</th>
              <th>{t('contactEmail')}</th>
              <th>{t('contactAccount')}</th>
              <th>{t('adminMessage')}</th>
              <th>{t('adminStatus')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={7}>{t('adminSupportEmpty')}</td>
              </tr>
            ) : (
              entries.map((m) => (
                <tr key={m.id}>
                  <td>{fmtTs(m.ts)}</td>
                  <td>{m.name}</td>
                  <td>
                    <a className="admin__link" href={`mailto:${m.email}`}>
                      {m.email}
                    </a>
                  </td>
                  <td>{m.account_name || ''}</td>
                  <td style={{ whiteSpace: 'normal', minWidth: 260 }}>{m.message}</td>
                  <td>{t(`contactStatus${m.status.charAt(0).toUpperCase()}${m.status.slice(1)}`)}</td>
                  <td>
                    <div className="admin__row-actions">
                      {m.status === 'new' ? (
                        <button className="btn btn--secondary btn--sm" onClick={() => setStatusFor(m.id, 'replied')}>
                          {t('contactMarkReplied')}
                        </button>
                      ) : null}
                      {m.status !== 'resolved' ? (
                        <button className="btn btn--secondary btn--sm" onClick={() => setStatusFor(m.id, 'resolved')}>
                          {t('contactMarkResolved')}
                        </button>
                      ) : null}
                    </div>
                  </td>
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
          {data.page} / {Math.max(1, Math.ceil(data.total / data.limit))}
        </span>
        <button
          className="btn btn--secondary btn--sm"
          disabled={page * data.limit >= data.total}
          onClick={() => setPage((p) => p + 1)}
        >
          ›
        </button>
      </div>
    </div>
  );
}