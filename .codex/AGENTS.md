# Realty Pandit — Project-Local Operating Context

This file applies only to work in this repository. Read it before investigating, planning, editing, reviewing, testing, or deploying. It summarizes the durable parts of the engineering handover and historical reports; it is not a substitute for checking the current source.

## Source of truth and evidence

Use this order when facts conflict:

1. The current user's request and the nearest applicable `AGENTS.md` instructions.
2. Current repository source, schema, tests, package scripts, configuration templates, and Git history.
3. Read-only runtime/deployment evidence gathered for the current task.
4. `docs/PROJECT_STATUS.md` for the latest intended/shipped product state, then focused files in `docs/decisions/`, `docs/plans/`, `docs/runbooks/`, and `docs/precautions/`.
5. `CODEBASE_ENGINEERING_HANDOVER_AND_AUDIT.md` for the 2026-09-16 takeover snapshot and `CODEBASE_FILE_COVERAGE_APPENDIX.md` for the complete tracked-file catalog.
6. Graphify for navigation and relationships, never as proof that every file or runtime condition was reviewed.
7. The February 2026 implementation, audit, setup, and deployment reports listed below. Treat them as historical design notes only.

Never let an old “complete”, “working”, “production ready”, port, model, route count, schema count, deployment command, or server-health claim override current code or fresh evidence. State uncertainty explicitly. Do not claim production verification unless it was performed during the current task.

## Mandatory start-of-task behavior

- Preserve user changes. Check `git status --short` before edits and do not modify unrelated files.
- For any codebase question, follow the root Graphify rules first: query the existing graph, then inspect the actual source files needed to verify the answer.
- Trace the real flow and all callers before changing shared behavior. Fix root causes at the narrowest shared point.
- Prefer existing helpers, patterns, platform features, and installed dependencies. Do not introduce speculative abstractions or new dependencies.
- Treat generated output, reports, screenshots, archives, `node_modules`, build directories, and Graphify artifacts as non-source unless the task specifically targets them.
- After changing source, run the smallest relevant checks and then `graphify update .`.

## What Realty Pandit is

Realty Pandit is a multi-surface real-estate CRM and marketplace. It covers public property discovery and lead capture, an internal CRM, partner/builder portals, inventory and demand workflows, deal/visit/task operations, WhatsApp automation, AI assistance, voice/call processing, and an Android handset bridge.

The core business path is lead-to-deal: capture or identify a contact, qualify demand or supply, match inventory, share properties, schedule visits, progress a transaction, and record outcomes. Cross-channel identity and activity are centered on normalized phone numbers and shared Contact/Interaction data, but current Prisma constraints and services—not old diagrams—define the exact invariant.

## Repository map

- `agents/backend/`: Express/TypeScript API and business logic. PostgreSQL is accessed through Prisma. Redis/BullMQ powers queues, schedules, deduplication, sessions, and operational coordination.
- `agents/frontend/`: React/Vite internal CRM/PWA for contacts, leads, inventory, deals, visits, team, reports, calls, campaigns, tasks, and administration.
- `agents/website/`: Next.js public website plus user, agent, and builder experiences, listings/projects, AI chat, lead/visit forms, and post-property workflow.
- `agents/pipecat/`: Python voice automation service.
- `agents/call-gateway/`: Node/TypeScript gateway between backend call workflows and Android handsets.
- `agents/android/`: Kotlin Android staff/call application.
- `agents/deployment/`, `deploy/`, `.github/workflows/`: legacy and guarded deployment tooling. Determine which path is current before use.
- `docs/`: current status, decisions, plans, runbooks, precautions, investigations, architecture, and archived snapshots.
- `handover/`: operational handover evidence; verify runtime claims before acting.
- `graphify-out/`: generated navigation graph, wiki, reports, and query memory. Dirty generated graph files are expected.

## High-blast-radius files

Read these before broad changes:

- `agents/backend/src/server.ts`: process startup, worker/scheduler ownership, shutdown.
- `agents/backend/src/app.ts`: middleware order and route mounting.
- `agents/backend/src/db.ts`: global Prisma behavior/extensions.
- `agents/backend/prisma/schema.prisma` and `prisma/migrations/`: data contract and migrations.
- `agents/backend/src/middleware/auth.ts` and permission configuration: authentication, tenancy, role, and record scope.
- `agents/backend/src/queues/workers/scheduled_worker.ts`: scheduled BullMQ work.
- `agents/backend/src/routes/{public,webhooks,inventory,deals}.ts`: major public/provider/business boundaries.
- `agents/backend/src/workflows/`: shared inventory and conversation state machines.
- `agents/frontend/src/App.tsx` and `src/api/client.ts`: CRM routing, auth boundaries, and API contracts.
- `agents/website/src/app/` and `src/lib/api.ts`: public routes and backend contract.

## Architecture and durable invariants

