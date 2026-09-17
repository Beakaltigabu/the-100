// Strip control characters, collapse whitespace, and trim display names.
function sanitizeName(name) {
  return String(name == null ? '' : name)
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

module.exports = { sanitizeName };