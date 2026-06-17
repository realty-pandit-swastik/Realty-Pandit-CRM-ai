---
name: GlitchTip System (pointer)
description: Pointer to GlitchTip docs + the 2026-05-12 full-coverage instrumentation. 4 services share 2 existing projects; events filtered by `service:` tag.
metadata:
  type: reference
---

**Canonical docs (read these first):**
- Runbook: `clients/sunny-sharma/projects/reality-pandit/docs/runbooks/glitchtip.md` — self-hosted setup + nightly digest pipeline
- Full coverage report (2026-05-12, SHIPPED): `clients/sunny-sharma/projects/reality-pandit/docs/plans/2026-05-12-glitchtip-coverage-shipped.md` — file-by-file diff, deploy state, rollback paths
- **Direct Postgres access for bulk operations:** [[reference-glitchtip-db-access]] — DB creds, status enum, useful queries, bulk-resolve patterns

**Live production state (as of 2026-05-12, deploy `aa176bd`):**
- All 4 services instrumented: `backend` (Node), `frontend` (Vite/React), `pipecat` (Python), `android` (Kotlin)
- Reuses 2 existing GlitchTip projects:
  - `/3` = `realty-admin-frontend` — frontend events only
  - `/4` = `realty-backend` — backend + pipecat + android events (filter by `service:` tag)
- 380 `captureRouteError` call sites across 35 backend route files (helper at `agents/backend/src/utils/capture.ts`)
- PII scrubbers in all 4 services: passwords, tokens, phone numbers (last-4 mask), Razorpay IDs
- Release tagging: backend reads `agents/backend/.release.txt`, pipecat reads `agents/pipecat/.release.txt`, frontend bakes into bundle via Vite `define`, Android via `BuildConfig.VERSION_NAME+VERSION_CODE`

**Server backups from this deploy (rollback if needed):**
- `/root/backups/backend-pre-glitchtip-20260512_112455/` (5.3 MB, includes src/ + .env)
- `/root/backups/pipecat-pre-glitchtip-20260512_105902/` (4 files)
- `/var/www/realty-pandit/frontend/dist-pre-glitchtip-20260512_113149/`
- `/var/www/realty-pandit/backend/.env.bak-20260512_113652` (pre SENTRY_DSN→GLITCHTIP_DSN rename)

**Why:** Project knowledge lives in /docs/. Memory only points to current state + recent material change.
**How to apply:** When investigating new GlitchTip events, filter by the `service:` tag to scope to the right runtime. When extending coverage, use the existing `captureRouteError`/`captureBackgroundError` helpers — don't add new init blocks. When deploying, write `.release.txt` first (or let `scripts/write-release.sh` do it).
