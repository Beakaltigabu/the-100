import { useEffect, Suspense, lazy } from 'react';
import { Routes, Route, Link, Navigate } from 'react-router-dom';
import Navigation from './components/Navigation';
import AppFooter from './components/AppFooter';
import InstallBanner from './components/InstallBanner';
import BroadcastBanner from './components/BroadcastBanner';
import PageSkeleton from './components/PageSkeleton';
import ErrorBoundary from './components/ErrorBoundary';
import { ScrollRestore } from './hooks/useScrollRestoration';
import ProtectedRoute, { GuestRoute, AdminRoute } from './components/ProtectedRoute';
import Button from './components/Button';
import { api } from './api/client';
import { useAuth } from './context/AuthContext';
import { useLanguage } from './context/LanguageContext';
import Register from './pages/Register';
import Login from './pages/Login';

// Route-level code splitting: everything except the landing/auth funnel loads
// on demand, keeping the first-visit bundle small.
const Onboarding = lazy(() => import('./pages/Onboarding'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Community = lazy(() => import('./pages/Community'));
const Profile = lazy(() => import('./pages/Profile'));
const Landing = lazy(() => import('./pages/Landing'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const AdminHome = lazy(() => import('./pages/admin/AdminHome'));
const AdminMembers = lazy(() => import('./pages/admin/AdminMembers'));
const AdminMemberDetail = lazy(() => import('./pages/admin/AdminMemberDetail'));
const AdminAudit = lazy(() => import('./pages/admin/AdminAudit'));
const AdminLogs = lazy(() => import('./pages/admin/AdminLogs'));
const AdminSupport = lazy(() => import('./pages/admin/AdminSupport'));
const AdminBroadcast = lazy(() => import('./pages/admin/AdminBroadcast'));
const AdminBroadcastComposer = lazy(() => import('./pages/admin/AdminBroadcastComposer'));
const AdminAnalytics = lazy(() => import('./pages/admin/AdminAnalytics'));
const Support = lazy(() => import('./pages/Support'));
const Privacy = lazy(() => import('./pages/Privacy'));

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
      <BroadcastBanner />
      <InstallBanner />
      <LanguageSync />
      <ScrollRestore />
      <main className="app-main">
        <ErrorBoundary>
          <Suspense fallback={<PageSkeleton />}>
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

          <Route path="/support" element={<Support />} />
          <Route path="/privacy" element={<Privacy />} />

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
          <Route path="/members/:id" element={<Navigate to="/community" replace />} />
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
          <Route
            path="/admin/logs"
            element={
              <AdminRoute>
                <AdminLogs />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/support"
            element={
              <AdminRoute>
                <AdminSupport />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/broadcast"
            element={
              <AdminRoute>
                <AdminBroadcast />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/broadcast/new"
            element={
              <AdminRoute>
                <AdminBroadcastComposer />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/broadcast/:id/edit"
            element={
              <AdminRoute>
                <AdminBroadcastComposer />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/analytics"
            element={
              <AdminRoute>
                <AdminAnalytics />
              </AdminRoute>
            }
          />

          <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
      <AppFooter />
    </>
  );
}