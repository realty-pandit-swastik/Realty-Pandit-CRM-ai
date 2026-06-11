# GlitchTip Coverage Plan — Full Error Reporting Across Realty Pandit Services

**Status:** ✅ SHIPPED (code-side, 2026-05-12). Outstanding: 2 GlitchTip projects need creation by user, DSNs need to be pasted into server `.env` / `local.properties`, then `./push-update.sh` deploys everything.
**Date:** 2026-05-11 (planned) → 2026-05-12 (shipped)
**Author:** Claude (audit + plan + implementation), Varchasv (review + outstanding deploy actions)
**Builds on:** [2026-04-15-glitchtip-error-intelligence.md](2026-04-15-glitchtip-error-intelligence.md)
**Outcomes report:** [2026-05-12-glitchtip-coverage-shipped.md](2026-05-12-glitchtip-coverage-shipped.md)

---

## 1. Goal

Every production service must report errors to GlitchTip (`errors.realtypandit.in`) with enough context to debug them. Today, **two production services are completely uninstrumented**, and the three that are connected have **critical gaps** that silently lose entire classes of bugs (React render crashes, background worker failures, process-level crashes).

This plan closes every gap, scrubs PII before reporting, and tags errors with the exact git commit so we can pin regressions to deploys.

## 2. Service inventory & current coverage

