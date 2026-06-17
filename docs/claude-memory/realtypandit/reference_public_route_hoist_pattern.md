---
name: Public /api/* routes must be hoisted to app.ts above the /api JWT mount
description: Why a "public" route inside an /api/* router still 401s, and the fix (app.ts before app.use('/api', apiRoutes)).
metadata:
  type: reference
---

**Symptom:** you add a public route inside an `/api/...` Express router and
place it BEFORE that router's `router.use(authMiddleware)`, yet prod returns
`401 {"error":"Authentication required"}` (no redirect / no handler hit).

**Root cause:** in `agents/backend/src/app.ts`, `app.use('/api', apiLimiter,
apiRoutes)` (~line 281) is mounted **before** the specific feature routers
like `app.use('/api/team', teamRoutes)` (~line 286). `apiRoutes` carries a
global JWT auth, so ANY `/api/*` path is auth-checked there first — the
request never reaches the feature router where your pre-auth route lives.

**Fix / pattern:** register the public route at **app.ts level, ABOVE line
281**, next to the existing `app.get('/api/team/inventory/bulk-template', ...)`
under the comment `// Public team endpoints (must be before the /api auth
middleware)`. Use `publicLimiter`. `prisma` is imported at app.ts top;
pull `logger`/`captureRouteError`/services via dynamic `import()` inside the
handler (matches house style).

**Verified 2026-05-18** building the Google OAuth callback
(`GET /api/team/google/callback`) — the in-`team.ts` placement 401'd; hoisting
to app.ts made it 302 correctly. See [[project_google_reminder_sync]].

Related: the admin SPA (`frontend/src/App.tsx`) has **no URL router** —
`view` is `useState('dashboard')`, not path-driven. Any OAuth/redirect
landing must surface its result globally in App.tsx (query param → toast +
`setView(...)`), not in a deep component that may be unmounted on return.
