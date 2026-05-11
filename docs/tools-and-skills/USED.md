# Tools & Skills In Use

> What Claude / the human team uses to operate this project today. Pointer-style — links out where the tool's own docs are better than a re-summary.

## Development + deploy

| Tool | What it does | Where |
|---|---|---|
| `deploy-agent.js` | Uniform deploy: tar source → SCP → server build → PM2 restart → browser QA | `agents/deployment/deploy-agent.js`. See [`../runbooks/deploy.md`](../runbooks/deploy.md) |
| `browser-qa/qa-agent.js` | Post-deploy smoke test across desktop + mobile viewports | `agents/browser-qa/` |
| Vite Plugin PWA | Service worker generation + auto-update | Configured in `frontend/vite.config.ts`. See [`../runbooks/pwa-cache-bust.md`](../runbooks/pwa-cache-bust.md) |
| Prisma CLI | Schema migrations + introspection | `cd agents/backend && npx prisma <cmd>` |
| PM2 | Process supervision on server | `pm2 list` / `pm2 restart <name>` / `pm2 logs <name>` |
| GlitchTip (self-hosted) | Error tracking | Nightly digest fed to memory. See [`../archive/2026-04-15-glitchtip-system.md`](#) if migrated, else GlitchTip self-hosted dashboard |

## Server access

- SSH: `ssh -i $RP_KEY root@72.62.231.224` where `$RP_KEY = C:/Users/VARCHA~1/AppData/Local/Temp/rp_key`
- DB: PostgreSQL on the same VPS, port 5432, local-only. Access via Prisma scripts run on the server, not via direct SQL client.

## Claude-side skills (the ones we actually invoke)

| Skill | When used |
|---|---|
| `brainstorming` | Before any non-trivial change — explore goal, get to a design |
| `writing-plans` | After brainstorming approves — produce a step-by-step plan |
| `executing-plans` | Inline execution of a plan with phase checkpoints |
| `playwright-pro` | Live UI verification through MCP Playwright browser tools |
| `frontend-design` | UI work that needs distinctive design (rare; user prefers hand-crafted) |
| `verification-before-completion` | Before declaring anything fixed/done |

Skills explicitly **not** in use (with reasons):
- `code-review-graph` MCP — stalls sessions, [memory feedback](memory:`feedback_skip_code_review_graph.md`)
- `subagent-driven-development` — overhead not worth it for mechanical work, [memory feedback](memory:`feedback_subagent_overhead.md`)

## Reference dashboards

| Dashboard | URL / location |
|---|---|
| Admin CRM | https://admin.realtypandit.in |
| Public website | https://www.realtypandit.in |
| API | https://api.realtypandit.in |
| Meta WhatsApp Business Manager | business.facebook.com → WABA `2124684824933246` |
| GlitchTip | Self-hosted, on the same VPS — credentials in admin_credentials |

## Logging + observability

- Backend logs: `pm2 logs realty-backend --lines 200`
- Browser QA reports: `agents/browser-qa/reports/`
- GlitchTip digest (nightly): served into Claude memory automatically (see `glitchtip_errors.md`)
