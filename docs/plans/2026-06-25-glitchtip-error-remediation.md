# Plan — GlitchTip Error Remediation & Noise Cleanup

**Date:** 2026-06-25
**Author:** Claude (investigation + plan)
**Status:** ✅ EXECUTED 2026-06-25 (see Execution Log at end)
**Trigger:** Full error/bug review of production GlitchTip (0 CRITICAL · 33 HIGH · 1 LOW as of 2026-06-25 11:26 IST). Investigation found the "33 HIGH" is ~85% noise and that the genuine actionable issues share one root cause.

---

## 1. Executive summary

GlitchTip shows **0 critical** errors and the site is healthy (all endpoints HTTP 200, latest QA scan 0-critical). The scary "33 HIGH" count is misleading:

- **3 of the 4 "real" issues are one root cause** — business-rule rejections (validation) are thrown as plain `Error`, caught by manual `try/catch`, returned as **HTTP 500**, and pushed to GlitchTip as exceptions. The codebase *already has* the correct machinery (`AppError`/`ValidationError` + global `errorHandler`); the affected routes just don't use it.
- **1 issue (#10 ServiceWorker) is already fixed in code** but still accumulating from old cached PWA bundles → verify deploy + resolve.
- **~29 issues are pure noise** — one Pipecat voice session's teardown artifacts (2026-06-15) + self-fired `[coverage-test]` probes.

This plan fixes the root cause, clears the noise, and adds light guards so the tracker stops lying about severity.

---

## 2. Root-cause analysis (evidence)

### Finding 1 — Validation rejections mislabeled as 500 + captured (issues #105, #16, #97)

The unifying defect: **a thrown business-rule error → blanket `catch` → `captureRouteError()` + `res.status(500)`.**

| Issue | App | Where | What actually happened |
|---|---|---|---|
| **#105** | Backend | `workflows/workflow_engine.ts:496` | "own number" owner guard does `throw new Error('You cannot use your own number…')`. |
| **#16** | Admin CRM | `routes/workflow.ts:307-311` | `/api/workflow/commit` catch maps **every** thrown error to **500**; admin axios interceptor (`api/client.ts:124`) reports `status >= 500` → surfaces as "AxiosError 500". |
| **#97** | Backend | `routes/deals.ts:243-248` (+ `transactions.ts:198-202`) | `transaction_state_machine.ts:124` correctly rejects an illegal stage-skip; route maps it to **400** (correct) but calls `captureRouteError` **unconditionally first**, so a valid 400 still hits GlitchTip. |

**Key facts:**
- `#105` and the `#16` "own number" occurrences are the **same event** (one agent submit → backend 500 → frontend axios 500).
- These are **not crashes** — they are intentional user-input rejections (agent typed their own number as owner; agent dragged a deal card across two stages).
- The **edit path already does it right**: `routes/inventory.ts:868` returns a clean `res.status(400)` for the same "own number" rule, no capture. Only the **add/commit path** (`workflow_engine.commit`) is wrong.
- The correct tooling already exists:
  - `middleware/error_handler.ts` defines `AppError` (with `statusCode`), `ValidationError` (400), `AuthError` (401), `ForbiddenError` (403), `NotFoundError` (404).
  - The global `errorHandler` returns `err.statusCode` for `AppError` and logs it as `warn` (not captured). Multer + CORS errors are already special-cased to clean 4xx "instead of a 500 + alert + GlitchTip noise" — exact precedent for what we want.
  - `utils/capture.ts → captureBackgroundError` already **skips** benign OAuth-scope errors — precedent for a skip guard in `captureRouteError`.

### Finding 2 — ServiceWorker "Error: Rejected" (#10, 38×) — fixed in code, deploy-lagged

- `main.tsx:64-68` already sets `ignoreErrors: [/ServiceWorker/i, /Failed to update a ServiceWorker/, /wrsParams/]`.
- `main.tsx:95-98` already preventDefaults the exact rejection shape (`name='Error'`, `message='Rejected'`, the `wrsParams…register` source).
- Still accumulating because old cached PWA bundles (pre-guard) remain live on clients (known PWA stale-bundle behavior). **No new code required** — confirm the guarded bundle is the deployed one, then resolve the issue; it ages out as clients pick up the new shell.

### Finding 3 — Noise (~29 issues, no code)

- **#76–#94, #33, #39, #87, #88** — Pipecat "Task was destroyed but it is pending" / "coroutine ignored GeneratorExit" / "cancel_task" — all from a **single voice session on 2026-06-15**, 1× each. Pipeline *teardown* artifacts, not errors.
- **#98–#104** — `[coverage-test]` synthetic probes fired during the 2026-06-23 instrumentation audit.

### Finding 4 — Operational (outside GlitchTip)

- `server_health` MCP reports "Nginx CRITICAL" — **false alarm**: it SSHes with `/tmp/rp_key`, but `/tmp` is wiped, so the login fails; all 4 HTTP endpoints returned 200. The monitor can't authenticate, the server is fine.
- `incident_meta_app_deleted.md` memory is marked OPEN but Meta has been live since 2026-05-17 (webhooks + ads) — stale, should be closed.
- `info@realtypandit.in` inbound mail has bounced since ~Apr 20 (not in Postfix maps). Owner said "leave it for now" — keep flagged, do **not** action unless greenlit.

---

## 3. The plan

### Theme A — Stop misclassifying validation rejections *(core code work; fixes #105, #16, #97)*

Reuse `middleware/error_handler.ts` `ValidationError`. Four small edits:

1. **`utils/capture.ts` — add a 4xx skip guard to `captureRouteError`.**
   - Import `AppError` from `../middleware/error_handler`.
   - At the top of `captureRouteError`: if `err instanceof AppError && err.statusCode < 500`, `logger.warn(...)` and **return** (no `SentrySDK.captureException`).
   - *Single most defensive change* — even routes that keep their manual `captureRouteError` call stop polluting GlitchTip with 4xx. Mirrors the existing benign-skip in `captureBackgroundError`.

2. **`workflows/workflow_engine.ts:496` — throw a typed error.**
   - `throw new Error('You cannot use your own number…')` → `throw new ValidationError('You cannot use your own number as the property owner. Enter the actual owner number (or the partner agent number).')`.

3. **`routes/workflow.ts` `/commit` catch (307-311) — honor `AppError.statusCode`.**
   - Replace blanket `res.status(500)` with: if `err instanceof AppError`, return `res.status(err.statusCode).json({ error: err.message })`; else keep current 500 path. `captureRouteError` (now guarded) won't capture the 400.
   - Result: own-number submit returns **400** with a clear message → kills #105 and the #16 contribution.
   - *Consider* applying the same `AppError`-aware catch to the other `/workflow/*` handlers in this file for consistency (low risk, optional within this theme).

4. **`services/transaction_state_machine.ts:124` — throw `ValidationError` for invalid transitions.**
   - `throw new Error('Invalid transition: …')` → `throw new ValidationError('Invalid transition: …')`.
   - Simplifies the string-match status mapping in `routes/deals.ts:246-247` and `routes/transactions.ts:201` (can keep them as-is — they already return 400 — but the capture guard now prevents the #97 GlitchTip entry). No behavior change for valid transitions.

5. **Frontend confirm (no/low code).** Verify the admin Add-Inventory submit surfaces `error.response.data.error` as a toast so the agent sees "enter the actual owner number" rather than a silent failure. If it already does, no change.

**Files touched:** `utils/capture.ts`, `workflows/workflow_engine.ts`, `routes/workflow.ts`, `services/transaction_state_machine.ts` (+ frontend toast check).
**Risk:** Low. Narrows status codes + logging only; no change to successful submits or to the valid-transition path. Backend runs `ts-node --transpile-only` (type errors don't crash; only syntax does). Add/adjust unit tests for the own-number 400 and invalid-transition 400.

### Theme B — ServiceWorker #10 *(verify + resolve, ~no code)*

- Confirm the deployed admin bundle contains the `main.tsx` guards (`ignoreErrors` + `isSwRegisterReject`). If the live bundle predates them, rebuild (`tsc -b && vite build`) + deploy and bump the SW stamp.
- Once confirmed deployed, **resolve #10** in GlitchTip. Expect occurrences to stop as clients pick up the new shell.
- If it still recurs *after* a confirmed fresh deploy, investigate the real `register()` rejection (sw.js 404 mid-deploy, scope mismatch) — out of scope for this pass unless it reappears.

### Theme C — GlitchTip noise cleanup *(DB only; optional pipecat guard)*

- Bulk-resolve via the documented direct-DB path (`reference_glitchtip_db_access.md`):
  - `[coverage-test]` probes: `#98, #99, #100, #101, #102, #103, #104` → status = 1 (resolved).
  - Pipecat 2026-06-15 teardown cluster: `#76`–`#94`, `#33`, `#39`, `#87`, `#88` → status = 2 (ignored) or 1 (resolved).
  - Optional standing sweep: `UPDATE issue_events_issue SET status = 2 WHERE last_seen < NOW() - INTERVAL '30 days' AND status = 0;`
- **Optional hardening** (small pipecat code change): filter "Task was destroyed but it is pending" / "GeneratorExit" / "cancel_task" teardown messages from `sentry_sdk.capture_exception` so the next voice session doesn't re-spam. Mirrors `captureBackgroundError`'s skip list. *(Defer if we want to keep this pass DB-only.)*

### Theme D — Operational housekeeping

- **`server_health` SSH key path** — repoint the QA MCP server's key off the wiped `/tmp/rp_key` to a persistent location (e.g. `~/.ssh/realty_pandit_key`) so PM2/nginx checks authenticate and stop false-alarming. (Change in the MCP server config/script, not the app.)
- **Close stale memory** — update `incident_meta_app_deleted.md` to RESOLVED (Meta live since 2026-05-17); adjust the memory index line.
- **`info@` inbound email** — keep flagged in PROJECT_STATUS / memory as a known open item. **Do not action** (owner deferred). Documented in `reference_info_email_inbound_broken.md`.

---

## 4. Sequencing

1. **Theme A** (code) — branch/edit the 4 backend files + add unit tests → run `npx tsc --noEmit` message-diff vs baseline (no NEW errors) + `vitest` for the new cases.
2. **Theme C** (DB cleanup) — resolve noise so post-deploy digest is clean and Theme A's effect is visible.
3. **Theme B** — verify/redeploy admin bundle, resolve #10.
4. **Deploy A** via deploy script (`agents/deployment/deploy-agent.js backend`) → `pm2 restart realty-backend`. No prisma/schema change, so no `prisma generate` needed.
5. **Theme D** — MCP key path + memory closes (independent, any time).
6. **Verify** (see §5), then update `PROJECT_STATUS.md`.

## 5. Verification

- **A:** Reproduce on prod/staging — submit add-inventory with agent's own number → expect **400** + toast, **no** new GlitchTip event. Drag a deal VISIT_SCHEDULED→NEGOTIATION → expect **400**, no new GlitchTip event. Valid owner submit + valid transition still succeed.
- **B:** Hard-refresh admin, confirm new bundle hash; `navigator.serviceWorker` no longer emits captured rejections; #10 stops growing.
- **C:** GlitchTip digest re-run shows the resolved IDs gone from the unresolved list.
- **Overall:** next nightly `glitchtip_digest` HIGH count drops from 33 to a small handful (only genuine 5xx, if any).

## 6. Rollback

- Backend is non-built `src/` over `ts-node`; each changed `.ts` was md5-backed-up before scp (per `feedback_prod_backend_paths.md`). Restore the backup + `pm2 restart realty-backend` to revert.
- DB status changes are reversible (`SET status = 0`).

## 7. Out of scope / explicitly deferred

- Pending-task work (Deal-AI live WhatsApp tests, 99acres email, BHK backfill, etc.) — tracked separately in `backlog/PENDING.md`.
- `info@` email fix — owner-deferred.
- Deep dive into any *new* 5xx that appears after Theme A clears the 4xx noise — handle as it surfaces.

## 8. Open questions for owner

- Theme C: resolve (status=1) vs ignore (status=2) for the Pipecat teardown cluster? (Recommend ignore — they're shutdown artifacts that may recur.)
- Theme C optional: include the pipecat-side capture filter now, or keep this pass DB-only?

---

## 9. Execution Log (2026-06-25)

**Theme A — validation-error fix (DEPLOYED):**
- Edited `utils/capture.ts` (4xx `AppError` skip guard), `workflows/workflow_engine.ts` (own-number → `ValidationError`), `routes/workflow.ts` (`/commit` honors `AppError.statusCode` → 400), `services/transaction_state_machine.ts` (invalid transition → `ValidationError`).
- Tests: extended `transition_noop.test.ts` + new `capture_route_error.test.ts` — **6/6 pass**; touched files type-clean.
- Deploy: md5/diff parity-checked each server file (only intended changes), backed up to `/root/backups/glitchtip-fix-20260625/`, scp'd 4 files, `pm2 restart realty-backend`. Both cluster instances online (restart 250→251, no crash loop), no import errors, API `/health` = 200.

**Theme C — noise cleanup + pipecat filter (DONE):**
- GlitchTip DB: resolved 7 `[coverage-test]` probes (#98–104) + the 22-issue 2026-06-15 voice-session teardown cluster (#33,39,76–95). Then resolved the now-fixed #10/#16/#97/#105. **Unresolved 34 → 4.**
- `pipecat/instrument.py`: added `task_manager:cancel_task` to the `_before_send` benign list (#87); deliberately kept `[Pipeline] runner failed` (#88). Staged + `pm2 restart panditji-voice` (no active call interrupted; Pipecat booted clean). **Filter live.**

**Theme B — ServiceWorker #10 (VERIFIED + RESOLVED):**
- Confirmed the deployed admin bundle (`/var/www/realty-pandit/frontend/dist`) already contains the SW guard (`wrsParams`/`ignoreErrors`). The 38 hits were old cached service workers. Resolved #10 (reopens if it recurs post-cache-refresh).

**Theme D — housekeeping (DONE):**
- `agents/monitor/run.js`: replaced the `/tmp/rp_key` copy (Windows /tmp split-brain → false "Nginx CRITICAL") with the persistent source key, quoted the `-i` path. Verified: monitor now reads PM2/disk/nginx (Nginx: active). Revealed pipecat's pm2 name is `panditji-voice`.
- Closed stale `incident_meta_app_deleted.md` memory → RESOLVED (kept as recovery runbook).

**Remaining unresolved in GlitchTip (4) — flagged, out of this pass's scope:**
- `#106` main-website `AbortError` — benign transient fetch abort (1×).
- `#72` "Error", `#73` "The service is currently unavailable.", `#74` `PrismaClientKnownRequestError` — backend, all last-seen 2026-06-13, not recurring. Worth a separate look if they reappear.

**Monitor follow-up (noted, not done):** `run.js` warns on cumulative `restart_time` (>10) — 251 lifetime restarts is normal, not an incident. The heuristic should track restart *rate*, not the lifetime counter. Minor.