| # | Service | Runtime | Process | DSN project | Current coverage |
|---|---|---|---|---|---|
| 1 | `agents/backend` | Node 20 / Express | PM2 `realty-backend` (cluster x2) | `/4` | ⚠️ Partial — init order wrong, ErrorBoundary-like gaps |
| 2 | `agents/frontend` | Vite/React (static) | Nginx | `/3` | ⚠️ Partial — React ErrorBoundary silent |
| 3 | `agents/website` | Next.js 15 | PM2 `realty-website` | (per env) | ✅ OK (sentry.*.config.ts present) |
| 4 | `agents/pipecat` | Python 3.11 / FastAPI | PM2 `panditji-voice` | **NEW project needed** | ❌ Zero instrumentation |
| 5 | `agents/android` | Kotlin / Compose | Staff mobile app | (per env) | ❌ Zero instrumentation |
| 6 | `agents/monitor` | Node script (cron) | scheduled task | — | N/A (it's the digest consumer) |
| 7 | `agents/browser-qa` | Node/Playwright | dev tool only | — | N/A (not production) |

## 3. Coverage matrix — what's captured vs lost today

| Scenario | Today | After plan |
|---|---|---|
| Frontend JS error in event handler | ✅ | ✅ |
| Frontend unhandled promise rejection | ✅ | ✅ |
| **Frontend React render crash (ErrorBoundary)** | ❌ silent | ✅ |
| Frontend axios call failure | ⚠️ partial | ✅ |
| Backend sync route error | ⚠️ no context | ✅ full context |
| Backend async route error (try/catch logs only) | ❌ silent | ✅ via wrapper |
| **Backend uncaughtException** | ❌ alert-only | ✅ |
| **Backend unhandledRejection** | ❌ alert-only | ✅ |
| **BullMQ worker job failure** | ❌ logger.error only | ✅ |
| **Scheduled worker failure** (lead nurture, escalation) | ❌ silent | ✅ |
| Prisma DB save failure | ⚠️ depends on caller | ✅ |
| WhatsApp send failure (Graph API) | ⚠️ depends on caller | ✅ |
| 99acres/Magic Bricks/Housing/Facebook sync error | ⚠️ depends on caller | ✅ |
| Razorpay webhook signature failure | ⚠️ depends on caller | ✅ |
| Multer file upload error | ⚠️ leaks to GlitchTip as noise | ✅ filtered |
| **Pipecat voice bot crash (Python)** | ❌ stdout/stderr only | ✅ |
| **Pipecat WhatsApp webhook error** | ❌ silent | ✅ |
| **Pipecat Gemini Live pipeline error** | ❌ silent | ✅ |
| **Android staff app crash** | ❌ Play Console only (if linked) | ✅ |
| **Android API call failure** | ❌ silent | ✅ |

## 4. GlitchTip project setup (do this first on the GlitchTip UI)

Before any code changes, create one **new project** on `errors.realtypandit.in`:

| Project name | Purpose | DSN goes into env var |
|---|---|---|
| `realty-admin-frontend` (existing, ID /3) | Admin CRM | `VITE_GLITCHTIP_DSN` |
| `realty-backend` (existing, ID /4) | Backend API | `GLITCHTIP_DSN` |
| `realty-website` (existing) | Public website | `NEXT_PUBLIC_GLITCHTIP_DSN` |
| **`panditji-voice` (NEW)** | Pipecat voice bot | `GLITCHTIP_DSN_PIPECAT` |
| **`realty-staff-android` (NEW)** | Android staff app | embedded in app via `sentry.properties` |

Why separate projects: voice and mobile errors look nothing like web errors. Mixing them makes triage harder and inflates issue counts.

---

## 5. Phase 1 — Backend (Node) hardening

### 5.1 Move `Sentry.init` to a dedicated `instrument.ts` (loaded first)

**Why:** `@sentry/node` v10 uses OpenTelemetry auto-instrumentation. It must patch the http/express/prisma modules BEFORE those modules are imported. Today, `Sentry.init` runs on line 60 of [app.ts](../../agents/backend/src/app.ts), AFTER ~50 route imports — so half the instrumentation is missed.

**Files affected:**
- NEW: `agents/backend/src/instrument.ts` — only does `Sentry.init`. Reads `GLITCHTIP_DSN`, `NODE_ENV`, release tag.
- `agents/backend/src/server.ts` — first line becomes `import './instrument';` (before `import 'dotenv/config'` even, since instrument also calls `dotenv/config`).
- `agents/backend/src/app.ts` — remove the `Sentry.init` block (lines 56-67). Keep `setupExpressErrorHandler` but feed it from `instrument.ts`.

### 5.2 Wire process-level handlers to GlitchTip

**Why:** Today, `process.on('uncaughtException')` and `process.on('unhandledRejection')` only call `alertCritical` (internal WhatsApp/email). GlitchTip is never told.

**File:** `agents/backend/src/server.ts:31-40`
- Add `SentrySDK.captureException(error)` inside both handlers.
- Keep the existing `alertCritical` calls.
- For `uncaughtException`, call `Sentry.flush(2000)` before `process.exit(1)` so the event is sent before the process dies.

### 5.3 Wrap BullMQ workers with Sentry

**Why:** [scheduled_worker.ts](../../agents/backend/src/queues/workers/scheduled_worker.ts) has 6+ `catch (err)` blocks that only `logger.error`. Lead-nurture, escalation-check, call-processing failures are all silent in GlitchTip.

**Files affected:**
- `agents/backend/src/queues/workers/scheduled_worker.ts` — every `catch (err) { logger.error(...) }` becomes `catch (err) { logger.error(...); SentrySDK.captureException(err, { tags: { worker: '...', job: '...' } }); }`. 6+ sites.
- `agents/backend/src/queues/workers/whatsapp_inbound.ts` — same treatment.
- Set Sentry `tags` per worker so issues group by `worker:scheduled` vs `worker:whatsapp_inbound`.

### 5.4 Stop Multer errors reaching GlitchTip

**Why:** The earlier fix added a `MulterError` branch to `error_handler.ts`, but `setupExpressErrorHandler` runs first and captures any error without `status >= 500`. `MulterError` has no status → still captured.

**File:** `agents/backend/src/app.ts:373-376`
- Add `shouldHandleError` filter to `setupExpressErrorHandler`:

```ts
SentrySDK.setupExpressErrorHandler(app, {
  shouldHandleError(err: any) {
    if (err instanceof multer.MulterError) return false; // handled by errorHandler → 4xx
    const status = err.status ?? err.statusCode ?? 500;
    return status >= 500;
  },
});
```

### 5.5 Add PII scrubbing via `beforeSend`

**Why:** Today request bodies hit GlitchTip as-is. Login passwords, JWTs, customer phones, Razorpay IDs would all leak.

**Where:** in the new `instrument.ts`:

```ts
SentrySDK.init({
  // ...
  beforeSend(event, hint) {
    // Scrub headers
    if (event.request?.headers) {
      delete event.request.headers['authorization'];
      delete event.request.headers['cookie'];
      delete event.request.headers['x-csrf-token'];
    }
    // Scrub request body
    if (event.request?.data && typeof event.request.data === 'object') {
      const data = event.request.data as Record<string, any>;
      ['password', 'password_confirm', 'token', 'refresh_token', 'otp', 'access_token', 'razorpay_payment_id', 'razorpay_order_id', 'razorpay_signature'].forEach(k => {
        if (k in data) data[k] = '[REDACTED]';
      });
      // Mask phone numbers in any string field: last 4 digits only
      Object.keys(data).forEach(k => {
        if (typeof data[k] === 'string' && /^[+]?[\d\s-]{10,15}$/.test(data[k])) {
          data[k] = data[k].slice(0, -4).replace(/\d/g, '*') + data[k].slice(-4);
        }
      });
    }
    return event;
  },
});
```

### 5.6 Tag errors with git commit SHA (release)

**Why:** Lets us answer "did this break after the May 9 deploy?" instantly.

**Two parts:**
1. Build step writes git SHA into a file the runtime reads:
   - Add to `agents/backend/scripts/write-release.sh` (NEW): `git rev-parse --short HEAD > .release.txt`
   - Call this from `deploy.sh` / `update-server.sh` before `pm2 reload`.
2. In `instrument.ts`:
   ```ts
   const release = fs.existsSync('.release.txt')
     ? fs.readFileSync('.release.txt', 'utf8').trim()
     : process.env.GIT_SHA || 'unknown';

   SentrySDK.init({ release, /* ... */ });
   ```

### 5.7 Helper for async route error capture (optional but recommended)

Many routes use `try/catch` with `logger.error` and return 500 manually — these don't bubble to `setupExpressErrorHandler`. A `captureAndPass` helper:

```ts
// agents/backend/src/utils/capture.ts
export function captureRouteError(err: unknown, req: Request, context: Record<string, any> = {}) {
  logger.error('Route error', { ...context, error: (err as Error).message });
  SentrySDK.captureException(err, {
    tags: { route: req.route?.path ?? req.path, method: req.method },
    extra: context,
  });
}
```

Then routes can `catch (err) { captureRouteError(err, req); return res.status(500).json({ error: 'Internal' }); }`. **Not changing existing routes in this plan** — just provide the helper. Each route gets migrated organically when touched.

---

## 6. Phase 2 — Frontend (Vite/React) hardening

### 6.1 Make `ErrorBoundary` report to GlitchTip

**Why:** [ErrorBoundary.tsx:23-25](../../agents/frontend/src/components/ErrorBoundary.tsx) is wrapping 7 sections of the app but only `console.error`s. React render crashes never reach GlitchTip.

**File:** `agents/frontend/src/components/ErrorBoundary.tsx`
- In `componentDidCatch`, call `SentrySDK.captureException(error, { contexts: { react: { componentStack: errorInfo.componentStack } } })`.
- Keep the existing UI fallback.

**Alternative considered:** swap our custom `ErrorBoundary` for `Sentry.ErrorBoundary` from `@sentry/react`. Rejected because our custom one has a tailored "Try Again" UX worth keeping.

### 6.2 Capture axios failures globally

**Why:** Today each route that calls an API has its own try/catch; many just `console.error`. GlitchTip never hears about most 5xx responses to the admin.

**File:** `agents/frontend/src/api/client.ts:51-121` (response interceptor)
- In the error path of the response interceptor, after auth-refresh logic but before `Promise.reject`, add:
  ```ts
  // Only report 5xx and network errors. 4xx is usually user error.
  const status = error.response?.status;
  if (!status || status >= 500) {
    SentrySDK.captureException(error, {
      tags: { axios: true, status: String(status ?? 'network') },
      extra: { url: error.config?.url, method: error.config?.method },
    });
  }
  ```

### 6.3 Add release tag + source maps

**Why:** Frontend errors in GlitchTip today show minified names like `aU` — unreadable.

**Files:**
- `agents/frontend/vite.config.ts` — set `build.sourcemap: 'hidden'` (generates maps but doesn't ship them in browser).
- `agents/frontend/package.json` — add `@sentry/vite-plugin` to devDeps. Add it to `plugins` in `vite.config.ts` with `org`, `project`, and `authToken` (GlitchTip-compatible).
- Build step uploads `.js.map` files to GlitchTip, then deletes them locally so they're not served publicly.
- `main.tsx` `SentrySDK.init` adds `release: import.meta.env.VITE_RELEASE` where `VITE_RELEASE` is set at build time from `git rev-parse --short HEAD`.

### 6.4 Add `beforeSend` PII scrubber (mirror backend)

Frontend mostly doesn't send PII to GlitchTip via Sentry (Sentry doesn't attach request bodies by default in browser), but breadcrumbs can contain XHR URLs with phone numbers in path params. Add a scrubber that masks phone-like strings in URLs.

---

## 7. Phase 3 — Pipecat (Python voice bot)

### 7.1 Add `sentry-sdk[fastapi]` dependency

**File:** `agents/pipecat/requirements.txt`
- Add: `sentry-sdk[fastapi]==2.20.0` (latest 2.x — GlitchTip compatible).

### 7.2 Init Sentry before FastAPI app creation

**File:** `agents/pipecat/main.py` (top of file, after `load_dotenv()`):

```python
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration
from sentry_sdk.integrations.logging import LoggingIntegration

GLITCHTIP_DSN_PIPECAT = os.getenv("GLITCHTIP_DSN_PIPECAT", "")
if GLITCHTIP_DSN_PIPECAT:
    sentry_sdk.init(
        dsn=GLITCHTIP_DSN_PIPECAT,
        environment=os.getenv("NODE_ENV", "production"),
        traces_sample_rate=0.1,
        release=open(".release.txt").read().strip() if os.path.exists(".release.txt") else None,
        integrations=[
            FastApiIntegration(transaction_style="endpoint"),
            StarletteIntegration(transaction_style="endpoint"),
            LoggingIntegration(level=None, event_level=None),  # don't auto-capture logs
        ],
        before_send=scrub_event,  # phone-number masking
    )
```

### 7.3 Wrap the Gemini Live pipeline

**File:** `agents/pipecat/pipeline.py`
- Wrap `run_pipeline_for_connection` with a try/except that captures and re-raises:
  ```python
  try:
      await actual_pipeline(...)
  except Exception as e:
      sentry_sdk.set_tag("pipecat.phase", "live_pipeline")
      sentry_sdk.capture_exception(e)
      raise
  ```

### 7.4 Webhook error capture

**File:** `agents/pipecat/main.py` — every webhook handler (Meta calling webhook) gets an explicit `try/except` at the top level. FastAPI's auto-error handling already captures via the FastApiIntegration, but explicit tags help triage.

### 7.5 Env var setup

- `agents/pipecat/.env.example` — add `GLITCHTIP_DSN_PIPECAT=`
- Production server `.env` for Pipecat needs the new DSN value once the GlitchTip project is created.

### 7.6 PM2 sets the release tag

**File:** `agents/pipecat/ecosystem.config.js`
- Add to deploy script: `git rev-parse --short HEAD > .release.txt && pm2 reload panditji-voice`

---

## 8. Phase 4 — Android staff app

### 8.1 Add Sentry Android SDK

**File:** `agents/android/app/build.gradle`
- Add to `dependencies`:
  ```gradle
  implementation 'io.sentry:sentry-android:7.18.0'
  implementation 'io.sentry:sentry-android-okhttp:7.18.0'
  ```
- Apply the Sentry Gradle plugin for source-map (R8/ProGuard mapping) upload:
  ```gradle
  plugins {
      id 'io.sentry.android.gradle' version '4.14.1'
  }

  sentry {
      includeProguardMapping = true
      autoUploadProguardMapping = true
      // org + project + authToken read from sentry.properties (gitignored)
  }
  ```

### 8.2 Init Sentry in Application class

**File:** `agents/android/app/src/main/java/com/realtypandit/staffapp/App.kt` (or wherever the `Application` class is)
- In `onCreate()`:
  ```kotlin
  SentryAndroid.init(this) { options ->
      options.dsn = BuildConfig.GLITCHTIP_DSN
      options.environment = if (BuildConfig.DEBUG) "debug" else "production"
      options.release = BuildConfig.VERSION_NAME + "+" + BuildConfig.VERSION_CODE
      options.tracesSampleRate = 0.1
      options.beforeSend = SentryOptions.BeforeSendCallback { event, _ ->
          // Mask phone numbers in breadcrumbs / extras
          maskPhoneNumbers(event)
          event
      }
  }
  ```
- Add `GLITCHTIP_DSN` as a `buildConfigField` (different value per `buildTypes.release` vs `debug`).

### 8.3 Wire Retrofit/OkHttp for network breadcrumbs

- Add the `sentry-android-okhttp` interceptor to the existing OkHttpClient builder (in whatever Hilt module sets up Retrofit). Captures every API call as a breadcrumb so when a crash happens, we see the last few API calls leading up to it.

### 8.4 R8/ProGuard mapping upload

- The Sentry Gradle plugin auto-uploads the mapping file on release builds — needed because release builds have `minifyEnabled true`. Without this, Android stack traces are unreadable (same problem as the frontend `aU` minified name).

### 8.5 Env / properties

- NEW file: `agents/android/sentry.properties` (gitignored) — contains org slug, project slug, and auth token for upload. Created once on dev machines.
- `agents/android/app/build.gradle` reads DSN from `local.properties` (already gitignored) for dev or from CI env var for release.

---

## 9. Phase 5 — Verification & monitoring

After deploy of each phase:

1. **Synthetic test:** trigger a known error in each service (debug endpoint `/debug-sentry` that throws). Confirm it lands in GlitchTip within 1 minute, tagged with correct release/environment.
2. **PII smoke test:** make a login attempt with a fake password, check the GlitchTip event for that request — confirm `password` field shows `[REDACTED]` and phone is masked.
3. **Re-run digest:** `mcp__realty-pandit-qa__glitchtip_digest` 24h after each deploy. Compare error volume.
4. **Source-map check:** open one frontend error in GlitchTip, confirm stack trace shows readable file/function names (not `aU`).
5. **Android crash test:** force an ANR or `throw RuntimeException("test")` from a debug menu, confirm it appears in GlitchTip with mapped stack.

---

## 10. Phased rollout & estimated effort

| Phase | Scope | Effort | Risk | Suggested order |
|---|---|---|---|---|
| 1 | Backend Node hardening (5.1–5.6) | 2-3h | Low — additive | First (highest impact) |
| 2 | Frontend hardening (6.1–6.4) | 1-2h | Low | Second |
| 3 | Pipecat Python instrumentation | 1-2h | Low (new project) | Third |
| 4 | Android SDK + mapping upload | 3-4h | Medium — needs new APK release | Fourth |
| 5 | Verification | 30 min per phase | None | After each phase |

Total: ~8-12 hours of work split across the four phases. Each phase is independently shippable.

---

## 11. Files that will change (final list for review)

**Backend (Phase 1):**
- NEW `agents/backend/src/instrument.ts`
- `agents/backend/src/server.ts`
- `agents/backend/src/app.ts`
- `agents/backend/src/queues/workers/scheduled_worker.ts`
- `agents/backend/src/queues/workers/whatsapp_inbound.ts`
- NEW `agents/backend/src/utils/capture.ts`
- `agents/backend/scripts/write-release.sh` (NEW)
- `deploy.sh` / `update-server.sh` (call write-release.sh)

**Frontend (Phase 2):**
- `agents/frontend/src/main.tsx`
- `agents/frontend/src/components/ErrorBoundary.tsx`
- `agents/frontend/src/api/client.ts`
- `agents/frontend/vite.config.ts`
- `agents/frontend/package.json` (add `@sentry/vite-plugin`)

**Pipecat (Phase 3):**
- `agents/pipecat/main.py`
- `agents/pipecat/pipeline.py`
- `agents/pipecat/requirements.txt`
- `agents/pipecat/.env.example`
- `agents/pipecat/ecosystem.config.js`

**Android (Phase 4):**
- `agents/android/app/build.gradle`
- `agents/android/build.gradle` (top-level — add Sentry plugin)
- `agents/android/app/src/main/java/.../App.kt`
- `agents/android/app/src/main/java/.../di/NetworkModule.kt` (or similar — OkHttp interceptor)
- NEW `agents/android/sentry.properties` (gitignored)

**GlitchTip dashboard (you):**
- Create new project `panditji-voice` → note the DSN.
- Create new project `realty-staff-android` → note the DSN.
- For source-map upload: create an org-level auth token, store on dev machines + CI.

---

## 12. Open questions / risks

1. **GlitchTip release support.** Confirmed-ish: GlitchTip implements the Sentry release API. If release tagging doesn't show up in the UI after Phase 1, fall back to using release as an extra tag.
2. **Source-map upload to GlitchTip.** `@sentry/vite-plugin` and the Sentry Android Gradle plugin both use the Sentry API spec. GlitchTip implements this but has known limitations on large maps — if uploads fail, switch to manual `sentry-cli sourcemaps upload`.
3. **Android DSN exposure.** The DSN is baked into the APK. This is normal — Sentry/GlitchTip DSNs are designed to be public; they only authorize event submission to a specific project. No secret leakage.
4. **Pipecat performance overhead.** `traces_sample_rate=0.1` is light; should not affect voice latency. If it does, drop to 0.0 (errors only, no perf traces).
5. **WhatsApp message content scrubbing.** Per the scoping discussion (2026-05-11), customer message content IS retained for debugging. If this changes, add `whatsapp_text`, `message`, `body.text` to the scrub list in §5.5.

---

## 13. Approval checkpoints

- [x] **Phase 1 (backend)** — Approved 2026-05-11, shipped 2026-05-11.
- [x] **Phase 2 (frontend)** — Approved 2026-05-11, shipped 2026-05-11.
- [x] **Phase 3 (Pipecat)** — Approved 2026-05-11, shipped 2026-05-11.
- [x] **Phase 4 (Android)** — Approved 2026-05-11, shipped 2026-05-11.
- [x] **Phase 5 (verification + critical-route migration)** — Auth, webhooks, payments routes migrated to `captureRouteError`. All builds clean.

See [2026-05-12-glitchtip-coverage-shipped.md](2026-05-12-glitchtip-coverage-shipped.md) for the final state, file-by-file diff summary, and deploy actions still on the user.
