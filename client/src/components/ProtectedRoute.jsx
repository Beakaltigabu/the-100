import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePageMeta } from '../hooks/usePageMeta';
import { LoadingState } from './States';

export default function ProtectedRoute({ children }) {
  const { user, loading, refresh } = useAuth();
  const [rechecked, setRechecked] = useState(false);

  // The context user can lag a freshly-created enrollment (e.g. a completed
  // onboarding that navigated here right after enroll). Re-verify from the
  // server once before bouncing an enrolled member back to /onboarding.
  useEffect(() => {
    if (rechecked || loading || !user) return;
    if (!user.hasEnrollment) {
      setRechecked(true);
      refresh();
    }
  }, [user, loading, rechecked, refresh]);

  if (loading) return <LoadingState />;
  if (!user) return <Navigate to="/login" replace />;
  // Wait for the one-time server re-check before deciding.
  if (!user.hasEnrollment && !rechecked) return <LoadingState />;
  // Members who authenticated but haven't committed to a challenge yet must
  // complete onboarding before using the dashboard/community/profile.
  if (!user.hasEnrollment) return <Navigate to="/onboarding" replace />;
  return children;
}

export function GuestRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingState />;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

export function AdminRoute({ children }) {
  usePageMeta({ title: 'Admin', path: '/admin', index: false });
  const { user, loading } = useAuth();
  if (loading) return <LoadingState />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.isAdmin) return <Navigate to="/" replace />;
  return children;
}