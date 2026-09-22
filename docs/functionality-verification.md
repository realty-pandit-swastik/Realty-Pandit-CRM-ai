# Functionality verification matrix

Status describes evidence, not product confidence. “Verified” is limited to the stated method and environment.

| Functionality | Expected behavior | Existing verification | Additional tests / audit work | Status |
| --- | --- | --- | --- | --- |
| Backend HTTP security headers, validation, rate limits | Requests traverse Helmet, CORS, CSRF and route validation correctly | Backend suite: 401 total tests, including 11 app tests | Browser/session CSRF journey with real cookie handling | Partially verified |
| Health/readiness | Reports DB, Redis, queues and returns 503 when a required dependency is down | New Redis-unavailable app regression test | Verify against real Postgres/Redis and deployment health endpoint | Verified in test |
| Staff JWT, roles and partner allow-list | Authenticated users see only permitted tenant/role records | Backend auth/permission tests and scoped route review | Full role matrix API contract suite | Partially verified |
| Public property discovery and lead capture | Website can browse listings and submit public lead/contact flows | Backend unit tests; website webpack production build | Browser E2E against non-production API | Partially verified |
| Inventory workflow and matching | Shared workflow validates, commits, scopes, and shares inventory | Backend workflow, inventory, sharing and math tests | Transactional non-production database characterization | Partially verified |
| Lead/deal/visit lifecycle | Contacts progress to deals, appointments, tasks and interactions | Backend lifecycle, visit, ownership, assignment tests | Browser journey including permission variants | Partially verified |
| WhatsApp/webhook handling | Signed providers are acknowledged, deduplicated, queued and observed | Route/service tests and source review | Test provider sandbox; signature enforcement and delivery-status drill | Partially verified |
| External portal, payment, email, Maps and AI integrations | Provider failures are safely handled without data corruption | Adapter source review and targeted tests | Provider sandbox/credential checks | Not verified end-to-end |
| CRM/PWA | Internal CRM compiles and uses the shared API contract | Lint: 0 errors; production build passes | Browser smoke tests, performance profile | Partially verified |
| Public website | Next application compiles without remote font downloads | Lint: 0 errors; webpack production build passes | Default Turbopack build and browser smoke in normal CI | Partially verified |
| Call gateway | Authenticated handset obeys command, line, TTL, and teardown invariants | 32-check simulated handset protocol test | Real handset/WSS network smoke without placing real calls | Verified in simulation |
| Database migrations and integrity | Migrations are backward compatible and recoverable | Prisma schema review only | Staging migration, backup restore, migration rollback decision | Not verified |
| Deployment and rollback | Immutable artifact deploy has health verification and safe rollback | Workflow/script review and YAML parse | Approved VPS preflight, rehearsal, backup restore, PM2/nginx/provider checks | Not verified live |
