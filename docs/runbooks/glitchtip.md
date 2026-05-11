---
name: GlitchTip Error Intelligence System
description: Self-hosted GlitchTip + automated nightly digest → Claude memory. Completed 2026-04-15.
type: project
---

GlitchTip is self-hosted on the Realty Pandit server. A nightly script fetches all unresolved errors, maps them to source files, reads code context, generates fix hints, and writes to Claude memory. At every session start, errors are already loaded — no investigation needed.

**Why:** Zero-cost Sentry alternative. Errors surfaced automatically so Claude can fix without re-investigating.

**How to apply:** At session start, read `glitchtip_errors.md` timestamp. If within 48h, tell user the error count. If >3 days stale, offer to run `glitchtip_digest` tool.

---

## Infrastructure

- **Dashboard**: https://errors.realtypandit.in (login: realtypandit2026@gmail.com)
- **Server**: Docker Compose at `/var/www/glitchtip/` on 72.62.231.224
- **Port**: 8100 internally, proxied via Nginx with SSL
- **DB/Redis**: Isolated Docker containers (separate from main app)
- **SSL**: Let's Encrypt, auto-renews

## 4 Projects + DSNs

| App | Project Slug | DSN |
|-----|-------------|-----|
| Main Website | `main-website` | `https://297cee5c-...@errors.realtypandit.in/1` |
| Agents Website | `agents-website` | `https://d2879ab0-...@errors.realtypandit.in/2` |
| Admin CRM | `admin-crm` | `https://413b4cd4-...@errors.realtypandit.in/3` |
| Backend | `backend` | `https://6d0a7529-...@errors.realtypandit.in/4` |

DSNs are live in all 4 `.env.production` files. All apps already deployed with error tracking active.

## Digest System

- **Script**: `agents/monitor/glitchtip-digest.js`
- **Config**: `agents/monitor/.env.monitor` (gitignored — contains API token)
- **API token**: `0b32df90...` (full read scopes, created via Django shell)
- **Schedule**: Windows Task Scheduler — `RealtypanditGlitchtipDigest` — daily at midnight
- **Output A**: `memory/glitchtip_errors.md` — Claude memory, loaded every session
- **Output B**: `agents/monitor/reports/latest-glitchtip.json` — raw JSON
- **MCP tool**: `glitchtip_digest` in `agents/mcp-server.js` — trigger fresh fetch mid-session

## GlitchTip API Gotchas

- Sort param is `last_seen` not `lastSeen` (422 if wrong)
- Token creation: use Django shell, NOT REST API (CSRF blocks it)
- Token scopes are a bitmask (bitfield) — set as integer, not list
- Model path: `apps.api_tokens.APIToken` (not `users.AuthToken`)

## digest.js Source File Mapping

Maps `metadata.filename` (partial path like `routes/agent.ts`) to full local path using APP_ROOTS dict. Falls back to recursive walk if direct join fails. Marks `[file not located]` if not found.

## Scoring Algorithm

```
score = (fatal=1000 | error=100 | warning=10) + count×2 + users×5 + (recency <24h: +50)
CRITICAL ≥ 200 | HIGH ≥ 50 | LOW < 50
```

## Re-registration (if needed)

Run `agents/monitor/register-task.bat` as Administrator to re-register the scheduled task.
