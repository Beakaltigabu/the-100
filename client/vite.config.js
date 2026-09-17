import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Injects a strict CSP into the built index.html only (dev keeps the
// react-refresh inline preamble working). connect-src allows the API origin
// (VITE_API_URL), which may be cross-origin in production.
function cspPlugin() {
  const apiOrigin = process.env.VITE_API_URL || 'https://api.chooseyour100.com';
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    'font-src https://fonts.gstatic.com data:',
    "img-src 'self' data:",
    `connect-src 'self' ${apiOrigin}`,
    "object-src 'none'",
    "form-action 'self'"
  ].join('; ');
  return {
    name: 'html-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta name="theme-color"',
        `<meta http-equiv="Content-Security-Policy" content="${csp}" />\n    <meta name="theme-color"`
      );
    }
  };
}

export default defineConfig({
  plugins: [
    react(),
    cspPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true
      },
      includeAssets: ['icon.svg', 'icons/*.png'],
      manifest: {
        name: 'THE 100',
        short_name: 'THE 100',
        description: '100 days. Your goal. Your commitment.',
        theme_color: '#101010',
        background_color: '#101010',
        display: 'standalone',
        start_url: '/',
        lang: 'en',
        icons: [
          { src: '/icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-css' }
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          }
        ]
      }
    })
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true
      }
    }
  }
});