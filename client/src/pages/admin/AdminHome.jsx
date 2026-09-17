import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useLanguage } from '../../context/LanguageContext';
import Stat from '../../components/Stat';
import { LoadingState, ErrorState } from '../../components/States';
import './Admin.css';

export default function AdminHome() {
  const { t } = useLanguage();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api
      .get('/api/admin/stats')
      .then((d) => setStats(d.stats))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!stats) return null;

  return (
    <div className="admin page page--full">
      <div className="admin__head">
        <h1 className="admin__title">{t('adminHome')}</h1>
        <div className="row">
          <Link to="/admin/members">
            <button className="btn btn--primary btn--md">{t('adminMembers')}</button>
          </Link>
          <Link to="/admin/audit">
            <button className="btn btn--secondary btn--md">{t('adminAudit')}</button>
          </Link>
        </div>
      </div>

      <div className="admin__stats">
        <Stat label={t('members')} value={stats.members} />
        <Stat label={t('active')} value={stats.active} />
        <Stat label={t('telegram')} value={stats.telegramConnected} />
        <Stat label={t('activityRecording')} value={stats.stravaConnected} />
        <Stat label={t('finishers')} value={stats.completed} />
        <Stat label={t('totalLogged')} value={stats.totalValue} />
      </div>
    </div>
  );
}