import { useState, useCallback } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { ErrorState } from '../../components/States';
import PageSkeleton from '../../components/PageSkeleton';
import AdminShell from '../../components/admin/AdminShell';
import { AdminPager, DateRange } from '../../components/admin/ui';
import { useAdminList } from '../../lib/adminList';
import './Admin.css';

export default function AdminAudit() {
  const { t } = useLanguage();
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const buildQuery = useCallback(() => ({ action, from, to }), [action, from, to]);
  const { rows, total, page, limit, loading, error, reload, viewMore, goPage } = useAdminList({
    path: '/api/admin/audit',
    dataKey: 'entries',
    buildQuery
  });

  if (loading && rows.length === 0) return <PageSkeleton variant="admin" />;
  if (error && rows.length === 0) return <ErrorState message={error} onRetry={reload} />;

  return (
    <AdminShell title={t('adminAudit')}>
      <div className="admin__filters">
        <input
          className="admin__filter-input"
          style={{ width: 220 }}
          placeholder="Action…"
          value={action}
          onChange={(e) => setAction(e.target.value)}
        />
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
      </div>

      {rows.length === 0 ? (
        <p className="admin__empty">{t('auditEmpty')}</p>
      ) : (
        <>
          <div className="admin__table-wrap">
            <table className="admin__table">
              <thead>
                <tr>
                  <th>{t('adminTime')}</th>
                  <th>{t('adminAdmin')}</th>
                  <th>{t('adminAction')}</th>
                  <th>{t('adminTarget')}</th>
                  <th>{t('adminIp')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id}>
                    <td>{new Date(e.ts).toLocaleString()}</td>
                    <td>{e.name}</td>
                    <td>{e.action}</td>
                    <td>
                      {e.target_type} {e.target_id ? `#${e.target_id}` : ''}
                    </td>
                    <td>{e.ip}</td>
                  </tr>
                ))}
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
        </>
      )}
    </AdminShell>
  );
}