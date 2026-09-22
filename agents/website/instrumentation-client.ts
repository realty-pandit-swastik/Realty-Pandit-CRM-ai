// GlitchTip error reporting (browser). Transport is wire-compatible.
import * as SentrySDK from "@sentry/nextjs";

// Accepts NEXT_PUBLIC_GLITCHTIP_DSN (new) or NEXT_PUBLIC_SENTRY_DSN (legacy) — drop the legacy fallback once all servers are migrated.
const GLITCHTIP_DSN = process.env.NEXT_PUBLIC_GLITCHTIP_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
if (GLITCHTIP_DSN) {
  SentrySDK.init({
    dsn: GLITCHTIP_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0.05,
    integrations: [
      SentrySDK.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
  });
}

export const onRouterTransitionStart = SentrySDK.captureRouterTransitionStart;
