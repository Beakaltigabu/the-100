// Only open known-safe URL schemes — deep links and group links come from the
// server, so a bad/compromised response must never hand the browser an
// arbitrary (e.g. javascript:) URL.
const ALLOWED_PROTOCOLS = new Set(['https:', 'http:', 'tg:']);

export function openSafeUrl(url) {
  try {
    const u = new URL(url, window.location.origin);
    if (!ALLOWED_PROTOCOLS.has(u.protocol)) return false;
    window.open(u.href, '_blank', 'noopener');
    return true;
  } catch {
    return false;
  }
}
