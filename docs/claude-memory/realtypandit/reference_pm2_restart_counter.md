---
name: reference-pm2-restart-counter
description: PM2 "Restarts: N" on realty-backend is cumulative deploy/reload count, not a crash loop
metadata:
  type: reference
---

The PM2 "Restarts" number reported by `server_health` (e.g. realty-backend "Restarts: 61/62") is a **lifetime-cumulative counter that increments on every `pm2 reload`/deploy**, not a crash count. This project deploys the backend very frequently, so a high number is expected and is **not** instability.

**How to tell deploy-noise vs a real crash loop** (do this before raising alarm):
- Run `server_health` twice with a known gap; the restart delta should ≈ the number of deploys you did between them. 2026-05-17: backend 61→62 (+1) over 40 min = exactly the 1 deploy I ran; realty-admin stayed flat at 23 (not deployed). Deploy-driven, confirmed.
- RAM well under `max_memory_restart` (backend `ecosystem.config.js`: cluster, instances:2, `max_memory_restart:'1G'`; saw ~220MB) ⇒ not OOM.
- `server.ts`: `uncaughtException` → Sentry capture **then** `process.exit(1)`; `unhandledRejection` → captured, **no exit**. A real crash loop would flood the GlitchTip **backend** project with `uncaughtException` issues. If GlitchTip backend is quiet (only old/low-volume issues), there is no crash loop.
- Definitive server check (needs SSH/CLI, not exposed via MCP): `pm2 describe realty-backend` → look at **uptime** (hours/days = healthy) and **unstable restarts** (~0 = fine); `pm2 logs realty-backend --err --lines 50` for the "N recent error lines" content.

**Takeaway:** don't treat a high PM2 restart count as an emergency or as "leads dropped during restarts" without the delta test + GlitchTip cross-check. The "10 recent error lines" (stable count, not growing) and admin "Network Error ×N" are usually momentary cluster-reload blips during the frequent deploys, amplified by stale admin PWA SW cache — see [[feedback_pwa_networkonly]], [[reference_prod_infrastructure]].
