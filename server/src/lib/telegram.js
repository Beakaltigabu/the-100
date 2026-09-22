// Pure helpers shared by the Telegram webhook handler. Kept side-effect free so
// they can be unit-tested without a database.

// Strict numeric distance parse: only plain numbers with an optional single
// decimal (e.g. "8.4" or "3"), capped at `max`. Returns null for anything else.
function parseCheckin(raw, max) {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim();
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(cleaned)) return null;
  const q = Number(cleaned);
  if (!Number.isFinite(q) || q <= 0) return null;
  const cap = Number(max);
  if (Number.isFinite(cap) && cap > 0 && q > cap) return null;
  return q;
}

// Best-effort language from a Telegram sender's language_code ("am" -> Amharic).
function resolveLanguage(languageCode) {
  const code = String(languageCode || '').toLowerCase();
  return code === 'am' || code.startsWith('am-') ? 'am' : 'en';
}

// Human label for the challenge start date, e.g. "September 21, 2026" (EN) or
// "ሴፕቴምበር 21, 2026" (AM). Gregorian month names transliterated for Amharic.
const AM_MONTHS = [
  'ጃንዋሪ',
  'የካቲት',
  'መጋቢት',
  'ሚያዝያ',
  'ግንቦት',
  'ሰኔ',
  'ሀምሌ',
  'ነሐሴ',
  'መስከረም',
  'ጥቅምት',
  'ህዳር',
  'ታህሳስ'
];

function formatStartDate(iso, lang) {
  const d = new Date(String(iso) + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return String(iso || '');
  const month = d.getMonth();
  const day = d.getDate();
  if (lang === 'am') {
    return `${AM_MONTHS[month]} ${day}, ${d.getFullYear()}`;
  }
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

module.exports = { parseCheckin, resolveLanguage, formatStartDate, AM_MONTHS };