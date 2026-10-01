import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import Modal from '../components/Modal';
import PageSkeleton from '../components/PageSkeleton';
import ErrorBoundary from '../components/ErrorBoundary';
import { MemberProfileContent } from '../pages/MemberProfile';
import '../pages/MemberProfile.css';

// Social-style profile: opens a member's profile in a bottom-sheet modal on
// mobile / centered card on desktop (used from the community feed).
export default function MemberProfileModal({ memberId, onClose }) {
  const { t } = useLanguage();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    if (!memberId) return;
    setError('');
    setData(null);
    api
      .get(`/api/community/members/${memberId}`)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [memberId]);

  useEffect(load, [load]);

  return (
    <Modal open={!!memberId} onClose={onClose} title={t('your100')} variant="sheet">
      {error ? (
        <p>{error}</p>
      ) : data ? (
        <div className="member-profile member-profile--modal">
          {data.badges && data.badges.length ? (
            <div className="member-profile__badges">
              {data.badges.map((b) => (
                <span className="mp-badge" key={b.code} title={b.description}>
                  <span className="mp-badge__icon" aria-hidden="true">{b.icon}</span>
                  <span className="mp-badge__name">{b.name}</span>
                </span>
              ))}
            </div>
          ) : null}
          <ErrorBoundary>
            <MemberProfileContent data={data} />
          </ErrorBoundary>
        </div>
      ) : (
        <PageSkeleton variant="profile" />
      )}
    </Modal>
  );
}