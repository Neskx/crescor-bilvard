/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv, type Plugin } from 'vite';

/**
 * Generates robots.txt and sitemap.xml from VITE_SITE_URL at build time, so the
 * canonical domain is configured in exactly one place.
 */
function seoFiles(siteUrl: string): Plugin {
  const base = siteUrl.replace(/\/+$/, '');
  return {
    name: 'crescor-seo-files',
    apply: 'build',
    generateBundle() {
      const today = new Date().toISOString().slice(0, 10);
      // Service pages for the initial catalogue (supabase/migrations/*_initial_services.sql).
      // Update this list if services are renamed or added in /admin.
      const serviceSlugs = ['invandig-rekond', 'utvandig-rekond', 'helrekond', 'polering-lackvard', 'kladsel-satesrengoring', 'specialbehandlingar'];
      const urls = [
        { loc: `${base}/`, priority: '1.0' },
        { loc: `${base}/tjanster`, priority: '0.9' },
        ...serviceSlugs.map((s) => ({ loc: `${base}/tjanster/${s}`, priority: '0.8' })),
        { loc: `${base}/boka`, priority: '0.9' },
        { loc: `${base}/om-oss`, priority: '0.6' },
        { loc: `${base}/kontakt`, priority: '0.6' },
        { loc: `${base}/integritetspolicy`, priority: '0.3' },
      ];
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source:
          `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
          urls.map((u) => `  <url><loc>${u.loc}</loc><lastmod>${today}</lastmod><priority>${u.priority}</priority></url>`).join('\n') +
          `\n</urlset>\n`,
      });
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: `User-agent: *\nAllow: /\nDisallow: /admin\n\nSitemap: ${base}/sitemap.xml\n`,
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const siteUrl = (env.VITE_SITE_URL || 'https://www.example.com').replace(/\/+$/, '');
  // Makes %VITE_SITE_URL% in index.html resolve even when the variable is unset.
  process.env.VITE_SITE_URL = siteUrl;

  return {
    plugins: [react(), tailwindcss(), seoFiles(siteUrl)],
    build: {
      target: 'es2022',
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/@supabase')) return 'supabase';
            if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) return 'react';
          },
        },
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./tests/setup.ts'],
      include: ['tests/unit/**/*.test.{ts,tsx}'],
      css: false,
    },
  };
});