- Production-facing traffic is expected to pass through TLS/nginx to the website, backend API, and admin UI. Exact hosts, ports, PM2 names/users, paths, and service counts require current configuration or live verification.
- The backend is the shared authority for the CRM, website, portals, WhatsApp, call, and integration flows. Avoid duplicating business rules in clients.
- PostgreSQL/Prisma is the durable data layer. Redis is not merely an optional cache: queues, scheduled jobs, deduplication, and some session/reliability paths depend on it. Test or reason about Redis-down behavior explicitly.
- Phone normalization is a cross-model identity concern. Reuse the existing phone utilities; never add a new ad hoc sanitizer.
- Tenant, role, assignment, manager hierarchy, sharing, and record ownership scopes are security boundaries. Every new read/write endpoint must preserve them.
- Internal roles include `super_boss`, `manager`, and `employee`; public users, partner agents, and builders have separate auth/token paths. Do not collapse these paths for convenience.
- Staff auth uses protected JWT/cookie flows with CSRF considerations; public OTP and partner/builder flows differ. Check current middleware instead of relying on old documents.
- Public and provider endpoints are trust boundaries. Validate inputs, authenticate/sign webhooks where supported, rate-limit appropriately, and do not expose internal prices, owner data, or unscoped records.
- The inventory workflow is shared across admin, website, and WhatsApp. Conditional steps, validation, taxonomy resolution, commit behavior, and Contact/Owner/Inventory/Interaction writes belong in the backend workflow engine. A fix must consider all channels.
- Media/uploads are persistent production data. Deployment and cleanup must preserve uploads; authorization and retention must be checked separately.
- Background schedules should have one clear owner. PM2 cluster behavior and legacy cron fallbacks can duplicate work; inspect `server.ts` and the scheduled worker before modifying jobs.
- Provider acceptance is not delivery confirmation. WhatsApp, Meta, portal, voice, email, payment, and Google integrations require provider-specific error handling and observable outcomes.

## Main flows to trace

### Browser/API request

Client → nginx/TLS → Express middleware (`Helmet/CORS/cookies/CSRF/rate limit/auth`) → route → service/workflow → Prisma/PostgreSQL and possibly Redis/provider → structured response/error capture.

Middleware order matters. Bearer, cookie, public, webhook, and callback exceptions must remain deliberate.

### WhatsApp inbound

Meta webhook → verification/signature handling → fast acknowledgement → deduplication → BullMQ inbound queue (or explicit fallback) → contact/session/history lookup → router/agent/workflow → database side effects → outbound reply/status logging.

Check signature enforcement, idempotency, 24-hour messaging rules, quiet hours, queue retries, and the never-silent fallback whenever this flow changes.

### Inventory submission

Admin/website/WhatsApp renderer → shared workflow definition/navigation/validation → summary → commit → normalized identity and tenant resolution → Contact/Owner/Inventory/document/Interaction writes → notifications/matching.

The reports describe this as SSOT/atomic, but verify the current transaction boundary in source before relying on it. Preserve public/internal price separation and channel-specific identity rules.

### Lead/deal lifecycle

Lead intake from website, WhatsApp, portals, staff, or campaigns → Contact/Interaction → assignment/sharing/qualification → active demand deal → matching/property sharing → appointment/visit → negotiation → closed outcome. Current enum values and transition services win over historical lifecycle diagrams.

## Security rules

- Several tracked historical documents and configuration artifacts contain or once contained real credentials, tokens, provider identifiers, host details, and key paths. Treat every exposed value as compromised/stale.
- Never copy secrets from documentation into code, commands, logs, tests, issues, commits, chat responses, or new instruction files. Refer only to environment-variable names.
- Never commit `.env` files or invent fallback secrets. Use safe `.env.example` placeholders and current secret-management/deployment mechanisms.
- Secret rotation, production configuration changes, migrations, server restarts, and provider changes can cause outages and require explicit task scope, backup, verification, and rollback.
- Do not run `npm audit fix --force` or broad dependency upgrades blindly. Upgrade by component and verify compatibility.
- Do not weaken failing tests, lint, signature checks, authorization, CSRF, CORS, host-key verification, or deployment gates to make a check pass.
- Never use production users, phone numbers, messages, tokens, or provider sends as casual test fixtures. Prefer mocks or explicitly reversible probes.

## Deployment and production safety

Historical direct-SCP/root scripts are not automatically authoritative. The 2026-09-16 handover found Git/server drift, split PM2 ownership, and a production-only bootstrap file. Therefore:

- Do not deploy merely because code builds locally, and do not run legacy `push-update*`, `deploy-now*`, `update-server*`, or watcher scripts without first proving they are the current approved path.
- Prefer the guarded artifact-based workflow in `.github/workflows/deploy-hostinger.yml`/`deploy/` only after its documented preflight, protected branch, environment approval, secrets, known-hosts, backup, manual deploy, health check, and rollback rehearsal are satisfied.
- Never use destructive sync (`--delete`) against production. Preserve `.env`, uploads, logs, backups, and any verified server-only bootstrap/configuration.
- Never apply production migrations automatically as part of an ordinary code deployment. Review the migration, take/verify a backup, understand rollback, and obtain the required approval.
- Before production work, establish the live revision and file hashes, PM2 processes under every relevant user, nginx targets, migration state, database/Redis health, backup freshness, restore proof, disk capacity, queue health, and provider status.
- A successful `/health` call is necessary but insufficient. Verify website/admin reachability, logs, workers/queues, smoke paths, and restart counts.
- Roll back application artifacts only when database compatibility is understood. Database rollback remains an explicit manual decision.

