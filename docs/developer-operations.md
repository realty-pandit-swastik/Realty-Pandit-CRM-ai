# Developer and operations guide

This guide is repository-local. It does not authorize production access, migrations, provider sends, or credential rotation.

## Prerequisites

- Node 20 for backend, CRM, and website; Node 22.6+ for the call gateway.
- PostgreSQL 15 and Redis 7 for full backend/queue behavior.
- Use only local or dedicated test credentials. Never copy a production `.env` into a commit, log, or ticket.

## Local setup

1. Copy root `.env.example` to `.env`, set a unique local `POSTGRES_PASSWORD`, then run `docker compose up -d` if a local Postgres/Redis stack is needed.
2. In `agents/backend`, copy `.env.example` to `.env` and fill required local/test values. `DATABASE_URL`, `JWT_SECRET`, and `AGENT_JWT_SECRET` are mandatory at server startup.
3. Install independently in each app with `npm ci`: `agents/backend`, `agents/frontend`, `agents/website`, and `agents/call-gateway`.
4. Copy `agents/call-gateway/.env.example` to an ignored environment file and generate both token values. The gateway refuses to start without them.

## Run and validate

| Area | Develop | Validate |
| --- | --- | --- |
| Backend | `cd agents/backend && npm run dev` | `npm test`; `npx prisma generate` after schema changes |
| CRM | `cd agents/frontend && npm run dev` | `npm run lint`; `npm run build` |
| Website | `cd agents/website && npm run dev` | `npm run lint`; `npm run build` |
| Call gateway | `cd agents/call-gateway && npm start` | `npm test` |

The backend TypeScript check is currently known to fail. Do not add `continue-on-error` to new checks or weaken assertions; reduce the reported baseline in focused batches.

## Development rules

- Put business and authorization rules in the backend. Clients should not recreate tenant, ownership, pricing, or phone-normalization logic.
- Use the existing phone utilities and permission middleware at trust boundaries.
- Preserve Redis behavior when changing webhooks, queues, schedules, sessions, or deduplication.
- Add the smallest regression test for changes involving tenancy, ownership, phone identity, price, webhooks, uploads, or migrations.
- The pinned Gitleaks workflow scans pull requests and protected-branch pushes. Treat any finding as an incident: revoke/rotate the value before deciding whether history remediation is required.
- After source changes, run the affected check and `graphify update .`.

## Debugging and monitoring

- Start with the backend `/health` response: it now checks database and Redis readiness and includes queue status.
- Use structured backend logs and GlitchTip/Sentry for unexpected failures. Do not put request bodies, tokens, passwords, or phone data in new log messages.
- Treat provider acceptance as distinct from delivery. Inspect provider-specific status/error records before declaring WhatsApp, email, payment, or portal delivery successful.
- For an unavailable Redis, investigate queues and workers before restarting unrelated services.

## Deployment and recovery

The only approved repository procedure is [the production deployment runbook](runbooks/deploy.md) and `.github/workflows/deploy-hostinger.yml`.

1. Merge a reviewed pull request to protected `main`; do not use legacy SSH/SCP scripts or `git pull` on a live host.
2. Keep `run_migrations=false` by default. A migration requires review, a fresh restore-tested backup, compatibility analysis, and explicit approval.
3. The release workflow packages an exact revision, activates it atomically, checks backend/website/admin reachability, and retains releases for rollback.
4. After deployment, verify the revision, both PM2 owners, Postgres/Redis, queue failures, scheduler ownership, logs, and read-only website/admin smoke paths.
5. Without a migration, use the documented rollback procedure and repeat verification. After a migration, stop for a reviewed database decision; never automatically reverse SQL or overwrite newer data.

## Administrative scripts

The admin creation/update scripts require `ADMIN_PASSWORD` from the invoking environment and never print it. Run them only with an approved non-production or explicitly authorized target database.
