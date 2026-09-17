import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useLanguage } from '../../context/LanguageContext';
import StatusBadge from '../../components/StatusBadge';
import { LoadingState, ErrorState, EmptyState } from '../../components/States';
import './Admin.css';

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString();
}

export default function AdminMembers() {
  const { t } = useLanguage();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api
      .get('/api/admin/members')
      .then((d) => setMembers(d.members))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="admin page page--full">
      <div className="admin__head">
        <h1 className="admin__title">{t('adminMembers')}</h1>
        <Link to="/admin">
          <button className="btn btn--secondary btn--md">{t('back')}</button>
        </Link>
      </div>

      {members.length === 0 ? (
        <EmptyState title={t('noActivitiesYet')} />
      ) : (
        <div className="admin__table-wrap">
          <table className="admin__table">
            <thead>
              <tr>
                <th>{t('memberName')}</th>
                <th>{t('memberGoal')}</th>
                <th>{t('memberProgress')}</th>
                <th>{t('memberDay')}</th>
                <th>{t('memberStatus')}</th>
                <th>{t('memberTelegram')}</th>
                <th>{t('memberStrava')}</th>
                <th>{t('joined')}</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td>
                    <Link to={`/admin/members/${m.id}`} className="admin__link">
                      {m.name}
                    </Link>
                  </td>
                  <td>{m.goalValue}</td>
                  <td>{m.progress}</td>
                  <td>{m.day}</td>
                  <td>
                    <StatusBadge status={m.status} />
                  </td>
                  <td>{m.telegram ? '✓' : '—'}</td>
                  <td>{m.strava ? '✓' : '—'}</td>
                  <td>{formatDate(m.joined)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}