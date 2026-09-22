import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useLanguage } from '../../context/LanguageContext';
import StatusBadge from '../../components/StatusBadge';
import { ErrorState } from '../../components/States';
import PageSkeleton from '../../components/PageSkeleton';
import AdminNav from './AdminNav';
import { activityLabelKey } from '../../lib/activity';
import './Admin.css';

export default function AdminMemberDetail() {
  const { t } = useLanguage();
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api
      .get(`/api/admin/members/${id}`)
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(load, [load]);

  if (loading) return <PageSkeleton variant="admin" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return null;

  const { user, enrollment, activities, integrations } = data;

  return (
    <div className="admin page page--full">
      <AdminNav />
      <div className="admin__head">
        <h1 className="admin__title">{user.name}</h1>
      </div>

      <div className="admin__detail">
        <div className="admin__detail-grid">
          <div className="stat">
            <div className="stat__label">{t('email')}</div>
            <div className="stat__value" style={{ fontSize: '1rem' }}>
              {user.email}
            </div>
          </div>
          <div className="stat">
            <div className="stat__label">{t('memberGoal')}</div>
            <div className="stat__value">
              {enrollment ? `${enrollment.goalValue} ${t(enrollment.goalUnit || 'km')}` : '—'}
            </div>
          </div>
          <div className="stat">
            <div className="stat__label">{t('memberStatus')}</div>
            <div className="stat__value">
              {enrollment ? <StatusBadge status={enrollment.status} /> : '—'}
            </div>
          </div>
          <div className="stat">
            <div className="stat__label">{t('memberTelegram')} / {t('memberStrava')}</div>
            <div className="stat__value" style={{ fontSize: '1rem' }}>
              {integrations.telegram.state} · {integrations.strava.status}
            </div>
          </div>
        </div>

        <div>
          <h2 className="admin__detail-label">{t('yourActivities')}</h2>
          <div className="stack--sm" style={{ marginTop: 8 }}>
            {activities.length === 0 ? (
              <p className="text-muted">{t('noActivitiesYet')}</p>
            ) : (
              activities.map((a) => (
                <div key={a.id} className="activity-row">
                  <div className="activity-row__body">
                    <div className="activity-row__distance">
                      {a.quantity} {t(a.activity_type === 'resistance' ? 'sessions' : 'km')}
                    </div>
                    <div className="activity-row__type">
                      {a.date} · {t(activityLabelKey(a.activity_type))} · {a.source}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}