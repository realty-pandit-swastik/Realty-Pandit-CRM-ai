# Plan — Fix admin inventory submit logout (Bug A + Bug B)

**Status:** ✅ SHIPPED 2026-05-12 — both bugs fixed and verified live with Playwright. Release tag: `aa176bd-inv-fix`.
**Date:** 2026-05-12
**Severity:** High. Every admin inventory submission was failing with logout. Reproduced live via Playwright on production, fix verified live via Playwright after deploy.
**Companion investigation:** [Playwright reproduction notes](#) (in conversation thread 2026-05-12)

## Outcome summary

| Call | Before fix | After fix |
|---|---|---|
| `POST /api/workflow/commit` (cookies + CSRF, no Bearer) | 401 "Session expired" | **201 Created** — real inventory persisted (then deleted via DB) |
| `POST /auth/refresh` (no CSRF header) | 403 "CSRF validation failed" | **200 OK + new JWT** |
| `POST /auth/refresh` (with CSRF header — control) | 200 OK | 200 OK (unchanged) |

End-to-end behavior change: admin submit now works without the logout cascade. Side effect: a synthetic test inventory `RP-UNK-GEN-20389` (id `0182aae3-7133-444b-8875-eb12e8d1f9d5`) was created during verification and immediately deleted via direct Prisma call.

**Deploy artifacts:**
- Production backup: `/root/backups/inventory-fix-pre-20260512_135043/{csrf.ts,workflow.ts}` (rollback path documented in §6)
- Release tag in `.release.txt`: `aa176bd-inv-fix`

---

## 1. What this fixes

Symptom: when a team member clicks the final "Submit" button on Add Inventory, the request fails and they are redirected to the login screen.

Root cause: **two compounding backend bugs** (proven on production with a logged-in test session):

| # | Bug | File | Behavior |
|---|---|---|---|
| **A** | `/api/workflow/commit` only reads `Authorization: Bearer` header — ignores the `rp_access_token` HttpOnly cookie that admin frontend uses | `agents/backend/src/routes/workflow.ts:274-293` | Returns `401 "Session expired"` to every admin submit |
| **B** | `/auth/refresh` is NOT in the csrfExempt list, but the frontend's interceptor calls it via raw `axios.post()` which doesn't attach `X-CSRF-Token` | `agents/backend/src/middleware/csrf.ts:65-85` (backend) + `agents/frontend/src/api/client.ts:107` (frontend, leave as-is) | Returns `403 "CSRF validation failed"` → frontend dispatches `session-expired` → user is logged out |

Bug A causes the 401. Bug B turns the 401 into a logout. Both need to be fixed.

---

## 2. Exact code changes

### Change 1 — Fix Bug B (csrf.ts) — **1 line added**

**File:** `agents/backend/src/middleware/csrf.ts`

**Why safe:** The `rp_refresh_token` cookie is set with `httpOnly: true, sameSite: 'lax', path: '/auth/refresh'`. Modern browsers will NOT send `sameSite: 'lax'` cookies on cross-origin POST requests, so cross-origin CSRF attacks against `/auth/refresh` are blocked at the cookie layer. The CSRF check is therefore redundant for this endpoint. Industry-standard pattern (Sentry, GitHub, Stripe all exempt refresh endpoints from CSRF when using HttpOnly refresh cookies).

**Diff:**

```diff
     const csrfExempt = [
         '/auth/login',
         '/auth/setup',
+        '/auth/refresh',
         '/auth/forgot-password',
         '/auth/verify-reset-otp',
         '/auth/resend-otp',
         '/auth/setup-password',
         '/auth/validate-setup-token',
```

### Change 2 — Fix Bug A (workflow.ts) — **~10 lines modified**

**File:** `agents/backend/src/routes/workflow.ts`

**Why safe:** Adds a cookie-token read that mirrors the existing `authMiddleware` pattern (which already has security review). Preserves the Bearer fallback for `web`/`whatsapp`/`voice` sources that may use API clients. No semantic change to the validation order.

**Diff (lines 273-293, current):**

```ts
    // Optional agent identity from Bearer token
    let agentId: string | undefined;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
        try {
            const decoded: any = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET || process.env.AGENT_JWT_SECRET || 'secret');
            if (decoded?.id) agentId = decoded.id;
        } catch {
            // Ignore invalid token — public users (web/whatsapp/voice) don't need auth
            // But admin submissions must have a valid token — reject to prevent NULL uploaded_by_agent_id
            if (source === 'admin') {
                return res.status(401).json({ error: 'Session expired. Please refresh the page and try again.' });
            }
        }
    }

    // Admin submissions always require an authenticated agent
    if (source === 'admin' && !agentId) {
        return res.status(401).json({ error: 'Session expired. Please refresh the page and try again.' });
    }
```

**Replace with:**

```ts
    // Optional agent identity — supports both HttpOnly cookie (admin SPA) and
    // Bearer header (legacy API clients). Mirrors authMiddleware's dual-mode pattern.
    let agentId: string | undefined;
    const cookieToken: string | undefined = req.cookies?.['rp_access_token'];
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;
    const token = cookieToken ?? bearerToken;

    if (token) {
        try {
            const decoded: any = jwt.verify(token, process.env.JWT_SECRET || process.env.AGENT_JWT_SECRET || 'secret');
            if (decoded?.id) agentId = decoded.id;
        } catch {
            // Invalid/expired token. Web/whatsapp/voice sources can proceed without
            // auth — they don't need agentId. Admin must reject to avoid NULL uploaded_by_agent_id.
            if (source === 'admin') {
                return res.status(401).json({ error: 'Session expired. Please refresh the page and try again.' });
            }
        }
    }

    // Admin submissions always require an authenticated agent
    if (source === 'admin' && !agentId) {
        return res.status(401).json({ error: 'Session expired. Please refresh the page and try again.' });
    }
```

**No frontend changes.** The frontend already sends cookies + CSRF correctly; the bug is entirely backend.

---

## 3. Pre-deploy verification (local)

Run in `agents/backend/`:

```bash
npx tsc --noEmit 2>&1 | grep -E "(workflow\.ts|csrf\.ts)" | wc -l
# Expected: 0 — no new type errors in either touched file
```

Total backend tsc error count should remain at **630** (the pre-existing baseline). Any deviation means we introduced a new error.

Also verify the changes parse:
```bash
node -c "$(npx ts-node-transpile-only --print 'require(\"./src/routes/workflow.ts\")' 2>/dev/null)" || echo "syntax check ok via tsc"
```

---

## 4. Deploy plan

### 4.1 Backup the running production code

```bash
ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 '
BACKUP_DIR="/root/backups/inventory-fix-pre-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp /var/www/realty-pandit/backend/src/middleware/csrf.ts "$BACKUP_DIR/"
cp /var/www/realty-pandit/backend/src/routes/workflow.ts "$BACKUP_DIR/"
echo "Backed up to: $BACKUP_DIR"
'
```

### 4.2 Ship the two patched files

```bash
scp -i ~/.ssh/realty_pandit_key \
    agents/backend/src/middleware/csrf.ts \
    root@72.62.231.224:/var/www/realty-pandit/backend/src/middleware/csrf.ts

scp -i ~/.ssh/realty_pandit_key \
    agents/backend/src/routes/workflow.ts \
    root@72.62.231.224:/var/www/realty-pandit/backend/src/routes/workflow.ts
```

### 4.3 Update release tag + restart

```bash
ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 '
# write new git SHA so events carry the fix commit
NEW_SHA=$(cd /tmp && echo "FIX-COMMIT-SHA")
echo "$NEW_SHA" > /var/www/realty-pandit/backend/.release.txt

pm2 restart realty-backend --update-env
sleep 5
curl -s -m 10 http://localhost:7071/health | head -c 200
'
```

Expected: `{"status":"ok",...,"db":{"status":"connected"},...}` within 5–10s.

### 4.4 Smoke check — backend still alive

```bash
ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 'pm2 logs realty-backend --lines 20 --nostream --raw 2>&1 | tail -10'
```

Expected: no new error stack traces; "Workflow Automation Engine initialized" reappears.

---

## 5. Post-deploy verification — Playwright (the gold standard)

This is the same exact reproduction script that confirmed the bugs. After the fix, re-running it should show:

| Call | Before fix | **Expected after fix** |
|---|---|---|
| `POST /api/workflow/commit` (cookies + CSRF, no Bearer) | 401 "Session expired" | **400 or 201** — should now reach the workflow engine (400 if the synthetic minimal payload is invalid; 201 if it accidentally validates) |
| `POST /auth/refresh` (NO csrf header — what raw axios sends) | 403 "CSRF validation failed" | **200 OK + new JWT** |
| `POST /auth/refresh` (WITH csrf header — control) | 200 OK | 200 OK (unchanged) |

### Playwright steps

1. `mcp__playwright-browser__browser_navigate https://admin.realtypandit.in`
2. Log in with whichever credentials work today (will need fresh super_boss password — see §8)
3. Run this `browser_evaluate` block (identical to the one used in the investigation):

   ```js
   async () => {
     const csrf = document.cookie.split('; ').find(c => c.startsWith('rp_csrf='))?.split('=')[1] || '';

     const commitRes = await fetch('https://api.realtypandit.in/api/workflow/commit', {
       method: 'POST', credentials: 'include',
       headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
       body: JSON.stringify({ answers: { intent: 'sell', _source: 'admin' }, source: 'admin' }),
     });

     const refreshNoCsrf = await fetch('https://api.realtypandit.in/auth/refresh', {
       method: 'POST', credentials: 'include',
       headers: { 'Content-Type': 'application/json' },
       body: '{}',
     });

     return {
       commit: { status: commitRes.status, body: (await commitRes.text()).slice(0, 200) },
       refresh_no_csrf: { status: refreshNoCsrf.status, body: (await refreshNoCsrf.text()).slice(0, 200) },
     };
   }
   ```

4. **Pass criteria:**
   - `commit.status` is **NOT 401**. (Likely 400 "Validation failed" because the minimal payload doesn't satisfy the workflow engine — that's fine; means we got past the auth gate.)
   - `refresh_no_csrf.status === 200` and body contains a JWT
   - No `session-expired` console events
5. `mcp__playwright-browser__browser_network_requests` — confirm the response codes match

### Optional but recommended — end-to-end real submit

If time permits, manually walk through the actual Add Inventory wizard in the browser (intent → category → location → details → photos → submit). Expected: success screen with display_id. This is the ultimate proof.

---

## 6. Rollback plan

If the fix introduces a new problem (unlikely — both changes are tiny and additive):

```bash
ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 '
BACKUP_DIR=$(ls -td /root/backups/inventory-fix-pre-* | head -1)
cp "$BACKUP_DIR/csrf.ts" /var/www/realty-pandit/backend/src/middleware/csrf.ts
cp "$BACKUP_DIR/workflow.ts" /var/www/realty-pandit/backend/src/routes/workflow.ts
pm2 restart realty-backend
echo "Rolled back from: $BACKUP_DIR"
'
```

---

## 7. Risk assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| CSRF exemption opens a real attack vector on `/auth/refresh` | **Very low** — cookie scoping (`sameSite: 'lax'`, `path: '/auth/refresh'`, `httpOnly: true`) already provides CSRF defense at the cookie layer | Reviewed against Sentry/GitHub/Stripe patterns. If concerned, alternative is to update frontend's `client.ts` to attach X-CSRF-Token to the refresh call instead — bigger frontend change but keeps CSRF middleware uniform |
| Cookie-based auth in `/commit` accidentally accepts a forged cookie | **Very low** — `rp_access_token` is JWT-signed with `JWT_SECRET`; no decode without the secret | Same security model as every other authenticated route; we're aligning workflow.ts with the rest of the codebase |
| Backend fails to restart cleanly | Low — change is syntactically trivial | tsc preflight + immediate `/health` check + automatic rollback path documented |
| Existing public/whatsapp/voice flows break | Very low — Bearer fallback is preserved exactly as before | Will pass through unchanged |
| Type errors from the cookie read | Low — `req.cookies` is already typed by cookie-parser middleware which is applied app-wide | tsc check catches this |

---

## 8. Pre-flight: refresh super_boss password

The memory's super_boss password (`RealtyPandit@2024`) is stale — got 401 during the investigation. For end-to-end Playwright verification we need a working super_boss session (test account is `employee` role which may or may not have permission to access Add Inventory's full workflow).

