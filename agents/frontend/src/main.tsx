import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as SentrySDK from '@sentry/react'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './contexts/AuthContext.tsx'
import { ThemeProvider } from './contexts/ThemeContext.tsx'
import { initAnalytics, initPwaTracking } from './lib/analytics'

// GlitchTip error reporting — uses the Sentry SDK as the wire-compatible transport.
// Active when VITE_GLITCHTIP_DSN is set in .env.production.
// Accepts VITE_GLITCHTIP_DSN (new) or VITE_SENTRY_DSN (legacy server .env name) — remove the legacy fallback once all servers are migrated.
const GLITCHTIP_DSN = import.meta.env.VITE_GLITCHTIP_DSN || import.meta.env.VITE_SENTRY_DSN;

// Release tag injected by Vite `define` at build time from git short SHA. See vite.config.ts.
// Falls back to 'unknown' for local dev.
declare const __APP_RELEASE__: string;
const APP_RELEASE = typeof __APP_RELEASE__ !== 'undefined' ? __APP_RELEASE__ : 'unknown';

// Mask phone-like strings: keep last 4 digits, mask the rest.
function maskPhone(value: string): string {
  if (typeof value !== 'string') return value;
  const cleaned = value.replace(/[\s-]/g, '');
  if (!/^[+]?\d{10,15}$/.test(cleaned)) return value;
  const last4 = cleaned.slice(-4);
  return cleaned.slice(0, -4).replace(/./g, '*') + last4;
}

const REDACT_KEYS = new Set([
  'password', 'password_confirm', 'new_password', 'old_password',
  'token', 'refresh_token', 'access_token', 'auth_token', 'jwt',
  'otp', 'csrf_token',
  'razorpay_payment_id', 'razorpay_order_id', 'razorpay_signature',
]);
const PHONE_KEY_HINTS = ['phone', 'mobile', 'whatsapp', 'msisdn', 'contact_number', 'phone_number'];

function scrubObject(obj: any, depth = 0): void {
  if (!obj || typeof obj !== 'object' || depth > 5) return;
  for (const key of Object.keys(obj)) {
    const lower = key.toLowerCase();
    if (REDACT_KEYS.has(lower)) {
      obj[key] = '[REDACTED]';
      continue;
    }
    if (PHONE_KEY_HINTS.some(h => lower.includes(h)) && typeof obj[key] === 'string') {
      obj[key] = maskPhone(obj[key]);
      continue;
    }
    if (typeof obj[key] === 'object') scrubObject(obj[key], depth + 1);
  }
}

if (GLITCHTIP_DSN) {
  SentrySDK.init({
    dsn: GLITCHTIP_DSN,
    environment: import.meta.env.MODE,
    release: APP_RELEASE,
    tracesSampleRate: 0.1,
    // Tag every event so this project can host multiple services — `service:` lets
    // dashboards filter web vs pipecat vs android even when they share one project.
    initialScope: { tags: { service: 'frontend' } },
    // Drop transient ServiceWorker registration noise from workbox-window (vite-plugin-pwa).
    // These fire on offline, mid-deploy 404 on sw.js, browser blocking, etc. — not real bugs.
    ignoreErrors: [
      /ServiceWorker/i,
      /Failed to update a ServiceWorker/,
      /wrsParams/,
    ],
    integrations: [SentrySDK.browserTracingIntegration()],
    beforeSend(event) {
      if (event.request?.data && typeof event.request.data === 'object') scrubObject(event.request.data);
      if (event.extra) scrubObject(event.extra);
      if (event.contexts) scrubObject(event.contexts);
      return event;
    },
    beforeBreadcrumb(breadcrumb) {
      // Mask phone numbers in URLs (path params like /api/leads/+919876543210)
      if (typeof breadcrumb.data?.url === 'string') {
        breadcrumb.data.url = breadcrumb.data.url.replace(
          /([+]?\d{10,15})/g,
          (m: string) => maskPhone(m),
        );
      }
      return breadcrumb;
    },
  });
}

window.addEventListener('unhandledrejection', (event) => {
  // Suppress transient SW update/register rejections — browser-level network blips, not app errors.
  const reason = String(event.reason ?? '');
  const r: any = event.reason;
  // vite-plugin-pwa auto-injects navigator.serviceWorker.register(); its rejection surfaces as a
  // bare `Error: Rejected` (name=Error, message=Rejected) that the string checks below miss.
  const isSwRegisterReject = r?.name === 'Error' && r?.message === 'Rejected';
  if (reason.includes('ServiceWorker') || reason.includes('serviceWorker') || reason.includes('wrsParams') || isSwRegisterReject) {
    event.preventDefault();
    return;
  }
  console.error('[UnhandledRejection]', event.reason);
  if (GLITCHTIP_DSN) {
    SentrySDK.captureException(event.reason);
  }
  event.preventDefault();
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Notify the app that a new SW has taken control — show update toast instead of reloading
    window.dispatchEvent(new CustomEvent('sw-update-ready'));
    console.log('[SW] New version installed. Refresh when ready.');
  });

}

initAnalytics();
initPwaTracking();

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found in DOM');

createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
)
