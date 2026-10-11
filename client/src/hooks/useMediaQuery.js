import { useEffect, useState } from 'react';

// Subscribes to a CSS media query and returns whether it currently matches.
// Re-runs the provided setter (default: re-render) whenever the match flips —
// used to conditionally mount only the responsive DOM slot that is visible.
export function useMediaQuery(query, initial = () => false) {
  const [matches, setMatches] = useState(initial);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (e) => setMatches(e.matches);
    setMatches(mql.matches);
    if (typeof mql.addEventListener === 'function') mql.addEventListener('change', onChange);
    else mql.addListener(onChange);
    return () => {
      if (typeof mql.removeEventListener === 'function') mql.removeEventListener('change', onChange);
      else mql.removeListener(onChange);
    };
  }, [query]);

  return matches;
}