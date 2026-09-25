import { API_BASE } from './config';

// Fired when any non-auth request comes back 401 — AuthContext registers here
// so an expired/invalidated session resets the user and route guards redirect.
let onUnauthorized = null;
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

async function request(method, path, body) {
  const opts = {
    method,
    headers: {},
    credentials: 'include'
  };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${API_BASE}${path}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // 401 on /api/auth/* is an expected credential failure, not an expired session.
    if (res.status === 401 && !path.startsWith('/api/auth/') && onUnauthorized) {
      onUnauthorized();
    }
    const err = new Error(data.error || 'Request failed');
    err.status = res.status;
    err.details = data.details;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  patch: (path, body) => request('PATCH', path, body),
  del: (path, body) => request('DELETE', path, body)
};