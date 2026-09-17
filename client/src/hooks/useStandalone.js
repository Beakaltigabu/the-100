import { useState, useEffect } from 'react';

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches;
}

function applyClass(value) {
  document.documentElement.classList.toggle('is-standalone', value);
}

// True when the app is running as an installed PWA (standalone window),
// i.e. launched from the home screen rather than a browser tab.
export default function useStandalone() {
  const [standalone, setStandalone] = useState(() => {
    if (typeof window === 'undefined') return false;
    return isStandalone();
  });

  useEffect(() => {
    applyClass(isStandalone());
    const mq = window.matchMedia('(display-mode: standalone)');
    const onChange = (e) => {
      setStandalone(e.matches);
      applyClass(e.matches);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return standalone;
}