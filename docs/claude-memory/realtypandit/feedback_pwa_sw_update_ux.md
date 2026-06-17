---
name: feedback_pwa_sw_update_ux
description: After a frontend deploy, users keep seeing the OLD admin UI until the PWA service worker swaps — it's NOT a broken deploy. Verify the live bundle hash, then tell them to hard-refresh (often twice). Bit us twice on 2026-06-01.
type: feedback
---

**Symptom:** right after a frontend deploy, the user reports "still old version" / sends a
screenshot of the pre-change UI — even though the deploy is live. Happened **twice** on
2026-06-01 (the Add-Lead taxonomy form, then the location autocomplete).

**Why:** the admin is a PWA. `vite.config` PWA uses `registerType: 'autoUpdate'` + `skipWaiting`
+ `clientsClaim`. The service worker **precaches the app shell + JS bundle**, so the page the
user has open is served from the SW cache. On a new deploy the new SW installs/activates in the
**background**, but the already-loaded page keeps the old bundle; the new bundle only loads on the
**next** reload after the SW activates. So a single reload (done while the new SW is still
downloading the ~2.9 MB precache) still shows old. `index.html` itself is served `no-cache` by
nginx (never CDN-staled) — the staleness is purely the SW asset cache, not nginx.

**How to apply:**
- **Don't conclude the deploy is broken.** First verify the live bundle: `curl -s https://admin.realtypandit.in/ | grep -oE 'index-[A-Za-z0-9_-]+\.js'` — if it's the NEW hash (matches `dist/assets/` after the server build), the deploy is fine and it's purely the client SW cache.
- **Tell the user:** hard-refresh **Ctrl + Shift + R** — usually **twice** (first triggers the SW swap, second loads the new bundle); or close ALL admin tabs and reopen; last resort DevTools → Application → Service Workers → Unregister.
- **When verifying via Playwright** (huge-DOM admin SPA): unregister the SW + clear caches then reload to force the new bundle — but this **drops the session / the JWT may have expired**, so re-login (form: 9958860411 / see [[admin_credentials]]) before driving the UI. The MCP `_snapshotForAI` times out on this SPA + Google's `.pac-container`; drive via `browser_run_code` returning small strings and verify outcomes in the **DB**, not snapshots. (See [[feedback_playwright_mcp_blocked]].)
- Build frontend **on the server** (`cd /var/www/realty-pandit/frontend && npm run build`) so the prod `VITE_*` env bakes correctly; the new bundle hash + `sw.js` regenerate, which is what triggers the client swap. Deploy path + mechanics in [[feedback_pwa_deploy]] / [[feedback_frontend_build_verify]].
