---
name: feedback-pwa-networkonly
description: The admin PWA must NEVER cache /api/ GETs. NetworkFirst served stale CRM lists — freshly-added inventory/leads invisible to the creator, email tab blank. Fixed to NetworkOnly 2026-05-16.
metadata:
  type: feedback
---

# PWA: /api/ is NetworkOnly, never cached

`agents/frontend/vite.config.ts` workbox `runtimeCaching` used to have `urlPattern: /\/api\//` → `handler: 'NetworkFirst'` (api-cache, 5 min). On any slow mobile request the SW fell back to the **stale cached list**, so a team member who just added inventory (or leads/deals) could not see it, and the email tab rendered blank. This was the real root cause of "Vinod can't see his inventory" — backend/DB/filter were all proven correct.

**Rule:** For this live sales CRM, `/api/` is `handler: 'NetworkOnly'`. Freshness >> offline. Do not reintroduce NetworkFirst/StaleWhileRevalidate for `/api/` to "improve performance" — it silently makes new records invisible. Auth was already NetworkOnly; maps stay CacheFirst.

**Diagnostic signature:** user reports "I added X but can't see it" / "tab is blank", but the same request via curl/API returns the data correctly and the DB row is present with correct attribution. → suspect SW cache, not backend. GlitchTip will also show heavy admin-crm `Failed to update a ServiceWorker` / `serviceWorker.register Rejected`.

**Also:** `main.tsx` `controllerchange` handler intentionally does NOT auto-reload (dispatches `sw-update-ready`). Combined with API caching this pinned users on stale bundles. Always bump the `index.html` `<!-- vYYYYMMDD... -->` stamp on every frontend deploy (workbox precache revision → new sw.js) per the deploy runbook.

## Related
- [[feedback_pwa_deploy]] — index.html cache-bust procedure
- [[feedback_glitchtip_instrumentation]] — SW errors are the digest fingerprint of this class
