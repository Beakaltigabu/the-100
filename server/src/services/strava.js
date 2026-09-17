const config = require('../config');
const { encrypt, decrypt } = require('../lib/crypto');
const { guardCall, record } = require('./stravaRateLimit');

const TOKEN_URL = 'https://www.strava.com/oauth/token';
const API_URL = 'https://www.strava.com/api/v3';

function configured() {
  return !!(config.strava.clientId && config.strava.clientSecret && config.strava.redirectUri);
}

function authorizeUrl(state, scope = 'activity:read', redirectUri = config.strava.redirectUri) {
  const qs = new URLSearchParams({
    client_id: config.strava.clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope,
    state
  });
  return `https://www.strava.com/oauth/authorize?${qs.toString()}`;
}

async function exchangeCode(code) {
  guardCall();
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: config.strava.clientId,
      client_secret: config.strava.clientSecret,
      code,
      grant_type: 'authorization_code'
    })
  });
  record(res);
  if (!res.ok) {
    throw new Error(`Strava token exchange failed: ${res.status}`);
  }
  return res.json();
}

async function refreshAccessToken(refreshToken) {
  guardCall();
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: config.strava.clientId,
      client_secret: config.strava.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });
  record(res);
  if (!res.ok) {
    throw new Error(`Strava token refresh failed: ${res.status}`);
  }
  return res.json();
}

async function fetchActivity(accessToken, activityId) {
  guardCall();
  const res = await fetch(`${API_URL}/activities/${activityId}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  record(res);
  if (!res.ok) {
    throw new Error(`Strava fetch failed: ${res.status}`);
  }
  return res.json();
}

async function fetchRecentActivities(accessToken, { after, before, perPage = 50 } = {}) {
  guardCall();
  const qs = new URLSearchParams({ per_page: perPage });
  if (after) qs.set('after', after);
  if (before) qs.set('before', before);
  const res = await fetch(`${API_URL}/athlete/activities?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  record(res);
  if (!res.ok) {
    throw new Error(`Strava activities fetch failed: ${res.status}`);
  }
  return res.json();
}

async function deauthorize(accessToken) {
  guardCall();
  const res = await fetch('https://www.strava.com/oauth/deauthorize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: accessToken })
  });
  record(res);
  return res.ok;
}

function persistTokens(userId, tokens) {
  const payload = {
    encrypted_access_token: encrypt(tokens.access_token),
    encrypted_refresh_token: encrypt(tokens.refresh_token),
    token_expires_at: tokens.expires_at ? new Date(tokens.expires_at * 1000) : null,
    scope: tokens.scope || null,
    strava_athlete_id: tokens.athlete && tokens.athlete.id
  };
  return payload;
}

module.exports = {
  configured,
  authorizeUrl,
  exchangeCode,
  refreshAccessToken,
  fetchActivity,
  fetchRecentActivities,
  deauthorize,
  persistTokens
};