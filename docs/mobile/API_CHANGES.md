# Additive mobile API and shared safeguards

Local development only; not deployed. Existing browser cookie and CSRF contracts remain in place. The session table migration has only been rehearsed in disposable PostgreSQL.

| Contract | Behavior |
| --- | --- |
| `POST /auth/mobile/login` | Staff-only phone/password/deviceName; returns access token, rotating refresh credential, sessionId and scoped identity/permissions; sets no cookies |
| `POST /auth/mobile/refresh` | Body refreshToken; single-use rotation, absolute expiry, replay revocation and active agent/tenant checks |
| `GET /auth/mobile/sessions` | Authenticated account/tenant-owned active device metadata; never hashes or credentials |
| `DELETE /auth/mobile/sessions/:id` | Independently revokes an owned device; indistinguishable 204 for unavailable/foreign ids |
| Native bearer/cookie boundary | Revocation applies before optional-identity workflows as well as normal staff middleware; refresh/builder/portal credentials cannot act as staff access tokens |
| `GET /api/tasks?page=&limit=` | Optional bounded pagination; existing unpaginated web response retained when absent; stable order and true total |
| `GET /api/projects?page=&limit=` / `GET /api/projects/:id?include_tasks=false` | Opt-in bounded stable pagination; omission retains legacy projects/total and scoped nested tasks. Scoped task counts exclude hidden tasks. Project descriptions validate nullable strings up to 20,000 characters. |
| `GET /api/calendar/appointments?mine=true&upcoming=true&page=&limit=` | Additive own-assignment and pending/upcoming filters plus optional bounded pagination; old appointments/count response retained |
| Inventory `formatted_price` | Server formats the already authorized/redacted price using the canonical formatter; no new mobile currency rules |
| `PATCH /api/leads/:phone/status` optional `expected_notes` | Existing notes updates remain valid; native notes writes send their observed base and receive 409 if the scoped row changed before the atomic write |

Appointment PATCH/DELETE now retain object scope through the write. PATCH validates existing fields/status/date/assignment, supports clearing notes and recalculates end time when duration or start changes. Existing browser field names and response shape remain.

Calendar detail/create/update nested property responses now use canonical `redactInventoryForStaff` with the existing team policy, retaining safe visit context and authorized own/uploaded/shared/super-boss exceptions. Task detail projects expose only `{ id, name }`, matching list/create/update, even when the project endpoint denies full access. Real-auth disclosure regressions and traced web/native callers are recorded in [CALENDAR_PRIVACY_EVIDENCE.md](CALENDAR_PRIVACY_EVIDENCE.md). Creation serialization shares the helper; legacy appointment creation/provider acceptance remains open.

Calendar detail/create/update assignee objects now expose only `id`, `name`, `email`, and `phone`, matching appointment lists; credential and provider configuration scalars are excluded. Malformed native bearer headers with additional components are rejected before optional-identity workflows.

Shared fixes: tenant/team/object/reference checks on generic tasks/projects and core CRM object routes; tenant-bounded catalogue/PDF generation; owning-team media writes; scoped private-document downloads; static paperwork denial; no builder demo OTP; partner tenant resolution from the current account; identifier-free routine request logging.

Native clients send credentials with explicit bearer headers and omit cookies. Refresh credentials stay in SecureStore; active access credentials remain in memory. Queries are scoped to tenant/account/role/session and cleared on identity change or logout. No automatic write/provider retry is introduced. A write timeout is an ambiguous outcome and must be reconciled before retrying. Attachments now require a successful explicit current-server check plus user review/confirmation before another upload POST; this client gate adds no server idempotency contract and cannot prevent every deliberate duplicate. See [ATTACHMENT_RECONCILIATION_EVIDENCE.md](ATTACHMENT_RECONCILIATION_EVIDENCE.md).

Lead-note drafts and new-task drafts use AES-256-GCM device files with a device-only SecureStore key. Associated data binds origin, tenant, account, role, native session and form. Drafts expire after 24 hours, remain bounded to 64 KiB plaintext, 80 files and two revisions per form, and purge with session data. They do not queue writes; submission still reaches the authorized backend online. Android encrypted-file/offline/process-death/conflict/create checks cover only these two draft surfaces on the corrected pre-SDK-patch development client; the native owner inspected 16 accepted pre-patch captures and excluded two diagnostics. Pre-patch discard, logout vault/key purge and other-session revoke→401 also passed; final patched-client acceptance remains pending. Assigned-record offline snapshots and task/project edit draft persistence remain open. See [DRAFT_EVIDENCE.md](DRAFT_EVIDENCE.md).

Other feature families retain their existing endpoints and need a separate source/security pass before native integration. See PARITY.md for every outstanding workflow rather than treating the new safeguards as whole-backend certification.


## Inventory parity, 2026-10-18

Inventory detail adds actions, can_access_documents, restricted_fields, customer_share_text, safe people references and actual relation counts. Explicit company content accepts media_urls/first_photo; batch requests accept per-property selections. Omitted selection preserves web defaults. Explicit results add per-item status/reason/provider identifiers and PDF outcome; signed brochures bind selected photos. Tenant/recipient/member/owner checks tightened on touched mutations, contacts/enrichment/batch paths. manage_inventory is explicitly super_boss-only. Bulk CSV uses actor tenant and canonical phone normalization and returns additive row outcomes. Dual prices are formatted as raw rupees independently of legacy price_unit. No schema migration. See INVENTORY_PARITY.md and INVENTORY_EVIDENCE.md.

Inventory visit creation also normalizes the contact phone, checks contact visibility/property tenant/active assignee and validates date/duration/notes before persistence or reminders; notes are now retained. Negative and positive real-auth creation probes pass.

Staff inventory responses also add separate server-formatted demand/display labels. CSV prices are validated before owner writes and converted once to canonical rupees, with row outcomes and corrected template examples.
