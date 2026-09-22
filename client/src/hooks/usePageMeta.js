import { useEffect } from 'react';

const SITE_URL = 'https://chooseyour100.com';

function setMeta(attr, nameOrProperty, content) {
  const isProperty = attr === 'property';
  const sel = isProperty
    ? `meta[property="${nameOrProperty}"]`
    : `meta[name="${nameOrProperty}"]`;
  let el = document.head.querySelector(sel);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(isProperty ? 'property' : 'name', nameOrProperty);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setCanonical(href) {
  let el = document.head.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

// Per-route SEO: updates title, description, canonical, robots and the social
// (Open Graph / Twitter) tags. index=false emits noindex for private pages.
export function usePageMeta({ title, description, path = '/', index = true }) {
  useEffect(() => {
    const url = `${SITE_URL}${path}`;
    document.title = title ? `${title} | THE 100` : 'THE 100';
    setMeta('name', 'description', description);
    setMeta('name', 'robots', index ? 'index, follow' : 'noindex, nofollow');
    setCanonical(url);
    setMeta('property', 'og:title', title);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:url', url);
    setMeta('name', 'twitter:title', title);
    setMeta('name', 'twitter:description', description);
  }, [title, description, path, index]);
}