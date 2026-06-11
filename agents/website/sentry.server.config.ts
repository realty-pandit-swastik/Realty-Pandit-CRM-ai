// GlitchTip error reporting (server). File is named sentry.* because @sentry/nextjs
// auto-discovers it by that exact filename — do not rename. Transport is wire-compatible.
import * as SentrySDK from "@sentry/nextjs";

// Accepts GLITCHTIP_DSN / NEXT_PUBLIC_GLITCHTIP_DSN (new) or the legacy SENTRY_DSN / NEXT_PUBLIC_SENTRY_DSN names — drop the legacy fallbacks once all servers are migrated.
const GLITCHTIP_DSN =
  process.env.GLITCHTIP_DSN ||
  process.env.NEXT_PUBLIC_GLITCHTIP_DSN ||
  process.env.SENTRY_DSN ||
  process.env.NEXT_PUBLIC_SENTRY_DSN;
if (GLITCHTIP_DSN) {
  SentrySDK.init({
    dsn: GLITCHTIP_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
  });
}