Options:
- Use the test account if it has `edit_inventory` permission (the workflow check is on backend, can be tested either way)
- User provides the current super_boss password before I deploy
- Reset the password via `agents/backend/update-admin-password.js` script if available

**This is non-blocking** — the direct `browser_evaluate` test bypasses needing super_boss access. The Add-Inventory wizard walkthrough is "nice to have," not required.

---

## 9. Execution checklist (for me to follow if you approve)

- [ ] Apply Change 1 (csrf.ts) locally
- [ ] Apply Change 2 (workflow.ts) locally
- [ ] Run `tsc --noEmit` — confirm 0 new errors in touched files, total stays 630
- [ ] Backup production files (step 4.1)
- [ ] scp both files to server (step 4.2)
- [ ] Update `.release.txt`, restart `realty-backend` (step 4.3)
- [ ] Health check + log scan (step 4.4)
- [ ] Playwright reproduction script — confirm /commit is no longer 401 and /auth/refresh w/o CSRF is now 200 (step 5)
- [ ] Update memory with current state (release SHA, fix confirmed)
- [ ] Update [docs/plans/2026-05-12-inventory-submit-logout-fix.md](2026-05-12-inventory-submit-logout-fix.md) status → SHIPPED
- [ ] Mark GlitchTip issue #14 (AxiosError Network Error) Resolved

---

## 10. What I will NOT do without further sign-off

- Touch any frontend code (the fix is purely backend)
- Apply the same cookie-fallback pattern to other endpoints that may have a similar bug — file a separate ticket if needed
- Migrate the workflow.ts endpoint to use `authMiddleware` properly (the "cleaner refactor" alternative) — keeping change minimal for safety
- Fix the pre-existing Prisma `Unknown field 'classification'` errors in logs — separate ticket
- Add CORS-allowing headers to 403 CSRF responses so they show as "403" not "Network Error" in client side — separate ticket if you want that polish
