import { useState, useCallback } from 'react';
import { api } from '../../api/client';
import { useLanguage } from '../../context/LanguageContext';
import { ErrorState } from '../../components/States';
import PageSkeleton from '../../components/PageSkeleton';
import AdminShell from '../../components/admin/AdminShell';
import { AdminPager, DateRange } from '../../components/admin/ui';
import { useAdminList } from '../../lib/adminList';
import './Admin.css';

function fmtTs(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  return d.toLocaleString();
}

export default function AdminSupport() {
  const { t } = useLanguage();
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [actionError, setActionError] = useState('');

  const buildQuery = useCallback(() => ({ status, from, to }), [status, from, to]);
  const { rows, total, page, limit, loading, error, reload, viewMore, goPage } = useAdminList({
    path: '/api/admin/contact',
    dataKey: 'entries',
    buildQuery
  });

  const setStatusFor = async (id, next) => {
    setActionError('');
    try {
      await api.post(`/api/admin/contact/${id}/status`, { status: next });
      reload();
    } catch (err) {
      setActionError(err.message);
    }
  };

  if (loading && rows.length === 0) return <PageSkeleton variant="admin" />;
  if (error && rows.length === 0) return <ErrorState message={error} onRetry={reload} />;

  return (
    <AdminShell
      title={t('adminSupport')}
      actions={
        <div className="admin__tabs">
          {['', 'new', 'replied', 'resolved'].map((s) => (
            <button
              key={s || 'all'}
              type="button"
              className={`admin__tab ${status === s ? 'is-active' : ''}`.trim()}
              onClick={() => setStatus(s)}
            >
              {s ? t(`contactStatus${s.charAt(0).toUpperCase()}${s.slice(1)}`) : 'ALL'}
            </button>
          ))}
        </div>
      }
    >
      <div className="admin__filters">
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
      </div>
      {actionError ? <p className="ob-error">{actionError}</p> : null}

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
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7}>{t('adminSupportEmpty')}</td>
              </tr>
            ) : (
              rows.map((m) => (
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

      <AdminPager page={page} limit={limit} total={total} onPage={goPage} />
      {page * limit < total ? (
        <div className="admin__pager">
          <button className="btn btn--secondary btn--sm" onClick={viewMore}>
            {t('adminViewMore')}
          </button>
        </div>
      ) : null}
    </AdminShell>
  );
}