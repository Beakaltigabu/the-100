import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useLanguage } from '../../context/LanguageContext';
import { LoadingState, ErrorState } from '../../components/States';
import './Admin.css';

export default function AdminAudit() {
  const { t } = useLanguage();
  const [entries, setEntries] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api
      .get('/api/admin/audit')
      .then((d) => setEntries(d.entries))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!entries) return null;

  return (
    <div className="admin page page--full">
      <div className="admin__head">
        <h1 className="admin__title">{t('adminAudit')}</h1>
        <Link to="/admin">
          <button className="btn btn--secondary btn--md">{t('backToHome')}</button>
        </Link>
      </div>

      {entries.length === 0 ? (
        <p className="admin__empty">{t('auditEmpty')}</p>
      ) : (
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
            {entries.map((e) => (
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
      )}
    </div>
  );
}