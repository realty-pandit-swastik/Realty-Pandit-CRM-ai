# Daily public portal sourcing — development setup

The backend supports transactional staff ingestion and a separate crawler process scheduled at **07:00 Asia/Kolkata**. All crawler sources are disabled by default. No real portal pilot has been performed. The three source adapters read public HTML links and JSON-LD only; a site without supported public listing data fails visibly and requires supervised adapter review. These are not verified production selectors or private portal API integrations. Existing 99acres/Magicbricks enquiry feeds remain separate.

## Prepare a disposable development environment

Review `20261003203000_portal_sourcing/migration.sql` against the target database before applying it. It adds candidate/run tables only. Generate Prisma after schema changes. Do not run blanket migration deployment against production drift. Production rollout requires the project's revision/migration reconciliation, reviewed backup and restore evidence.

Use a real active internal staff account with `edit_inventory` permission for the ingestion assignment. Set these names through secret configuration; never commit values:

```dotenv
PORTAL_INGESTION_TOKEN=<random secret of at least 32 characters>
PORTAL_INGESTION_TENANT_ID=<tenant id>
PORTAL_INGESTION_AGENT_ID=<active internal staff id>
PORTAL_INGESTION_SOURCES=99acres
PORTAL_INGESTION_URL=https://<your-api-host>/api/inventory/harvest/service
PORTAL_CRAWLER_ENABLED=false
PORTAL_SOURCE_99ACRES_ENABLED=false
PORTAL_SOURCE_MAGICBRICKS_ENABLED=false
PORTAL_SOURCE_HOUSING_ENABLED=false
PORTAL_CRAWL_TARGETS_FILE=<absolute path to reviewed JSON targets>
PORTAL_CRAWL_DELAY_MS=5000
PORTAL_CRAWL_MAX_LISTINGS=5
```

The service route accepts only a Bearer token. Tenant, assigned staff and allowed sources come from backend configuration; payloads cannot override them. Restrict access to the ingestion route to the crawler network when available. HTTPS is required except local loopback development. Do not point the crawler's token-bearing ingestion URL at a portal or untrusted server.

Create a local target JSON file (not a secrets file):

```json
[
  {
    "tenant_id": "<the configured tenant id>",
    "source": "99acres",
    "area": "<exact open Shortage Book area>",
    "url": "https://www.99acres.com/<reviewed-public-area-page>",
    "pilot_approved": false
  }
]
```

Targets are read fresh at each run. The process selects only configured areas with open shortages in the configured tenant. A valid URL alone is insufficient: review the public page, applicable robots rules and the source's operating constraints. Redirects, off-host links, authentication pages and access challenges are rejected; robots retrieval failures fail closed. Public requests have a minimum five-second gap, with longer advertised `Crawl-delay` values respected conservatively. Each run is capped at five listings by default (maximum twenty).

## Pilot one source at a time

Use an explicitly supervised development pilot with a reviewed public target, at most one listing and no real customer outreach. Enable the global switch, that source switch and the target's `pilot_approved` flag only for the pilot. Run from `agents/backend`:

```sh
npm run crawler:portals -- --once
```

Inspect `portal_crawl_runs` for `SUCCEEDED` or `FAILED`, acknowledgement counts and timestamps. Inspect `GET /api/inventory/harvest/candidates` as scoped staff (supports `page`, `limit`, `status`). Verify the extracted identity, location, price units, taxonomy and public seller provenance against the public page. A malformed listing, CAPTCHA, robots restriction, bad ingestion response or transport failure leaves the run failed; it cannot be marked successful or silently advanced. No checkpoint skips failed listings. Retry starts the bounded target again, relying on transactional listing deduplication.

Only after a 99acres pilot passes should its supervised target be approved for daily runs. Repeat separately for Magicbricks and Housing. Disable a source immediately if public structure changes, authentication is required, or an access challenge appears. No login, cookie reuse, private APIs, CAPTCHA solving or invented seller contact information.

For daily operation, run exactly one separate process with `npm run crawler:portals` (no PM2 cluster instances). It owns the 07:00 IST schedule and does not run inside API workers or portal enquiry pollers. A hard process kill can leave a `RUNNING` row; compare `started_at` with process evidence and classify it as interrupted before retry. A replay cannot duplicate inventory or verification tasks because the database transaction locks tenant/source/external identity and seller identity, with a unique candidate constraint.

## Staff workflow and owner outreach gate

`POST /api/inventory/harvest` retains staff ingestion. `source` and `source_ref` are required; supported sources are `99acres`, `magicbricks`, `housing`, `classifieds`, `portal_crawl`. `price_unit` is explicit (INR/rupees, lakh or crore). Seller phone is optional. No-phone listings remain candidates with their public data; they create no Contact, Owner, Inventory or phone task. Candidate refreshes retain the latest public observation. Staff can later ingest the same identity with a usable public seller number.

Listings with public seller details create a Contact/Owner relationship, a pending inventory record with a Property ID and one `PORTAL_HARVEST_VERIFICATION` task, in a single transaction. The Owner is pending verification, and inventory is `pending_approval`, excluded from available stock. Duplicate observations update freshness without overwriting staff inventory edits or generating tasks. Global phone identities belonging to another tenant are rejected. Harvested inventory cannot be cloned into active inventory.

Call the owner manually and record the human call:

```http
POST /api/inventory/harvest/<candidate-id>/owner-call
Content-Type: application/json

{"owner_called": true, "notes": "<availability, ownership and price verified during the human call>"}
```

Only authorized staff in the inventory's team can record it. This marks the verification task done and records staff/time/notes. It does not approve inventory. Finish normal inventory review and use the existing approval action; approval or activation fails until human-call evidence exists. Generic OTP verification is insufficient. `harvestedOwnerOutreachAllowed(tenantId, phone)` exposes this explicit gate to automated dispatch services; callers must check it before initiating outreach. Ingestion itself sends no owner WhatsApp or AI calls.

## Local verification and remaining rollout checks

Run `npx vitest run src/__tests__/inventory_harvest.test.ts src/__tests__/portal_harvest.test.ts src/__tests__/portal_crawler.test.ts` from `agents/backend`. Fixtures cover route authorization/CSRF compatibility, normalization, candidate retention, duplicate locking, scoped seller identity, failure acknowledgement, robots, public URL allowlists and source kill switches.

Mocked tests verify the transaction structure and lock ordering; they do not prove PostgreSQL lock behavior or rollback under real concurrent connections. Before rollout, use a disposable PostgreSQL database to submit the same external listing simultaneously and confirm one candidate/inventory/task and no partial rows on task failure. Also verify reviewed portal pages, overnight scheduling, candidate visibility, pending-stock exclusion and human-call approval in a development CRM. No production migration, real portal crawl, owner call or outreach was performed as part of implementation.