## Quality baseline from the 2026-09-16 handover

This is a snapshot, not a permanent allowance. Re-run the relevant checks and report the current result:

- Backend: 381/395 tests passed; 14 failures included Redis-dependent health behavior, stale expectations, and incomplete Prisma mocks.
- CRM lint: 918 errors; frontend build passed with a large-bundle warning.
- Website lint: 252 errors; build passed, with a deprecated Next middleware warning.
- Call gateway test script attempted to execute TypeScript directly with Node and failed.
- Dependency audits reported high/critical findings across backend, CRM, and website.
- Production migration state, restore proof, runtime drift, and some provider/security settings still required live verification.

Do not describe these as current without rerunning. Do not introduce new failures. When the whole baseline is too noisy for a scoped change, run focused checks and distinguish pre-existing failures from regressions with evidence.

## Validation commands

Use the package's existing scripts; do not assume a root workspace runner exists.

- Backend: `cd agents/backend && npm test` (or a focused Vitest target).
- CRM: `cd agents/frontend && npm run build`; run `npm run lint` when relevant and report baseline noise honestly.
- Website: `cd agents/website && npm run build`; run `npm run lint` when relevant.
- Call gateway: inspect/fix its TypeScript runner before trusting `npm test`.
- Schema changes: inspect generated SQL, run Prisma validation/generation in the backend package, and test against a non-production database.
- After source edits: `graphify update .`.

Do not run `npm install` to “fix” a task unless dependency changes are actually required. Prefer `npm ci` only when a clean reproducible install is needed and authorized.

## Historical document interpretation

The following requested files have been read and reconciled into this context:

- `CODEBASE_ENGINEERING_HANDOVER_AND_AUDIT.md`: primary takeover snapshot; architecture, risk register, quality baseline, and guarded deployment plan.
- `CODEBASE_FILE_COVERAGE_APPENDIX.md`: complete 3,027-file catalog at its snapshot; catalog coverage is not execution/test coverage, and Graphify's partial representation is expected.
- `COMPLETE-IMPLEMENTATION-STATUS.md` and `PHASE-4-IMPLEMENTATION-SUMMARY.md`: February UI implementation notes. Some “complete” features explicitly used mock data, placeholders, or unimplemented persistence/APIs.
- `IMPLEMENTATION_STATUS.md`: February chat/WhatsApp/SSOT design snapshot; later source and status docs supersede its planned/complete claims.
- `INVENTORY_WORKFLOW_REPORT.md`: useful model of the shared multi-channel workflow, conditional validation, identity normalization, and commit flow; exact steps/schema may have evolved.
- `DEPLOYMENT_GUIDE.md`, `DEPLOYMENT_READY.md`, `DEPLOYMENT_VERIFICATION.md`, and `UPDATE-SERVER-README.md`: historical deployment records with contradictory ports, process names, infrastructure assumptions, and sensitive values. Never execute them verbatim without reconciliation.
- `GOOGLE_MAPS_SETUP.md`: historical setup/feature guide. Restrict browser and server keys appropriately; never assume one shared unrestricted key or old pricing/quota information is correct.
- `PROJECT_AUDIT_REPORT.md`, `REALTY_PANDIT_FULL_AUDIT_2026.md`, and `REALTY_PANDIT_PROJECT_REPORT.md`: broad February architecture/audit snapshots; helpful for discovery, not present-day proof.
- `MASTER_MANUAL.md` and `PROJECT_KNOWLEDGE.md`: explicitly retired. Never use their archived contents as current state; `PROJECT_KNOWLEDGE.md` also warns of an unrotated exposed key.

## Decision rules

- Correctness, authorization, data integrity, recoverability, and user privacy outrank minimal diff size.
- Otherwise prefer the smallest change at the shared root cause, reuse existing code, and avoid future-proof scaffolding.
- Keep the existing modular monolith unless measured evidence and the user's request justify a boundary change. Do not propose microservices merely because files are large.
- Schema and API changes should be additive/backward-compatible when feasible. Preserve old clients only where current contracts or rollout needs require it.
- UI changes must cover the actual shared desktop/mobile render path and retain accessibility basics, loading/error/empty states, and permission behavior.
- For analytics, never present mock/generated data as real. Distinguish no data from failed loading.
- For fixes involving phone identity, prices, tenancy, ownership, assignment, sharing, webhooks, queues, uploads, or migrations, add the smallest focused regression check.
- Update the nearest current documentation/status record when behavior or operational truth materially changes; do not revive retired root manuals.

## Definition of done

A task is complete only when the requested behavior is implemented at the correct shared layer, relevant checks have run, security/tenancy/data implications were reviewed, unrelated changes were preserved, Graphify was updated after source changes, and the handoff states what was verified plus any remaining production-only uncertainty.
