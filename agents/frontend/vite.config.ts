
import { defineConfig } from 'vite'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { sentryVitePlugin } from '@sentry/vite-plugin'

// Read the deploy release tag (git short SHA) written by scripts/write-release.sh.
// Baked into the bundle so GlitchTip events carry the deploy commit.
function readRelease(): string {
  try {
    const releaseFile = resolve(__dirname, '.release')
    if (existsSync(releaseFile)) return readFileSync(releaseFile, 'utf8').trim()
  } catch { /* fall through */ }
  return process.env.VITE_RELEASE || 'unknown'
}
const APP_RELEASE = readRelease()

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __APP_RELEASE__: JSON.stringify(APP_RELEASE),
  },
  plugins: [
    react(),
    // GlitchTip source-map upload (uses Sentry-compatible API).
    // Active only when SENTRY_AUTH_TOKEN is set in the build env — otherwise no-op.
    // To enable: create an org-level auth token in GlitchTip, set in CI/deploy env.
    // After upload, the .map files are deleted from dist/ so they aren't served publicly.
    sentryVitePlugin({
      url: process.env.SENTRY_URL || 'https://errors.realtypandit.in',
      org: process.env.SENTRY_ORG || 'realty-pandit',
      project: process.env.SENTRY_PROJECT || 'realty-admin-frontend',
      authToken: process.env.SENTRY_AUTH_TOKEN,
      release: { name: APP_RELEASE },
      sourcemaps: {
        filesToDeleteAfterUpload: ['./dist/**/*.map'],
      },
      disable: !process.env.SENTRY_AUTH_TOKEN,
      silent: !process.env.SENTRY_AUTH_TOKEN,
    }),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MiB
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        importScripts: ['/sw-push.js'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Auth endpoints — NEVER cache (network-only)
            urlPattern: /\/api\/auth\//,
            handler: 'NetworkOnly',
          },
          {
            // API data — NEVER cache. This is a live sales CRM: a stale cached
            // inventory/leads/deals list (NetworkFirst fell back to cache on any
            // slow mobile request) made freshly-added records invisible to the
            // team member who created them, and blanked the email tab.
            // Freshness >> offline for CRM data. (2026-05-16, T2/T9a)
            urlPattern: /\/api\//,
            handler: 'NetworkOnly',
          },
          {
            // Google Maps tiles — cache-first, 30 days
            urlPattern: /^https:\/\/maps\.(googleapis|gstatic)\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'maps-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 30 * 24 * 60 * 60,
              },
            },
          },
        ],
      },
      manifest: {
        name: 'Realty Pandit Admin',
        short_name: 'RP Admin',
        description: 'Realty Pandit CRM Dashboard',
        start_url: '/',
        display: 'standalone',
        background_color: '#0f172a',
        theme_color: '#0f172a',
        orientation: 'portrait-primary',
        icons: [
          { src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  build: {
    // 'hidden' generates .map files for GlitchTip upload but doesn't write the
    // sourceMappingURL comment into JS, so browsers don't fetch maps from prod.
    // Maps are deleted from dist/ post-upload by sentryVitePlugin.
    sourcemap: 'hidden',
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:7071',
        changeOrigin: true,
        // Don't rewrite - backend expects /api prefix
      }
    },
    headers: {
      'Content-Security-Policy-Report-Only': [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://maps.googleapis.com",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https:",
        "connect-src 'self' http://localhost:7071 https://api.realtypandit.in https://www.google-analytics.com https://maps.googleapis.com",
        "frame-ancestors 'none'",
      ].join('; '),
    },
  }
})
