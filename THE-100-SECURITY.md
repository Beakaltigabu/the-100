# THE 100 — Security & Compliance

Security posture implemented in the code, plus the production deployment checklist
that must be followed before launch. Anything marked **[manual]** requires action in
your hosting/infrastructure, not code.

---

## In-place controls (code)

| Area | Control |
|---|---|
| Headers | Helmet: CSP, HSTS, COOP, CORP, nosniff, X-Frame-Options, Referrer-Policy |
| CORS | Single origin (`CLIENT_ORIGIN`) with `credentials: true` |
| Auth | JWT in httpOnly, `SameSite=Lax` cookie (Secure forced in prod via config validation) |
| Passwords | bcrypt(10); min 10 chars with letter + number; login lockout (5 fails → 15 min per ip:email) |
| Input | Zod validation on every route; 1 MB body cap; no file uploads |
| Injection | All queries via Knex (parameterized); display names sanitized |
| Webhooks | Strava HMAC-SHA1 + Telegram secret token — both compared with `timingSafeEqual` |
| Secrets at rest | Strava tokens AES-256-GCM (`ENCRYPTION_KEY`); JWT `algorithms: ['HS256']` + iss/aud |
| OAuth | Google & Strava `state` is a signed JWT (CSRF-safe); callbacks rate-limited |
| Rate limits | Global API guardrail + auth/login/register/forgot/reset/connect/OAuth/admin/webhook limiters |
| XSS | React escapes all output; no `dangerouslySetInnerHTML`/`eval`; build-time CSP for the SPA |
| PWA | Authenticated API endpoints removed from service-worker caching (privacy) |
| Privacy | Account deletion endpoint (`DELETE /api/profile`) with transactional cascade; FK cascades enforced |
| Reset | Password reset delivered only to the linked Telegram account; 15 min, single-use token |
| Audit | Admin actions logged to `admin_audit_log`; viewable at `/admin/audit` |
| Logging | Request logging (method/url/status/duration) on the API |

## Fail-closed config

In `NODE_ENV=production` the server **refuses to boot** unless:
- `JWT_SECRET` is set to a strong, non-default secret
- `ENCRYPTION_KEY` is set (32+ bytes)
- `CLIENT_ORIGIN` and `BASE_URL` are HTTPS
- `COOKIE_SECURE=true`

## Production deployment checklist

### [manual] Database
- [ ] Create a **dedicated MySQL user** (not `root`) with least privilege: `SELECT/INSERT/UPDATE/DELETE` on the `the100` DB only.
- [ ] Strong random password for the DB user; store in `DB_PASSWORD`.
- [ ] Enable **TLS** between API and MySQL (`ssl` in the Knex connection) if the host supports it.
- [ ] Run `npm run migrate:latest` in `db/` and confirm `knex_migrations` is up to date.
- [ ] Enable automated **backups** with tested restore.

### [manual] Secrets
- [ ] Generate secrets: `openssl rand -hex 32` for `JWT_SECRET` and `ENCRYPTION_KEY`.
- [ ] Set `JWT_SECRET`, `ENCRYPTION_KEY`, `STRAVA_CLIENT_SECRET`, `GOOGLE_CLIENT_SECRET`, `TELEGRAM_BOT_TOKEN` via a **secret manager** or env-only (never in the repo).
- [ ] Confirm `server/.env` is NOT deployed; real secrets never ship with the build.

### [manual] Transport & hosting
- [ ] Serve the API and client over **HTTPS only**; redirect HTTP → HTTPS (HSTS is already sent by Helmet).
- [ ] Correct the proxy hop count: `app.set('trust proxy', 1)` assumes exactly one TLS-terminating proxy. If you use a chain (CDN → LB → app), set it to the real hop count so `req.ip`/rate limits are accurate.
- [ ] Set `X-Forwarded-For`/`X-Forwarded-Proto` from the proxy only (never trust client-supplied values).
- [ ] **Do not use ngrok in production** — the public URL is ephemeral and regenerated per session.
- [ ] Static hosting/CDN: apply the same security headers Helmet sends (CSP from the build is injected into `index.html`; extend `connect-src` with the production API origin if it is **not** same-origin).

### [manual] Clients & keys
- [ ] Strava/Google/Twitter-style secrets rotated if they were ever committed or exposed.
- [ ] Set `STRAVA_REDIRECT_URI`/`GOOGLE_REDIRECT_URI` to the production HTTPS URLs and whitelist them in the provider consoles.

### [manual] Monitoring
- [ ] Wire up an error tracker / structured logs for the API process.
- [ ] Add alerts on: repeated 429s, failed webhook signatures, failed login bursts, DB backups.
- [ ] Run `npm audit` in `server/` and `client/` on a schedule and before each deploy.

### [manual] Bot / community group
- [ ] "Approve new members" is ON in THE 100 COMMUNITY group so the bot auto-approves linked members.
- [ ] `TELEGRAM_GROUP_LINK` points at the community group invite link.
- [ ] Re-register the webhook after any ngrok/host change: `npm run telegram:webhook:info` then `telegram:setwebhook -- set <url>`.

## Dependencies

- `react-router-dom` and Vite upgraded to versions that fix the open-redirect (CVE-2025-68470) and dev-server esbuild advisories.
- Server `npm audit` clean; run `npm audit fix` before deploys.

## Data retention (GDPR notes)

- Members can delete their own data via **Profile → Delete account** (password confirmed, transactional cascade).
- Consider a documented retention period for audit logs and admin records.
- Google/Strava authorizations can be revoked by the member (disconnect) and at the provider.