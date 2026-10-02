import { api } from '../api/client';

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// navigator.serviceWorker.ready can hang forever when no worker has activated yet
// (fresh load / registration race). Bound it so the UI never blocks on it, and
// prefer an ACTIVE worker (the one actually controlling the page).
async function getServiceWorker(timeoutMs = 6000) {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready.then((reg) => reg.active || reg),
      new Promise((_, rej) => setTimeout(() => rej(new Error('sw-ready-timeout')), timeoutMs))
    ]);
  } catch {
    return null;
  }
}

export async function getVapidPublicKey() {
  const r = await api.get('/api/push/vapid-public-key');
  return r.publicKey || null;
}

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await getServiceWorker();
  if (!reg) return null;
  try {
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

export async function subscribeToPush() {
  if (!pushSupported()) throw new Error('Push not supported');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Permission denied');
  const key = await getVapidPublicKey();
  if (!key) throw new Error('Push is not configured');
  const reg = await getServiceWorker();
  if (!reg) throw new Error('Service worker not ready — refresh and try again');
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key)
  });
  await api.post('/api/push/subscribe', { subscription: sub.toJSON() });
  return true;
}

export async function unsubscribeFromPush() {
  const sub = await currentSubscription();
  if (sub) {
    const endpoint = sub.endpoint;
    await sub.unsubscribe().catch(() => {});
    await api.del('/api/push/subscribe', { endpoint }).catch(() => {});
  }
}