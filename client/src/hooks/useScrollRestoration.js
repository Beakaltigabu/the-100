import { useRef } from 'react';
import { useLocation } from 'react-router-dom';

// Preserves each page's scroll position across navigations (like the browser
// back button). On navigation, the previous page's scrollY is saved keyed by
// pathname; the new page restores its saved position instantly (or starts at
// the top for a first visit). Hash-only changes are ignored.
export default function useScrollRestoration() {
  const location = useLocation();
  const positions = useRef({});
  const lastKey = useRef(null);

  const key = location.pathname + location.search;
  if (key !== lastKey.current) {
    if (lastKey.current != null) {
      positions.current[lastKey.current] = window.scrollY;
    }
    const target = positions.current[key] || 0;
    if (Math.abs(window.scrollY - target) > 1) {
      window.scrollTo({ top: target, left: 0, behavior: 'instant' });
    }
    lastKey.current = key;
  }
}

// Renders nothing — just wires the restoration into the router tree.
export function ScrollRestore() {
  useScrollRestoration();
  return null;
}