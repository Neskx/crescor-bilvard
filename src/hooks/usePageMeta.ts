import { useEffect } from 'react';
import { SITE } from '../config/site';

function setMeta(selector: string, attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
}

/** Per-route title, description, canonical URL and Open Graph tags. */
export function usePageMeta({ title, description, path, noindex = false }: { title: string; description: string; path: string; noindex?: boolean }) {
  useEffect(() => {
    const fullTitle = path === '/' ? title : `${title} – Crescor Bilvård`;
    const url = `${SITE.url}${path}`;
    document.title = fullTitle;
    setMeta('meta[name="description"]', 'name', 'description', description);
    setMeta('meta[property="og:title"]', 'property', 'og:title', fullTitle);
    setMeta('meta[property="og:description"]', 'property', 'og:description', description);
    setMeta('meta[property="og:url"]', 'property', 'og:url', url);
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = url;

    let robots: HTMLMetaElement | null = null;
    if (noindex) {
      robots = document.createElement('meta');
      robots.name = 'robots';
      robots.content = 'noindex';
      document.head.appendChild(robots);
    }
    return () => robots?.remove();
  }, [title, description, path, noindex]);
}
