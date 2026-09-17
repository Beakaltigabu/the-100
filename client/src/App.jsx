import { useEffect, Suspense, lazy } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import Navigation from './components/Navigation';
import InstallBanner from './components/InstallBanner';
import ProtectedRoute, { GuestRoute, AdminRoute } from './components/ProtectedRoute';
import Button from './components/Button';
import { LoadingState } from './components/States';
import { api } from './api/client';
import { useAuth } from './context/AuthContext';
import { useLanguage } from './context/LanguageContext';
import Register from './pages/Register';
import Login from './pages/Login';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import Community from './pages/Community';
import Profile from './pages/Profile';

// Route-level code splitting: less-frequent pages load on demand.
const Landing = lazy(() => import('./pages/Landing'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const AdminHome = lazy(() => import('./pages/admin/AdminHome'));
const AdminMembers = lazy(() => import('./pages/admin/AdminMembers'));
const AdminMemberDetail = lazy(() => import('./pages/admin/AdminMemberDetail'));
const AdminAudit = lazy(() => import('./pages/admin/AdminAudit'));

function NotFound() {
  const { t } = useLanguage();
  return (
    <div className="page stack" style={{ alignItems: 'center', textAlign: 'center' }}>
      <h1>404</h1>
      <p className="text-muted">{t('notFound')}</p>
      <Link to="/">
        <Button variant="primary">{t('backToHome')}</Button>
      </Link>
    </div>
  );
}

// Keeps the server aware of the member's language so the Telegram bot can
// message them in the right language.
function LanguageSync() {
  const { lang } = useLanguage();
  const { user } = useAuth();
  useEffect(() => {
    if (!user) return;
    const current = user.language || 'en';
    if (current !== lang) {
      api.put('/api/profile', { language: lang }).catch(() => {});
    }
  }, [lang, user]);
  return null;
}

export default function App() {
  return (
    <>
      <Navigation />
      <InstallBanner />
      <LanguageSync />
      <Suspense fallback={<LoadingState />}>
        <Routes>
          <Route
            path="/"
            element={
              <GuestRoute>
                <Landing />
              </GuestRoute>
            }
          />
          <Route
            path="/register"
            element={
              <GuestRoute>
                <Register />
              </GuestRoute>
            }
          />
          <Route
            path="/login"
            element={
              <GuestRoute>
                <Login />
              </GuestRoute>
            }
          />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />

          <Route path="/onboarding" element={<Onboarding />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/community"
            element={
              <ProtectedRoute>
                <Community />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin"
            element={
              <AdminRoute>
                <AdminHome />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/members"
            element={
              <AdminRoute>
                <AdminMembers />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/members/:id"
            element={
              <AdminRoute>
                <AdminMemberDetail />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/audit"
            element={
              <AdminRoute>
                <AdminAudit />
              </AdminRoute>
            }
          />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  );
}