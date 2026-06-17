---
name: Sentry v10 Express API
description: Sentry node v10 uses setupExpressErrorHandler(app) not app.use(expressErrorHandler()) — wrong API causes TS2769
type: feedback
---

Use `Sentry.setupExpressErrorHandler(app)` for Express error handling in `@sentry/node` v10+.

**Why:** `app.use(Sentry.expressErrorHandler())` causes TS2769 — `ExpressErrorMiddleware` is not assignable to `PathParams`. The v10 API takes the app directly instead of returning middleware.

**How to apply:** Any time Sentry is added to an Express/Node backend, use the new pattern:
```typescript
if (process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app); // after all routes, before custom errorHandler
}
```
Also: `aria-busy` must be a string `'true'/'false'` in JSX, not a boolean — the linter rejects boolean values for this ARIA attribute.
