import { useEffect } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

// Reports session heartbeats (for "time on platform") and one-time PWA install
// while a user is signed in.
export default function SessionTracker() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    let sessionId = sessionStorage.getItem('the100_session_id');
    if (!sessionId) {
      sessionId = (crypto.randomUUID && crypto.randomUUID()) || `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem('the100_session_id', sessionId);
    }

    const beat = () => api.post('/api/session/heartbeat', { session_id: sessionId }).catch(() => {});
    beat();
    const iv = setInterval(beat, 60000);
    const onVis = () => { if (document.visibilityState === 'visible') beat(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVis); };
  }, [user]);

  useEffect(() => {
    if (!user || user.pwaInstalled) return;
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
      api.post('/api/session/installed').catch(() => {});
    }
  }, [user]);

  return null;
}
