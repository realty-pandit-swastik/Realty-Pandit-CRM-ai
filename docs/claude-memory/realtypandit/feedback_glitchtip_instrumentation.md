---
name: feedback-glitchtip-instrumentation
description: Every new backend route, service, worker, script, frontend component, API call, button handler, and PWA flow MUST be wired to GlitchTip (Sentry SDK). Errors must surface, not swallow.
metadata:
  type: feedback
---

# Every new code path must report to GlitchTip

**Rule (locked 2026-05-15):** When you write any new code — backend route, service, worker, cron job, one-shot script, frontend component, API helper, button handler, form submit, PWA flow — it MUST be connected to GlitchTip so failures land in the digest. No silent failures, no try/catch-swallow without a `captureException`.

**Why:** Today's GlitchTip audit caught real bugs that only existed because we shipped them (PrismaClientValidationError, template-not-found, logger-undefined, pdf null.width). Each one was visible in the digest within minutes of deploy. The instant we ship code that doesn't report errors, we lose that signal. A working button that silently fails is invisible — the user just thinks the product is broken.

**How to apply — for every new code path:**

### Backend (Express routes, services, workers, scripts)

1. Wrap every async handler in try/catch. In the catch, call `captureRouteError(error, req, { route: 'leads#reassign' })` (existing util at `src/utils/capture.ts`) OR `Sentry.captureException(error, { tags: { ... } })` for non-route code (workers, cron, scripts).
2. NEVER write `catch {}` or `catch (e) { console.log(e) }` — that's swallowing. If you intentionally suppress (rare), `Sentry.captureMessage('reason for suppression', 'warning')`.
3. One-shot scripts (`scripts/*.ts`): initialize Sentry at the top: `import '../src/sentry';` and wrap main in try/catch that captures before exit.
4. BullMQ workers: register the queue's error handler with `queue.on('failed', (job, err) => Sentry.captureException(err, { extra: { jobId: job.id, data: job.data } }))`.
5. **Sentry v10 reminder:** use `setupExpressErrorHandler(app)` not `app.use(...)`. See [[feedback_sentry_v10]].

### Frontend (React / axios / button handlers)

1. The shared `src/api/client.ts` has the global response interceptor — DON'T bypass it. If you write `fetch()` directly or `new Axios()`, add `Sentry.captureException` in `.catch()`. See [[feedback_axios_shared_client]].
2. Button onClick handlers wrapping API calls: `try { await client.patch(...) } catch (e) { Sentry.captureException(e, { tags: { action: 'reassignLead' } }); alert(...) }`. The alert is for the user; the capture is for us.
3. React Error Boundaries should already wrap routes. If you add a new top-level route, verify it's inside an ErrorBoundary that captures.
4. PWA / service worker: `navigator.serviceWorker.register().catch(e => Sentry.captureException(e))`. Today's admin-crm #4 (ServiceWorker update failure) is the canonical example — it IS captured, which is why we saw it. Keep it that way.

### Pipecat (Python voice)

- Wrap tool handlers in try/except and `sentry_sdk.capture_exception(e)`. Tool failures are silent to the caller otherwise.

### When you write or modify code, ASK YOURSELF:

- "If this function throws in production, will I see it in the GlitchTip digest tomorrow?"
- "If this button does nothing when clicked, will a captured error tell me why?"

If the answer is no to either, add instrumentation BEFORE shipping. Don't deploy and hope.

### Find what's NOT connected

When auditing the codebase for missing instrumentation, look for:
- `catch {}` or `catch (e) {}` empty / log-only blocks
- `.then().catch(console.error)` axios chains
- Top-level async IIFEs in scripts without try/catch
- BullMQ queues without `.on('failed', ...)`
- `<button onClick={...}>` where the handler does fetch/axios without try/catch

Grep starters:
```bash
grep -rn "catch *{ *}" agents/backend/src agents/frontend/src
grep -rn "catch (.*) *{ *console\." agents/backend/src agents/frontend/src
grep -rn "\.catch(console" agents/frontend/src
```

## Status — 6 hot-paths instrumented (2026-05-16)

These silent-failure sites were found + fixed + deployed:
- `pipecat/tools.py:484` — generic voice-tool dispatcher (was the worst: every tool failure invisible)
- `pipecat/pipeline.py:77,146,259` — caller-lookup / prefetch / tool-dispatcher (added module-level `_capture()` helper using `from instrument import sentry_sdk`)
- `services/notification_retry.ts:122` — permanent 3-attempt delivery failure + the nested prisma `.catch`
- `services/lead_qualification_caller.ts:259` — qual-call BullMQ `failed` handler
- `services/pipeline_crons.ts` — all 6 cron catches via shared `captureCronError(name, err)` helper
- `services/deal_notifications.ts:495,508,522` — visit-confirmation WhatsApp sends

Searchable Sentry tags now emitted: `tool`, `cron`, `worker`, `notify`, `stage`. The 3 empty-catch route files (api.ts:610, public.ts:1653, partner_agent.ts) were judged **defensible** — outer route handler already has `captureRouteError`; left as-is.

## Related

- [[feedback_sentry_v10]] — Sentry SDK v10 init pattern
- [[feedback_axios_shared_client]] — shared client carries CSRF + error interceptor
- [[reference_glitchtip_db_access.md]] — read the digest + bulk-resolve
- [[feedback_verify_before_done]] — verification artifacts include "0 new GlitchTip errors after deploy"
